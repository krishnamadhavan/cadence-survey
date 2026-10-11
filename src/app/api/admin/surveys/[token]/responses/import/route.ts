import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { importSurveyResponses, type ResponseImportOutcome } from "@/db/response-import";
import { db } from "@/db/client";
import { admins } from "@/db/schema";
import { getAdminSessionUser, readBearerToken, requireWorkspaceWriterApi } from "@/lib/admin";
import { readAdminSession } from "@/lib/session";
import { RESPONSE_IMPORT_MAX_BYTES } from "@/lib/response-import";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = RESPONSE_IMPORT_MAX_BYTES + 64 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const denied = await requireWorkspaceWriterApi(request);
  if (denied) {
    return denied;
  }

  const contentLength = request.headers.get("content-length");
  const bodyBytes = contentLength ? Number(contentLength) : Number.NaN;
  if (!Number.isFinite(bodyBytes) || bodyBytes <= 0 || bodyBytes > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "File is larger than 1 MB." }, { status: 413 });
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
  if (file.size > RESPONSE_IMPORT_MAX_BYTES) {
    return NextResponse.json({ error: "File is larger than 1 MB." }, { status: 413 });
  }

  const { token } = await context.params;
  try {
    const result = await importSurveyResponses({
      publicToken: token,
      csvText: await file.text(),
      actor: await actorFromRequest(request),
    });
    return outcomeResponse(result);
  } catch {
    return NextResponse.json(
      { error: "Could not import responses. Is Postgres running?" },
      { status: 503 },
    );
  }
}

function outcomeResponse(result: ResponseImportOutcome) {
  if (result.ok) {
    return NextResponse.json({ imported: result.imported });
  }
  if (result.errors) {
    return NextResponse.json({ imported: 0, errors: result.errors }, { status: result.status });
  }
  return NextResponse.json(
    { error: result.error ?? "Could not import responses." },
    { status: result.status },
  );
}

async function actorFromRequest(request: Request): Promise<{ id: string | null; email: string }> {
  const sessionUser = await getAdminSessionUser();
  if (sessionUser) {
    return sessionUser;
  }
  const bearer = readBearerToken(request.headers.get("authorization"));
  if (bearer) {
    const session = await readAdminSession(bearer);
    if (session) {
      const [admin] = await db
        .select({ id: admins.id, email: admins.email })
        .from(admins)
        .where(eq(admins.id, session.adminId))
        .limit(1);
      if (admin) {
        return admin;
      }
    }
  }
  return { id: null, email: "API key" };
}
