import { count } from "drizzle-orm";
import { db } from "@/db/client";
import { arrangeDashboardSurveys } from "@/db/dashboard-select";
import { employees, teams } from "@/db/schema";
import { listSurveysForAdmin } from "@/db/queries";
import { getSurveyResults, type SurveyResults } from "@/db/results";

export type DashboardSurvey = Awaited<
  ReturnType<typeof listSurveysForAdmin>
>[number];

export type DashboardSnapshot = {
  employeeCount: number;
  teamCount: number;
  surveys: DashboardSurvey[];
  openCount: number;
  active: SurveyResults | null;
};

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [surveys, employeeCount, teamCount] = await Promise.all([
    listSurveysForAdmin(),
    countRows(employees),
    countRows(teams),
  ]);

  const { newestFirst, featured } = arrangeDashboardSurveys(surveys);
  const active = featured
    ? await getSurveyResults(featured.publicToken)
    : null;

  return {
    employeeCount,
    teamCount,
    surveys: newestFirst,
    openCount: surveys.filter((survey) => survey.status === "open").length,
    active,
  };
}

async function countRows(table: typeof employees | typeof teams) {
  const [row] = await db.select({ value: count() }).from(table);
  return row?.value ?? 0;
}
