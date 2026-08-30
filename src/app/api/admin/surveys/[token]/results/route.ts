import { NextResponse } from "next/server";
import { getSurveyResults } from "@/db/results";
import { requireAdminApi } from "@/lib/admin";

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
    const results = await getSurveyResults(token);
    if (!results) {
      return NextResponse.json({ error: "Survey not found." }, { status: 404 });
    }
    return NextResponse.json(results);
  } catch {
    return NextResponse.json(
      { error: "Could not load results. Is Postgres running?" },
      { status: 503 },
    );
  }
}
