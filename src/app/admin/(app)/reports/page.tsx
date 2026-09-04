import { listReportSurveys } from "@/db/reports";
import { ReportsTable } from "./reports-table";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  let surveys: Awaited<ReturnType<typeof listReportSurveys>> = [];
  let dbError = false;

  try {
    surveys = await listReportSurveys();
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <header>
        <h1 className="font-serif text-4xl text-ink">Reports</h1>
        <p className="mt-2 text-ink/60">
          Browse pulses, then open a row for scores, teams, and export.
        </p>
      </header>
      <ReportsTable surveys={surveys} dbError={dbError} />
    </div>
  );
}
