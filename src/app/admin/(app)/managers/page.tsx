import { listEmployees } from "@/db/employees";
import { listManagerAssignments } from "@/db/managers";
import { ManagersPanel } from "./managers-panel";

export const dynamic = "force-dynamic";

export default async function AdminManagersPage() {
  let assignments: Awaited<ReturnType<typeof listManagerAssignments>> = [];
  let people: Awaited<ReturnType<typeof listEmployees>> = [];
  let dbError = false;

  try {
    [assignments, people] = await Promise.all([
      listManagerAssignments(),
      listEmployees(),
    ]);
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <ManagersPanel assignments={assignments} people={people} dbError={dbError} />
    </div>
  );
}
