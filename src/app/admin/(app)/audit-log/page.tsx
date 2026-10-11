import { redirect } from "next/navigation";
import { searchAuditEvents } from "@/db/audit-log";
import {
  auditLogHref,
  parseAuditSearch,
  type AuditHrefState,
  type AuditSearchParams,
} from "@/lib/audit-search";
import { AuditLogPanel } from "./audit-log-panel";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<AuditSearchParams>;
}) {
  const parsed = parseAuditSearch(await searchParams);
  const state: AuditHrefState = {
    q: parsed.q,
    from: parsed.from,
    to: parsed.to,
    tz: parsed.tz,
    sort: parsed.sort,
    direction: parsed.direction,
    page: parsed.page,
    pageSize: parsed.pageSize,
  };

  let result: Awaited<ReturnType<typeof searchAuditEvents>> | null = null;
  let dbError = false;
  if (!parsed.error) {
    try {
      result = await searchAuditEvents({
        text: parsed.q,
        from: parsed.fromInstant,
        toExclusive: parsed.toExclusive,
        sort: parsed.sort,
        direction: parsed.direction,
        page: parsed.page,
        pageSize: parsed.pageSize,
      });
    } catch {
      dbError = true;
    }
  }

  if (result && result.page !== parsed.page) {
    redirect(auditLogHref({ ...state, page: result.page }));
  }

  return (
    <div className="w-full">
      <AuditLogPanel
        events={result?.events ?? []}
        total={result?.total ?? 0}
        dbError={dbError}
        error={parsed.error}
        state={state}
      />
    </div>
  );
}
