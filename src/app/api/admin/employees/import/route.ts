import { NextResponse } from "next/server";
import { importEmployeesFromCsv } from "@/db/employees";
import { requireAdminApi } from "@/lib/admin";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;

export async function POST(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) {
    return denied;
  }

  const contentLength = request.headers.get("content-length");
  const bodyBytes = contentLength ? Number(contentLength) : Number.NaN;
  if (!Number.isFinite(bodyBytes) || bodyBytes <= 0 || bodyBytes > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "File is larger than 1 MB." },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a CSV file to upload." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is larger than 1 MB." }, { status: 400 });
  }

  try {
    const result = await importEmployeesFromCsv(await file.text());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Could not import employees. Is Postgres running?" },
      { status: 503 },
    );
  }
}
