import { NextResponse } from "next/server";
import {
  getPublishedComments,
  getSurveyResults,
  normalizeReportRole,
} from "@/db/results";
import { requireAdminApi } from "@/lib/admin";
import {
  buildResultsCsv,
  buildResultsXlsx,
  parseExportFormat,
  resultsFilename,
} from "@/lib/results-export";

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
  const url = new URL(request.url);
  const format = parseExportFormat(url.searchParams.get("format"));
  const role = normalizeReportRole(url.searchParams.get("role"));
  if (!format) {
    return NextResponse.json(
      { error: "Use format=csv or format=xlsx." },
      { status: 400 },
    );
  }

  try {
    const results = await getSurveyResults(token, { role });
    if (!results) {
      return NextResponse.json({ error: "Survey not found." }, { status: 404 });
    }
    if (results.roleVisibility === "empty") {
      return NextResponse.json(
        { error: "No responses for that role." },
        { status: 404 },
      );
    }
    if (results.roleVisibility === "hidden") {
      return NextResponse.json(
        { error: "Too few responses in that role to export." },
        { status: 404 },
      );
    }

    const comments = (await getPublishedComments(token, { role })) ?? [];
    const filename = resultsFilename(results.survey.publicToken, format, role);

    if (format === "csv") {
      return new NextResponse(buildResultsCsv(results, comments), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const xlsx = await buildResultsXlsx(results, comments);
    return new NextResponse(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not export results. Is Postgres running?" },
      { status: 503 },
    );
  }
}
