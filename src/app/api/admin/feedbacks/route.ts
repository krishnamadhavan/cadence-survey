import { NextResponse } from "next/server";
import { listPublishedFeedback } from "@/db/feedbacks";
import { requireAdminApi } from "@/lib/admin";
import { buildFeedbackCsv } from "@/lib/feedback-csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) {
    return denied;
  }

  try {
    const csv = buildFeedbackCsv(await listPublishedFeedback());
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="feedbacks-${day}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Postgres." }, { status: 503 });
  }
}
