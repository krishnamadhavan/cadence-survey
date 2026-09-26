"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setSurveyStatus, SurveyNotFoundError, SurveyStatusError } from "@/db/surveys";
import { hasAdminSession } from "@/lib/admin";
import type { SurveyStatus } from "@/db/schema";

export type SurveyActionState = {
  ok: boolean;
  error: string | null;
} | null;

function fail(error: string): SurveyActionState {
  return { ok: false, error };
}

export async function setSurveyStatusAction(
  _prev: SurveyActionState,
  formData: FormData,
): Promise<SurveyActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin");
  }

  const token = String(formData.get("token") ?? "").trim();
  const status = String(formData.get("status") ?? "") as SurveyStatus;
  if (!token || (status !== "open" && status !== "closed")) {
    return fail("That status change is not valid.");
  }

  try {
    const updated = await setSurveyStatus({ token, status });
    revalidateSurveyPaths(updated.publicToken);
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof SurveyStatusError || error instanceof SurveyNotFoundError) {
      return fail(error.message);
    }
    return fail("Could not update the pulse. Is Postgres running?");
  }
}

function revalidateSurveyPaths(token: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/reports");
  revalidatePath(`/admin/s/${token}`);
  revalidatePath(`/admin/reports/${token}`);
  revalidatePath(`/s/${token}`);
}
