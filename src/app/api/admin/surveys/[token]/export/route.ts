import { NextResponse } from "next/server";
import { getSurveyResults } from "@/db/results";
import { isAdminRequest } from "@/lib/admin";
import {
  buildResultsCsv,
  buildResultsXlsx,
  resultsFilename,
  type ExportFormat,
} from "@/lib/results-export";

export const dynamic = "force-dynamic";

function parseFormat(value: string | null): ExportFormat | null {
  if (value === "csv") {
    return "csv";
  }
  if (value === "xlsx" || value === "xls") {
    return "xlsx";
  }
  return null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await context.params;
  const format = parseFormat(new URL(request.url).searchParams.get("format"));
  if (!format) {
    return NextResponse.json(
      { error: "Use format=csv or format=xlsx." },
      { status: 400 },
    );
  }

  try {
    const results = await getSurveyResults(token);
    if (!results) {
      return NextResponse.json({ error: "Survey not found." }, { status: 404 });
    }

    const filename = resultsFilename(results.survey.publicToken, format);

    if (format === "csv") {
      return new NextResponse(buildResultsCsv(results), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const xlsx = await buildResultsXlsx(results);
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
