import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { answers, employees, questions, responses, surveys } from "@/db/schema";
import type { AnswerValue, SurveyStatus } from "@/db/schema";
import { pickPreviousCycle } from "@/db/reports-cycle";
import { getSurveyResults, type SurveyResults } from "@/db/results";

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
};

export async function countEmployees() {
  const [row] = await db.select({ value: count() }).from(employees);
  return row?.value ?? 0;
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
): Promise<SurveyReportDetail | null> {
  const [surveys, employeeCount] = await Promise.all([
    listReportSurveys(),
    countEmployees(),
  ]);
  const selected = surveys.find((survey) => survey.publicToken === token);
  if (!selected) {
    return null;
  }

  const { cycles, previous } = pickPreviousCycle(surveys, selected.publicToken);
  const [results, previousResults] = await Promise.all([
    getSurveyResults(selected.publicToken),
    previous ? getSurveyResults(previous.publicToken) : Promise.resolve(null),
  ]);
  if (!results) {
    return null;
  }

  return {
    surveys,
    cycles,
    selected,
    previous,
    results,
    previousResults,
    employeeCount,
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
