import { and, asc, count, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { answers, employees, questions, responses, surveys, teams } from "@/db/schema";
import type { AnswerValue, SurveyStatus } from "@/db/schema";
import type { TenureBand } from "@/lib/employee-attributes";
import { pickPreviousCycle } from "@/db/reports-cycle";
import {
  getSurveyResults,
  parseReportSlice,
  type SurveyResults,
} from "@/db/results";

export type ReportListItem = {
  id: string;
  title: string;
  publicToken: string;
  status: SurveyStatus;
  createdAt: string;
  responseCount: number;
  averageScore: number | null;
  participation: number | null;
};

export type SurveyReportDetail = {
  surveys: ReportListItem[];
  cycles: ReportListItem[];
  selected: ReportListItem;
  previous: ReportListItem | null;
  results: SurveyResults;
  previousResults: SurveyResults | null;
  employeeCount: number;
  role: string | null;
  teamId: string | null;
  teamName: string | null;
  tenure: TenureBand | null;
  teams: { id: string; name: string }[];
  roles: string[];
};

export async function countEmployees(segment?: {
  teamId?: string | null;
  role?: string | null;
  tenure?: TenureBand | null;
}) {
  const filters = [];
  if (segment?.teamId) {
    filters.push(eq(employees.teamId, segment.teamId));
  }
  if (segment?.role) {
    filters.push(eq(employees.role, segment.role));
  }
  if (segment?.tenure) {
    filters.push(eq(employees.tenureBand, segment.tenure));
  }
  const [row] = await db
    .select({ value: count() })
    .from(employees)
    .where(filters.length > 0 ? and(...filters) : undefined);
  return row?.value ?? 0;
}

export async function listSegmentRoles(): Promise<string[]> {
  const [roster, snapshots] = await Promise.all([
    db
      .selectDistinct({ role: employees.role })
      .from(employees)
      .where(isNotNull(employees.role)),
    db
      .selectDistinct({ role: responses.role })
      .from(responses)
      .where(isNotNull(responses.role)),
  ]);
  const roles = new Set<string>();
  for (const row of [...roster, ...snapshots]) {
    if (row.role) {
      roles.add(row.role);
    }
  }
  return [...roles].sort((a, b) => a.localeCompare(b));
}

export async function listReportSurveys(): Promise<ReportListItem[]> {
  const [rows, employeeCount, responseRows, scaleRows] = await Promise.all([
    db
      .select({
        id: surveys.id,
        title: surveys.title,
        publicToken: surveys.publicToken,
        status: surveys.status,
        createdAt: surveys.createdAt,
      })
      .from(surveys)
      .orderBy(desc(surveys.createdAt)),
    countEmployees(),
    db
      .select({
        surveyId: responses.surveyId,
        n: count(),
      })
      .from(responses)
      .groupBy(responses.surveyId),
    db
      .select({
        surveyId: questions.surveyId,
        value: answers.value,
      })
      .from(answers)
      .innerJoin(questions, eq(answers.questionId, questions.id))
      .where(eq(questions.type, "scale")),
  ]);

  const responsesBySurvey = new Map(
    responseRows.map((row) => [row.surveyId, Number(row.n)]),
  );
  const scaleValues = new Map<string, number[]>();
  for (const row of scaleRows) {
    const n = numericValue(row.value);
    if (n === null) {
      continue;
    }
    const list = scaleValues.get(row.surveyId) ?? [];
    list.push(n);
    scaleValues.set(row.surveyId, list);
  }

  return rows.map((row) => {
    const responseCount = responsesBySurvey.get(row.id) ?? 0;
    return {
      id: row.id,
      title: row.title,
      publicToken: row.publicToken,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      responseCount,
      averageScore: average(scaleValues.get(row.id) ?? []),
      participation:
        employeeCount > 0
          ? Math.min(100, Math.round((responseCount / employeeCount) * 100))
          : null,
    };
  });
}

export async function getSurveyReportDetail(
  token: string,
  segmentInput?:
    | string
    | {
        teamId?: string | null;
        role?: string | null;
        tenure?: string | null;
      }
    | null,
  floor?: number,
): Promise<SurveyReportDetail | null> {
  const raw =
    typeof segmentInput === "string" || segmentInput == null
      ? { role: segmentInput }
      : segmentInput;
  const slice = parseReportSlice(raw);
  const [surveyRows, employeeCount, roles, teamRows] = await Promise.all([
    listReportSurveys(),
    slice.unmatched
      ? Promise.resolve(0)
      : countEmployees({
          teamId: slice.teamId,
          role: slice.role,
          tenure: slice.tenure,
        }),
    listSegmentRoles(),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .orderBy(asc(teams.name)),
  ]);
  const selected = surveyRows.find((survey) => survey.publicToken === token);
  if (!selected) {
    return null;
  }

  const segmentOptions = {
    teamId: raw.teamId,
    role: raw.role,
    tenure: raw.tenure,
    floor,
  };
  const { cycles, previous } = pickPreviousCycle(surveyRows, selected.publicToken);
  const [results, previousResults] = await Promise.all([
    getSurveyResults(selected.publicToken, segmentOptions),
    previous
      ? getSurveyResults(previous.publicToken, segmentOptions)
      : Promise.resolve(null),
  ]);
  if (!results) {
    return null;
  }

  const segmented = Boolean(
    slice.teamId || slice.role || slice.tenure || slice.unmatched,
  );
  const cycleRows = segmented
    ? await Promise.all(
        cycles.map(async (cycle) => {
          const cycleResults =
            cycle.publicToken === selected.publicToken
              ? results
              : cycle.publicToken === previous?.publicToken
                ? previousResults
                : await getSurveyResults(cycle.publicToken, segmentOptions);
          return roleCycle(cycle, cycleResults, employeeCount);
        }),
      )
    : cycles;

  return {
    surveys: surveyRows,
    cycles: cycleRows,
    selected,
    previous,
    results,
    previousResults,
    employeeCount,
    role: results.role,
    teamId: results.teamId,
    teamName: results.teamName,
    tenure: results.tenure,
    teams: teamRows,
    roles,
  };
}

function roleCycle(
  cycle: ReportListItem,
  result: SurveyResults | null,
  employeeCount: number,
): ReportListItem {
  if (
    !result ||
    result.roleVisibility === "hidden" ||
    result.roleVisibility === "empty" ||
    result.roleVisibility === "withheld"
  ) {
    return {
      ...cycle,
      responseCount: 0,
      averageScore: null,
      participation: null,
    };
  }

  const responseCount = result.survey.responseCount;
  return {
    ...cycle,
    responseCount,
    averageScore: result.survey.averageScore,
    participation:
      employeeCount > 0
        ? Math.min(100, Math.round((responseCount / employeeCount) * 100))
        : null,
  };
}

function numericValue(raw: AnswerValue | null | undefined): number | null {
  const value = raw?.value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
}
