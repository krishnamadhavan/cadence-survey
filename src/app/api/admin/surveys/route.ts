import { NextResponse } from "next/server";
import { listSurveysForAdmin } from "@/db/queries";
import { isAdminRequest } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) {
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
