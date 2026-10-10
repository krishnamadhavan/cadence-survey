import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { getAnonymityFloor } from "@/db/settings";
import { applyDueSurveySchedules } from "@/db/surveys";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import type { ChoiceOptions, QuestionType, ScaleOptions } from "@/db/schema";
import type { TenureBand } from "@/lib/employee-attributes";
import {
  MIN_TEAM_RESPONSES,
  SUPPRESSED_TEAM_KEY,
  SUPPRESSED_TEAM_NAME,
  planCombinedSegment,
  planTeamPublish,
  teamPublishKey,
  type TeamPublishPlan,
} from "@/lib/min-cell";
import { parseReportSlice, type ReportSlice } from "@/lib/report-slice";
import {
  collectPublishedComments,
  type WrittenComment,
} from "@/lib/comments";

export { MIN_TEAM_RESPONSES, SUPPRESSED_TEAM_NAME } from "@/lib/min-cell";
export { normalizeReportRole, parseReportSlice } from "@/lib/report-slice";

const UNASSIGNED = "Unassigned";
const LOW_THRESHOLD = 3;
const WATCH_THRESHOLD = 3.5;

export type TeamHealth = "ok" | "watch" | "low";

export type TeamQuestionScale = {
  teamId: string | null;
  teamName: string;
  average: number | null;
  count: number;
};

export type TeamQuestionChoice = {
  teamId: string | null;
  teamName: string;
  count: number;
  counts: Record<string, number>;
};

export type QuestionResults = {
  id: string;
  prompt: string;
  type: QuestionType;
  position: number;
  scale: {
    min: number;
    max: number;
    average: number | null;
    count: number;
    byTeam: TeamQuestionScale[];
  } | null;
  choice: {
    options: string[];
    count: number;
    counts: Record<string, number>;
    byTeam: TeamQuestionChoice[];
  } | null;
  text: {
    count: number;
  } | null;
};

export type TeamSummary = {
  teamId: string | null;
  teamName: string;
  responseCount: number;
  averageScore: number | null;
  health: TeamHealth;
};

export type RoleSegmentVisibility =
  | "all"
  | "empty"
  | "hidden"
  | "withheld"
  | "shown";

export type SurveyResults = {
  survey: {
    id: string;
    title: string;
    publicToken: string;
    status: string;
    opensAt: string | null;
    closesAt: string | null;
    cadence: "weekly" | "biweekly" | "monthly" | null;
    responseCount: number;
    averageScore: number | null;
  };
  teams: TeamSummary[];
  questions: QuestionResults[];
  /** Null means every role, including responses that have no role snapshot. */
  role: string | null;
  /** Null means every team. Set only when the report is filtered to one team. */
  teamId: string | null;
  teamName: string | null;
  /** Null means every tenure band, including responses stored before tenure was snapshotted. */
  tenure: TenureBand | null;
  /** How the active slice (role, team, tenure, or all of them) may be published. */
  roleVisibility: RoleSegmentVisibility;
};

function anonymityMinimum(configured: number): number {
  return Number.isInteger(configured) && configured >= MIN_TEAM_RESPONSES
    ? configured
    : MIN_TEAM_RESPONSES;
}

/** A passed floor wins. Otherwise read the shared workspace setting. */
async function resolveAnonymityFloor(floor: number | undefined): Promise<number> {
  if (
    typeof floor === "number" &&
    Number.isInteger(floor) &&
    floor >= MIN_TEAM_RESPONSES
  ) {
    return floor;
  }
  return anonymityMinimum(await getAnonymityFloor());
}

type SegmentDecision =
  | { visibility: "empty" | "hidden" | "withheld"; plan: null }
  | { visibility: "all" | "shown"; plan: TeamPublishPlan };

type ResponseAttribute = {
  teamId: string | null;
  role: string | null;
  tenureBand: TenureBand | null;
};

type SliceFilter = {
  teamId: string | null;
  role: string | null;
  tenure: TenureBand | null;
};

/**
 * Unfiltered reports use planTeamPublish. A filtered report compares the
 * slice with every coarser filter the admin can also open, so a gap of
 * 1..floor-1 is not published as its own total, team row, or comment set.
 */
async function publishPlanForSurvey(
  surveyId: string,
  slice: ReportSlice,
  floor: number,
  sliceCounts: Map<string, number>,
): Promise<SegmentDecision> {
  if (slice.unmatched) {
    return { visibility: "empty", plan: null };
  }
  if (!slice.teamId && !slice.role && !slice.tenure) {
    return {
      visibility: "all",
      plan: planTeamPublish(
        [...sliceCounts.entries()].map(([key, n]) => ({ key, count: n })),
        floor,
      ),
    };
  }

  const sliceTotal = [...sliceCounts.values()].reduce((sum, n) => sum + n, 0);
  if (sliceTotal === 0) {
    return { visibility: "empty", plan: null };
  }
  if (sliceTotal < floor) {
    return { visibility: "hidden", plan: null };
  }

  const attributes = await loadResponseAttributes(surveyId);
  const parents = coarserFilters(slice);
  const segment = planCombinedSegment(
    [...sliceCounts.entries()]
      .filter(([, count]) => count > 0)
      .map(([key, sliceCount]) => ({
        key,
        sliceCount,
        parents: parents.map((filter) => countOnTeam(attributes, key, filter)),
      })),
    parents.map((filter) => countMatching(attributes, filter)),
    sliceTotal,
    floor,
  );
  if (segment.hideSlice) {
    return { visibility: "withheld", plan: null };
  }
  return {
    visibility: "shown",
    plan: {
      namedKeys: segment.namedKeys,
      suppressedKeys: segment.suppressedKeys,
      showSuppressedBucket: segment.showSuppressedBucket,
    },
  };
}

async function loadResponseAttributes(surveyId: string): Promise<ResponseAttribute[]> {
  return db
    .select({
      teamId: responses.teamId,
      role: responses.role,
      tenureBand: responses.tenureBand,
    })
    .from(responses)
    .where(eq(responses.surveyId, surveyId));
}

function coarserFilters(slice: SliceFilter): SliceFilter[] {
  const dims: Array<"team" | "role" | "tenure"> = [];
  if (slice.teamId) {
    dims.push("team");
  }
  if (slice.role) {
    dims.push("role");
  }
  if (slice.tenure) {
    dims.push("tenure");
  }
  const filters: SliceFilter[] = [];
  const full = (1 << dims.length) - 1;
  for (let mask = 0; mask < full; mask += 1) {
    const filter: SliceFilter = { teamId: null, role: null, tenure: null };
    dims.forEach((dim, index) => {
      if ((mask & (1 << index)) === 0) {
        return;
      }
      if (dim === "team") {
        filter.teamId = slice.teamId;
      }
      if (dim === "role") {
        filter.role = slice.role;
      }
      if (dim === "tenure") {
        filter.tenure = slice.tenure;
      }
    });
    filters.push(filter);
  }
  return filters;
}

function countMatching(rows: ResponseAttribute[], filter: SliceFilter): number {
  let total = 0;
  for (const row of rows) {
    if (filter.teamId && row.teamId !== filter.teamId) {
      continue;
    }
    if (filter.role && row.role !== filter.role) {
      continue;
    }
    if (filter.tenure && row.tenureBand !== filter.tenure) {
      continue;
    }
    total += 1;
  }
  return total;
}

function countOnTeam(
  rows: ResponseAttribute[],
  teamKey: string,
  filter: SliceFilter,
): number {
  let total = 0;
  for (const row of rows) {
    if (teamPublishKey(row.teamId) !== teamKey) {
      continue;
    }
    if (filter.role && row.role !== filter.role) {
      continue;
    }
    if (filter.tenure && row.tenureBand !== filter.tenure) {
      continue;
    }
    total += 1;
  }
  return total;
}

function surveyResponsesWhere(surveyId: string, slice: ReportSlice) {
  const filters = [eq(responses.surveyId, surveyId)];
  if (slice.teamId) {
    filters.push(eq(responses.teamId, slice.teamId));
  }
  if (slice.role) {
    filters.push(eq(responses.role, slice.role));
  }
  if (slice.tenure) {
    filters.push(eq(responses.tenureBand, slice.tenure));
  }
  return and(...filters);
}

async function lookupTeamName(teamId: string | null): Promise<string | null> {
  if (!teamId) {
    return null;
  }
  const [team] = await db
    .select({ name: teams.name })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return team?.name ?? null;
}

function sliceFromOptions(options?: {
  role?: string | null;
  teamId?: string | null;
  tenure?: string | null;
}): ReportSlice {
  return parseReportSlice({
    teamId: options?.teamId,
    role: options?.role,
    tenure: options?.tenure,
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return round1(values.reduce((sum, n) => sum + n, 0) / values.length);
}

function healthFor(avg: number | null): TeamHealth {
  if (avg === null) {
    return "ok";
  }
  if (avg < LOW_THRESHOLD) {
    return "low";
  }
  if (avg < WATCH_THRESHOLD) {
    return "watch";
  }
  return "ok";
}

function numericValue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function stringValue(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "number") {
    return String(raw);
  }
  return "";
}

function sortScaleTeams(rows: TeamQuestionScale[]): TeamQuestionScale[] {
  return [...rows].sort((a, b) => {
    if (a.teamId === SUPPRESSED_TEAM_KEY) {
      return 1;
    }
    if (b.teamId === SUPPRESSED_TEAM_KEY) {
      return -1;
    }
    return (a.average ?? 99) - (b.average ?? 99);
  });
}

function publishScaleTeams(
  byTeamValues: Map<
    string,
    { teamId: string | null; teamName: string; values: number[] }
  >,
  namedKeys: Set<string>,
  suppressedKeys: Set<string>,
  showSuppressedBucket: boolean,
): TeamQuestionScale[] {
  const published: TeamQuestionScale[] = [];
  const folded: number[] = [];

  for (const [key, bucket] of byTeamValues) {
    if (namedKeys.has(key)) {
      published.push({
        teamId: bucket.teamId,
        teamName: bucket.teamName,
        average: average(bucket.values),
        count: bucket.values.length,
      });
      continue;
    }
    if (showSuppressedBucket && suppressedKeys.has(key)) {
      folded.push(...bucket.values);
    }
  }

  if (showSuppressedBucket && folded.length > 0) {
    published.push({
      teamId: SUPPRESSED_TEAM_KEY,
      teamName: SUPPRESSED_TEAM_NAME,
      average: average(folded),
      count: folded.length,
    });
  }

  return sortScaleTeams(published);
}

function publishChoiceTeams(
  byTeamMap: Map<
    string,
    {
      teamId: string | null;
      teamName: string;
      counts: Record<string, number>;
      count: number;
    }
  >,
  namedKeys: Set<string>,
  suppressedKeys: Set<string>,
  showSuppressedBucket: boolean,
  options: string[],
): TeamQuestionChoice[] {
  const published: TeamQuestionChoice[] = [];
  const foldedCounts: Record<string, number> = Object.fromEntries(
    options.map((option) => [option, 0]),
  );
  let foldedCount = 0;

  for (const [key, bucket] of byTeamMap) {
    if (namedKeys.has(key)) {
      published.push(bucket);
      continue;
    }
    if (showSuppressedBucket && suppressedKeys.has(key)) {
      foldedCount += bucket.count;
      for (const option of Object.keys(bucket.counts)) {
        foldedCounts[option] = (foldedCounts[option] ?? 0) + bucket.counts[option];
      }
    }
  }

  published.sort((a, b) => a.teamName.localeCompare(b.teamName));

  if (showSuppressedBucket && foldedCount > 0) {
    published.push({
      teamId: SUPPRESSED_TEAM_KEY,
      teamName: SUPPRESSED_TEAM_NAME,
      counts: foldedCounts,
      count: foldedCount,
    });
  }

  return published;
}

function emptyQuestion(question: {
  id: string;
  prompt: string;
  type: QuestionType;
  options: unknown;
  position: number;
}): QuestionResults {
  if (question.type === "scale") {
    const options = question.options as ScaleOptions | null;
    return {
      id: question.id,
      prompt: question.prompt,
      type: question.type,
      position: question.position,
      scale: {
        min: options?.min ?? 1,
        max: options?.max ?? 5,
        average: null,
        count: 0,
        byTeam: [],
      },
      choice: null,
      text: null,
    };
  }

  if (question.type === "choice") {
    const options = (question.options as ChoiceOptions | null)?.choices ?? [];
    return {
      id: question.id,
      prompt: question.prompt,
      type: question.type,
      position: question.position,
      scale: null,
      choice: {
        options,
        count: 0,
        counts: Object.fromEntries(options.map((option) => [option, 0])),
        byTeam: [],
      },
      text: null,
    };
  }

  return {
    id: question.id,
    prompt: question.prompt,
    type: question.type,
    position: question.position,
    scale: null,
    choice: null,
    text: { count: 0 },
  };
}

function redactedSurveyResults(
  survey: {
    id: string;
    title: string;
    publicToken: string;
    status: string;
    opensAt: Date | null;
    closesAt: Date | null;
    cadence: "weekly" | "biweekly" | "monthly" | null;
  },
  surveyQuestions: Parameters<typeof emptyQuestion>[0][],
  slice: ReportSlice,
  teamName: string | null,
  roleVisibility: "empty" | "hidden" | "withheld",
): SurveyResults {
  return {
    survey: {
      id: survey.id,
      title: survey.title,
      publicToken: survey.publicToken,
      status: survey.status,
      opensAt: survey.opensAt?.toISOString() ?? null,
      closesAt: survey.closesAt?.toISOString() ?? null,
      cadence: survey.cadence,
      responseCount: 0,
      averageScore: null,
    },
    teams: [],
    questions: surveyQuestions.map((question) => emptyQuestion(question)),
    role: slice.role,
    teamId: slice.teamId,
    teamName,
    tenure: slice.tenure,
    roleVisibility,
  };
}

export async function getSurveyResults(
  token: string,
  options?: {
    role?: string | null;
    teamId?: string | null;
    tenure?: string | null;
    floor?: number;
    // The close webhook already committed status and must not run the scheduler again.
    skipSchedule?: boolean;
  },
): Promise<SurveyResults | null> {
  if (!options?.skipSchedule) {
    await applyDueSurveySchedules();
  }
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.publicToken, token))
    .limit(1);

  if (!survey) {
    return null;
  }

  const surveyQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.surveyId, survey.id))
    .orderBy(asc(questions.position));

  const slice = sliceFromOptions(options);
  const teamName = await lookupTeamName(slice.teamId);
  if (slice.unmatched) {
    return redactedSurveyResults(survey, surveyQuestions, slice, teamName, "empty");
  }

  const rows = await db
    .select({
      responseId: responses.id,
      teamId: teams.id,
      teamName: teams.name,
      questionId: questions.id,
      questionType: questions.type,
      value: answers.value,
    })
    .from(responses)
    .leftJoin(teams, eq(responses.teamId, teams.id))
    .leftJoin(answers, eq(answers.responseId, responses.id))
    .leftJoin(questions, eq(answers.questionId, questions.id))
    .where(surveyResponsesWhere(survey.id, slice));

  const responseMeta = new Map<
    string,
    { teamId: string | null; teamName: string }
  >();
  for (const row of rows) {
    if (!responseMeta.has(row.responseId)) {
      responseMeta.set(row.responseId, {
        teamId: row.teamId,
        teamName: row.teamName ?? UNASSIGNED,
      });
    }
  }

  const teamResponseIds = new Map<string, Set<string>>();
  const teamScaleValues = new Map<string, number[]>();
  const allScaleValues: number[] = [];

  for (const [responseId, meta] of responseMeta) {
    const key = teamPublishKey(meta.teamId);
    const set = teamResponseIds.get(key) ?? new Set<string>();
    set.add(responseId);
    teamResponseIds.set(key, set);
  }

  const floor = await resolveAnonymityFloor(options?.floor);
  const sliceCounts = new Map(
    [...teamResponseIds.entries()].map(([key, ids]) => [key, ids.size]),
  );
  const decision = await publishPlanForSurvey(survey.id, slice, floor, sliceCounts);
  if (!decision.plan) {
    return redactedSurveyResults(
      survey,
      surveyQuestions,
      slice,
      teamName,
      decision.visibility,
    );
  }

  const publishPlan = decision.plan;
  const namedKeys = new Set(publishPlan.namedKeys);
  const suppressedKeys = new Set(publishPlan.suppressedKeys);

  const answersByQuestion = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.questionId) {
      continue;
    }
    const list = answersByQuestion.get(row.questionId) ?? [];
    list.push(row);
    answersByQuestion.set(row.questionId, list);
  }

  const questionResults: QuestionResults[] = surveyQuestions.map((question) => {
    const questionRows = answersByQuestion.get(question.id) ?? [];

    if (question.type === "scale") {
      const options = question.options as ScaleOptions | null;
      const min = options?.min ?? 1;
      const max = options?.max ?? 5;
      const values: number[] = [];
      const byTeamValues = new Map<
        string,
        { teamId: string | null; teamName: string; values: number[] }
      >();

      for (const row of questionRows) {
        const n = numericValue(row.value?.value);
        if (n === null) {
          continue;
        }
        values.push(n);
        allScaleValues.push(n);
        const key = teamPublishKey(row.teamId);
        const bucket = byTeamValues.get(key) ?? {
          teamId: row.teamId,
          teamName: row.teamName ?? UNASSIGNED,
          values: [],
        };
        bucket.values.push(n);
        byTeamValues.set(key, bucket);
        const teamScores = teamScaleValues.get(key) ?? [];
        teamScores.push(n);
        teamScaleValues.set(key, teamScores);
      }

      const byTeam = publishScaleTeams(byTeamValues, namedKeys, suppressedKeys, publishPlan.showSuppressedBucket);

      return {
        id: question.id,
        prompt: question.prompt,
        type: question.type,
        position: question.position,
        scale: {
          min,
          max,
          average: average(values),
          count: values.length,
          byTeam,
        },
        choice: null,
        text: null,
      };
    }

    if (question.type === "choice") {
      const options = (question.options as ChoiceOptions | null)?.choices ?? [];
      const counts: Record<string, number> = Object.fromEntries(
        options.map((option) => [option, 0]),
      );
      const byTeamMap = new Map<
        string,
        { teamId: string | null; teamName: string; counts: Record<string, number>; count: number }
      >();

      for (const row of questionRows) {
        const choice = stringValue(row.value?.value);
        if (!choice) {
          continue;
        }
        counts[choice] = (counts[choice] ?? 0) + 1;
        const key = teamPublishKey(row.teamId);
        const bucket = byTeamMap.get(key) ?? {
          teamId: row.teamId,
          teamName: row.teamName ?? UNASSIGNED,
          counts: Object.fromEntries(options.map((option) => [option, 0])),
          count: 0,
        };
        bucket.counts[choice] = (bucket.counts[choice] ?? 0) + 1;
        bucket.count += 1;
        byTeamMap.set(key, bucket);
      }

      return {
        id: question.id,
        prompt: question.prompt,
        type: question.type,
        position: question.position,
        scale: null,
        choice: {
          options,
          count: questionRows.length,
          counts,
          byTeam: publishChoiceTeams(
            byTeamMap,
            namedKeys,
            suppressedKeys,
            publishPlan.showSuppressedBucket,
            options,
          ),
        },
        text: null,
      };
    }

    return {
      id: question.id,
      prompt: question.prompt,
      type: question.type,
      position: question.position,
      scale: null,
      choice: null,
      text: { count: questionRows.length },
    };
  });

  const identityByKey = new Map<string, { teamId: string | null; teamName: string }>();
  for (const meta of responseMeta.values()) {
    const key = teamPublishKey(meta.teamId);
    if (!identityByKey.has(key)) {
      identityByKey.set(key, {
        teamId: meta.teamId,
        teamName: meta.teamName,
      });
    }
  }

  const teamSummaries: TeamSummary[] = [];

  for (const key of publishPlan.namedKeys) {
    const identity = identityByKey.get(key);
    const avg = average(teamScaleValues.get(key) ?? []);
    teamSummaries.push({
      teamId: identity?.teamId ?? (key === "unassigned" ? null : key),
      teamName: identity?.teamName ?? UNASSIGNED,
      responseCount: teamResponseIds.get(key)?.size ?? 0,
      averageScore: avg,
      health: healthFor(avg),
    });
  }

  teamSummaries.sort((a, b) => {
    if (a.averageScore === null && b.averageScore === null) {
      return a.teamName.localeCompare(b.teamName);
    }
    if (a.averageScore === null) {
      return 1;
    }
    if (b.averageScore === null) {
      return -1;
    }
    return a.averageScore - b.averageScore;
  });

  if (publishPlan.showSuppressedBucket) {
    const foldedValues = publishPlan.suppressedKeys.flatMap(
      (key) => teamScaleValues.get(key) ?? [],
    );
    const foldedCount = publishPlan.suppressedKeys.reduce(
      (sum, key) => sum + (teamResponseIds.get(key)?.size ?? 0),
      0,
    );
    const avg = average(foldedValues);
    teamSummaries.push({
      teamId: SUPPRESSED_TEAM_KEY,
      teamName: SUPPRESSED_TEAM_NAME,
      responseCount: foldedCount,
      averageScore: avg,
      health: healthFor(avg),
    });
  }

  return {
    survey: {
      id: survey.id,
      title: survey.title,
      publicToken: survey.publicToken,
      status: survey.status,
      opensAt: survey.opensAt?.toISOString() ?? null,
      closesAt: survey.closesAt?.toISOString() ?? null,
      cadence: survey.cadence,
      responseCount: responseMeta.size,
      averageScore: average(allScaleValues),
    },
    teams: teamSummaries,
    questions: questionResults,
    role: slice.role,
    teamId: slice.teamId,
    teamName,
    tenure: slice.tenure,
    roleVisibility: decision.visibility,
  };
}

export async function getPublishedComments(
  token: string,
  options?: {
    role?: string | null;
    teamId?: string | null;
    tenure?: string | null;
    floor?: number;
  },
): Promise<WrittenComment[] | null> {
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.publicToken, token))
    .limit(1);

  if (!survey) {
    return null;
  }

  const slice = sliceFromOptions(options);
  if (slice.unmatched) {
    return [];
  }

  const rows = await db
    .select({
      responseId: responses.id,
      teamId: teams.id,
      teamName: teams.name,
      questionType: questions.type,
      prompt: questions.prompt,
      value: answers.value,
    })
    .from(responses)
    .leftJoin(teams, eq(responses.teamId, teams.id))
    .leftJoin(answers, eq(answers.responseId, responses.id))
    .leftJoin(questions, eq(answers.questionId, questions.id))
    .where(surveyResponsesWhere(survey.id, slice));

  const teamResponseIds = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = teamPublishKey(row.teamId);
    const set = teamResponseIds.get(key) ?? new Set<string>();
    set.add(row.responseId);
    teamResponseIds.set(key, set);
  }

  const floor = await resolveAnonymityFloor(options?.floor);
  const sliceCounts = new Map(
    [...teamResponseIds.entries()].map(([key, ids]) => [key, ids.size]),
  );
  const decision = await publishPlanForSurvey(survey.id, slice, floor, sliceCounts);
  if (!decision.plan) {
    return [];
  }
  const plan = decision.plan;

  const drafts: {
    question: string;
    teamKey: string;
    teamName: string;
    text: string;
  }[] = [];
  for (const row of rows) {
    if (row.questionType !== "text") {
      continue;
    }
    const text = stringValue(row.value?.value).trim();
    if (!text) {
      continue;
    }
    drafts.push({
      question: row.prompt ?? "",
      teamKey: teamPublishKey(row.teamId),
      teamName: row.teamName ?? UNASSIGNED,
      text,
    });
  }

  return collectPublishedComments(drafts, plan);
}
