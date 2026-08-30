import { NextResponse } from "next/server";
import { listSurveysForAdmin } from "@/db/queries";
import { requireAdminApi } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) {
    return denied;
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
