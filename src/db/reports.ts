import { count, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, surveys } from "@/db/schema";
import type { SurveyStatus } from "@/db/schema";
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
  const [rows, employeeCount] = await Promise.all([
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
  ]);

  return Promise.all(
    rows.map(async (row) => {
      const results = await getSurveyResults(row.publicToken);
      const responseCount = results?.survey.responseCount ?? 0;
      return {
        id: row.id,
        title: row.title,
        publicToken: row.publicToken,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        responseCount,
        averageScore: results?.survey.averageScore ?? null,
        participation:
          employeeCount > 0
            ? Math.min(100, Math.round((responseCount / employeeCount) * 100))
            : null,
      };
    }),
  );
}

export async function getSurveyReportDetail(
  token: string,
): Promise<SurveyReportDetail | null> {
  const [surveys, employeeCount] = await Promise.all([
    listReportSurveys(),
    countEmployees(),
  ]);
  const index = surveys.findIndex((survey) => survey.publicToken === token);
  const selected = surveys[index];
  if (!selected) {
    return null;
  }

  const previous = surveys[index + 1] ?? null;
  const [results, previousResults] = await Promise.all([
    getSurveyResults(selected.publicToken),
    previous ? getSurveyResults(previous.publicToken) : Promise.resolve(null),
  ]);
  if (!results) {
    return null;
  }

  return {
    surveys,
    selected,
    previous,
    results,
    previousResults,
    employeeCount,
  };
}
