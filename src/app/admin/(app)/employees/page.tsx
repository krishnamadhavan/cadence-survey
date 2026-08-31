import { listEmployees } from "@/db/employees";
import { listTeams } from "@/db/queries";
import { EmployeesPanel } from "./employees-panel";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  let people: Awaited<ReturnType<typeof listEmployees>> = [];
  let teams: Awaited<ReturnType<typeof listTeams>> = [];
  let dbError = false;

  try {
    people = await listEmployees();
    teams = await listTeams();
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <EmployeesPanel people={people} teams={teams} dbError={dbError} />
    </div>
  );
}
