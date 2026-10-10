"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { importSurveyResponses } from "@/db/response-import";
import { getAdminSessionUser } from "@/lib/admin";
import { RESPONSE_IMPORT_MAX_BYTES } from "@/lib/response-import";

export type ResponseImportState = {
  ok: boolean;
  imported: number;
  errors: { line: number; message: string }[];
} | null;

export async function importResponsesAction(
  _prev: ResponseImportState,
  formData: FormData,
): Promise<ResponseImportState> {
  const token = String(formData.get("token") ?? "").trim();
  const actor = await getAdminSessionUser();
  if (!actor) {
    const next = /^[a-z0-9][a-z0-9_-]{0,80}$/i.test(token) ? `/admin/s/${token}` : "/admin";
    redirect(`/admin/login?next=${next}`);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      imported: 0,
      errors: [{ line: 1, message: "Choose a CSV file to upload." }],
    };
  }
  if (file.size > RESPONSE_IMPORT_MAX_BYTES) {
    return {
      ok: false,
      imported: 0,
      errors: [{ line: 1, message: "File is larger than 1 MB." }],
    };
  }

  try {
    const result = await importSurveyResponses({
      publicToken: token,
      csvText: await file.text(),
      actor,
    });
    if (!result.ok) {
      return {
        ok: false,
        imported: 0,
        errors: result.errors ?? [{ line: 1, message: result.error ?? "Could not import responses." }],
      };
    }
    revalidatePath(`/admin/s/${token}`);
    revalidatePath(`/admin/reports/${token}`);
    revalidatePath("/admin/reports");
    revalidatePath("/admin/feedbacks");
    revalidatePath("/admin/recommendations");
    revalidatePath("/admin/action-plans");
    return { ok: true, imported: result.imported, errors: [] };
  } catch {
    return {
      ok: false,
      imported: 0,
      errors: [{ line: 1, message: "Could not import responses. Is Postgres running?" }],
    };
  }
}
