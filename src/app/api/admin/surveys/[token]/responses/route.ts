import { NextResponse } from "next/server";
import { exportClosedResponses } from "@/db/response-export";
import { requireAdminApi } from "@/lib/admin";
import { responseExportFilename } from "@/lib/response-export";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const denied = await requireAdminApi(request);
  if (denied) {
    return denied;
  }

  const { token } = await context.params;

  try {
    const result = await exportClosedResponses(token);
    if (result.state === "missing") {
      return NextResponse.json({ error: "Survey not found." }, { status: 404 });
    }
    if (result.state === "not_closed") {
      return NextResponse.json(
        { error: "Responses can be exported once the pulse is closed." },
        { status: 409 },
      );
    }
    if (result.state === "empty") {
      return NextResponse.json({ error: "No responses to export." }, { status: 404 });
    }
    if (result.state === "hidden") {
      return NextResponse.json(
        { error: "Too few responses to export." },
        { status: 404 },
      );
    }

    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${responseExportFilename(result.publicToken)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not export responses. Is Postgres running?" },
      { status: 503 },
    );
  }
}
