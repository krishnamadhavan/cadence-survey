import { listAuditEvents } from "@/db/audit-log";
import { AuditLogPanel } from "./audit-log-panel";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogPage() {
  let events: Awaited<ReturnType<typeof listAuditEvents>> = [];
  let dbError = false;
  try {
    events = await listAuditEvents();
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <AuditLogPanel events={events} dbError={dbError} />
    </div>
  );
}
