"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/db/audit-log";
import {
  ManagerNotFoundError,
  ManagerValidationError,
  assignManager,
  listManagerAssignments,
  unassignManager,
} from "@/db/managers";
import { getAdminSessionUser } from "@/lib/admin";

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
  const actor = await getAdminSessionUser();
  if (!actor) {
    redirect("/admin/login?next=/admin/managers");
  }
  const teamId = idSchema.safeParse(String(formData.get("teamId") ?? ""));
  const employeeId = idSchema.safeParse(String(formData.get("employeeId") ?? ""));
  if (!teamId.success || !employeeId.success) {
    return fail("Pick a team and a person.");
  }
  try {
    await assignManager({ teamId: teamId.data, employeeId: employeeId.data });
    const assigned = (await listManagerAssignments()).find(
      (row) => row.teamId === teamId.data,
    );
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "manager.assigned",
      summary: `Assigned ${assigned?.employeeName ?? "a person"} as manager of ${assigned?.teamName ?? "a team"}`,
    });
    revalidateManagerPages();
    revalidatePath("/admin/audit-log");
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
  const actor = await getAdminSessionUser();
  if (!actor) {
    redirect("/admin/login?next=/admin/managers");
  }
  const teamId = idSchema.safeParse(String(formData.get("teamId") ?? ""));
  if (!teamId.success) {
    return fail("That team is not valid.");
  }
  try {
    const current = (await listManagerAssignments()).find(
      (row) => row.teamId === teamId.data,
    );
    await unassignManager(teamId.data);
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "manager.unassigned",
      summary: `Unassigned ${current?.employeeName ?? "the manager"} from ${current?.teamName ?? "a team"}`,
    });
    revalidateManagerPages();
    revalidatePath("/admin/audit-log");
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof ManagerNotFoundError || error instanceof ManagerValidationError) {
      return fail(error.message);
    }
    return fail("Could not unassign that manager. Is Postgres running?");
  }
}
