import { NextResponse } from "next/server";
import { responseImportTemplateForSurvey } from "@/db/response-import";
import { requireWorkspaceWriterApi } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const denied = await requireWorkspaceWriterApi(request);
  if (denied) {
    return denied;
  }

  const { token } = await context.params;
  try {
    const template = await responseImportTemplateForSurvey(token);
    if (template.state === "missing") {
      return NextResponse.json({ error: "Survey not found." }, { status: 404 });
    }
    if (template.state === "empty") {
      return NextResponse.json(
        { error: "Add a question before importing responses." },
        { status: 409 },
      );
    }
    return new NextResponse(template.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${template.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not build the template. Is Postgres running?" },
      { status: 503 },
    );
  }
}
