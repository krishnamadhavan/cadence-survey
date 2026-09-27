"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ManagerNotFoundError,
  ManagerValidationError,
  assignManager,
  unassignManager,
} from "@/db/managers";
import { hasAdminSession } from "@/lib/admin";

export type ManagerActionState = {
  ok: boolean;
  error: string | null;
} | null;

const idSchema = z.string().uuid();

function fail(error: string): ManagerActionState {
  return { ok: false, error };
}

function revalidateManagerPages() {
  revalidatePath("/admin/managers");
  revalidatePath("/admin/teams");
}

export async function assignManagerAction(
  _prev: ManagerActionState,
  formData: FormData,
): Promise<ManagerActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/managers");
  }
  const teamId = idSchema.safeParse(String(formData.get("teamId") ?? ""));
  const employeeId = idSchema.safeParse(String(formData.get("employeeId") ?? ""));
  if (!teamId.success || !employeeId.success) {
    return fail("Pick a team and a person.");
  }
  try {
    await assignManager({ teamId: teamId.data, employeeId: employeeId.data });
    revalidateManagerPages();
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof ManagerNotFoundError || error instanceof ManagerValidationError) {
      return fail(error.message);
    }
    return fail("Could not assign that manager. Is Postgres running?");
  }
}

export async function unassignManagerAction(
  _prev: ManagerActionState,
  formData: FormData,
): Promise<ManagerActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/managers");
  }
  const teamId = idSchema.safeParse(String(formData.get("teamId") ?? ""));
  if (!teamId.success) {
    return fail("That team is not valid.");
  }
  try {
    await unassignManager(teamId.data);
    revalidateManagerPages();
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof ManagerNotFoundError || error instanceof ManagerValidationError) {
      return fail(error.message);
    }
    return fail("Could not unassign that manager. Is Postgres running?");
  }
}
