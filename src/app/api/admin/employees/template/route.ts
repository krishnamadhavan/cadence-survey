import { NextResponse } from "next/server";
import { requireWorkspaceWriterApi } from "@/lib/admin";

export const dynamic = "force-dynamic";

const TEMPLATE =
  "name,email,team,role,tenure\nAda Lovelace,ada@example.com,Engineering,Engineer,<1yr\n";

export async function GET(request: Request) {
  const denied = await requireWorkspaceWriterApi(request);
  if (denied) {
    return denied;
  }

  return new NextResponse(TEMPLATE, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="employees-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
