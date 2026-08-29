import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSurveyResults } from "@/db/results";
import { ADMIN_COOKIE, isValidAdminToken, readBearerToken } from "@/lib/admin";

export const dynamic = "force-dynamic";

async function isAdmin(request: Request): Promise<boolean> {
  const bearer = readBearerToken(request.headers.get("authorization"));
  if (isValidAdminToken(bearer)) {
    return true;
  }
  const jar = await cookies();
  return isValidAdminToken(jar.get(ADMIN_COOKIE)?.value);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
