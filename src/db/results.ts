import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import type { ChoiceOptions, QuestionType, ScaleOptions } from "@/db/schema";
import {
  SUPPRESSED_TEAM_KEY,
  SUPPRESSED_TEAM_NAME,
  planTeamPublish,
  teamPublishKey,
} from "@/lib/min-cell";
import {
  collectPublishedComments,
  type WrittenComment,
} from "@/lib/comments";

export { MIN_TEAM_RESPONSES, SUPPRESSED_TEAM_NAME } from "@/lib/min-cell";

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

export type SurveyResults = {
  survey: {
    id: string;
    title: string;
    publicToken: string;
    status: string;
    responseCount: number;
    averageScore: number | null;
  };
  teams: TeamSummary[];
  questions: QuestionResults[];
};

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

export async function getSurveyResults(
  token: string,
): Promise<SurveyResults | null> {
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
    .where(eq(responses.surveyId, survey.id));

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

  const publishPlan = planTeamPublish(
    [...teamResponseIds.entries()].map(([key, ids]) => ({
      key,
      count: ids.size,
    })),
  );
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
      responseCount: responseMeta.size,
      averageScore: average(allScaleValues),
    },
    teams: teamSummaries,
    questions: questionResults,
  };
}

export async function getPublishedComments(
  token: string,
): Promise<WrittenComment[] | null> {
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.publicToken, token))
    .limit(1);

  if (!survey) {
    return null;
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
    .where(eq(responses.surveyId, survey.id));

  const teamResponseIds = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = teamPublishKey(row.teamId);
    const set = teamResponseIds.get(key) ?? new Set<string>();
    set.add(row.responseId);
    teamResponseIds.set(key, set);
  }

  const plan = planTeamPublish(
    [...teamResponseIds.entries()].map(([key, ids]) => ({
      key,
      count: ids.size,
    })),
  );

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
