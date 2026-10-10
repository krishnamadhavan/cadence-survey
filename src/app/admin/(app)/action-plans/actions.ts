"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ActionPlanError,
  ActionPlanNotFoundError,
  createActionPlan,
  setActionPlanStatus,
} from "@/db/action-plans";
import type { ActionPlanStatus } from "@/db/schema";
import { readWorkspaceWriter } from "@/lib/admin";
import { VIEW_ONLY_MESSAGE } from "@/lib/admin-role";

export type ActionPlanActionState = {
  ok: boolean;
  error: string | null;
} | null;

const idSchema = z.string().uuid();

function fail(error: string): ActionPlanActionState {
  return { ok: false, error };
}

export async function createActionPlanAction(
  _prev: ActionPlanActionState,
  formData: FormData,
): Promise<ActionPlanActionState> {
  if (!(await readWorkspaceWriter("/admin/recommendations"))) {
    return fail(VIEW_ONLY_MESSAGE);
  }
  const token = String(formData.get("token") ?? "").trim();
  const teamKey = String(formData.get("teamKey") ?? "").trim();
  if (!token || token.length > 80 || !teamKey) {
    return fail("That follow-up is not valid.");
  }
  try {
    await createActionPlan({ token, teamKey });
    revalidatePlanPages();
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof ActionPlanError) {
      return fail(error.message);
    }
    return fail("Could not add that follow-up. Is Postgres running?");
  }
}

export async function setActionPlanStatusAction(
  _prev: ActionPlanActionState,
  formData: FormData,
): Promise<ActionPlanActionState> {
  if (!(await readWorkspaceWriter("/admin/action-plans"))) {
    return fail(VIEW_ONLY_MESSAGE);
  }
  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  const status = String(formData.get("status") ?? "") as ActionPlanStatus;
  if (!id.success || (status !== "open" && status !== "done")) {
    return fail("That plan update is not valid.");
  }
  try {
    await setActionPlanStatus({ id: id.data, status });
    revalidatePlanPages();
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof ActionPlanNotFoundError || error instanceof ActionPlanError) {
      return fail(error.message);
    }
    return fail("Could not update that plan. Is Postgres running?");
  }
}

function revalidatePlanPages() {
  revalidatePath("/admin/action-plans");
  revalidatePath("/admin/recommendations");
  revalidatePath("/admin/dashboard");
}
