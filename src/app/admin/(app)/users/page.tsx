import { listAdmins } from "@/db/admins";
import { getAdminSessionUser } from "@/lib/admin";
import { UsersPanel } from "./users-panel";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const actor = await getAdminSessionUser();
  let accounts: Awaited<ReturnType<typeof listAdmins>> = [];
  let dbError = false;

  try {
    accounts = await listAdmins();
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <UsersPanel
        accounts={accounts}
        currentId={actor?.id ?? null}
        dbError={dbError}
      />
    </div>
  );
}
