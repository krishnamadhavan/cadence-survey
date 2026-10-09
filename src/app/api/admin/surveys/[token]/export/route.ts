import { NextResponse } from "next/server";
import { getPublishedComments, getSurveyResults } from "@/db/results";
import { requireAdminApi } from "@/lib/admin";
import { tenureBandLabel } from "@/lib/employee-attributes";
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
  const teamId = url.searchParams.get("team");
  const role = url.searchParams.get("role");
  const tenure = url.searchParams.get("tenure");
  if (!format) {
    return NextResponse.json(
      { error: "Use format=csv or format=xlsx." },
      { status: 400 },
    );
  }

  const rawTeam = teamId?.trim() ?? "";
  const rawRole = role?.trim() ?? "";
  const rawTenure = tenure?.trim() ?? "";
  const roleOnly = Boolean(rawRole && !rawTeam && !rawTenure);

  try {
    const results = await getSurveyResults(token, { teamId, role, tenure });
    if (!results) {
      return NextResponse.json({ error: "Survey not found." }, { status: 404 });
    }
    if (results.roleVisibility === "empty") {
      return NextResponse.json(
        { error: roleOnly ? "No responses for that role." : "No responses for that slice." },
        { status: 404 },
      );
    }
    if (results.roleVisibility === "hidden") {
      return NextResponse.json(
        {
          error: roleOnly
            ? "Too few responses in that role to export."
            : "Too few responses in that slice to export.",
        },
        { status: 404 },
      );
    }
    if (results.roleVisibility === "withheld") {
      return NextResponse.json(
        {
          error: roleOnly
            ? "That role cannot be exported on its own."
            : "That slice cannot be exported on its own.",
        },
        { status: 404 },
      );
    }

    const comments = (await getPublishedComments(token, { teamId, role, tenure })) ?? [];
    const filename = resultsFilename(results.survey.publicToken, format, results.role, {
      team: results.teamId ? results.teamName || results.teamId : null,
      tenure: results.tenure ? tenureBandLabel(results.tenure) : null,
    });

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
