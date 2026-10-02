import { NextResponse } from "next/server";
import { listAuditEvents } from "@/db/audit-log";
import { requireAdminApi } from "@/lib/admin";
import { buildAuditCsv } from "@/lib/audit-csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) {
    return denied;
  }

  try {
    const csv = buildAuditCsv(await listAuditEvents());
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-log-${day}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Postgres." }, { status: 503 });
  }
}
