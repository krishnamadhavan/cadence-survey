import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { listSurveysForAdmin } from "@/db/queries";
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

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const surveys = await listSurveysForAdmin();
    return NextResponse.json({ surveys });
  } catch {
    return NextResponse.json(
      { error: "Could not load surveys. Is Postgres running?" },
      { status: 503 },
    );
  }
}
