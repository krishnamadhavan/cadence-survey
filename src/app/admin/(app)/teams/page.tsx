import { listTeamsForAdmin } from "@/db/teams";
import { TeamsPanel } from "./teams-panel";

export const dynamic = "force-dynamic";

export default async function AdminTeamsPage() {
  let teams: Awaited<ReturnType<typeof listTeamsForAdmin>> = [];
  let dbError = false;

  try {
    teams = await listTeamsForAdmin();
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <TeamsPanel teams={teams} dbError={dbError} />
    </div>
  );
}
