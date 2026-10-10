"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
  createAdmin,
  deleteAdmin,
  listAdmins,
  setAdminRole,
} from "@/db/admins";
import { recordAudit } from "@/db/audit-log";
import { readWorkspaceWriter, type AdminSessionUser } from "@/lib/admin";
import { parseAdminRole, VIEW_ONLY_MESSAGE } from "@/lib/admin-role";

export type UserActionState = {
  ok: boolean;
  error: string | null;
} | null;

const idSchema = z.string().uuid();

function fail(error: string): UserActionState {
  return { ok: false, error };
}

async function requireActor(): Promise<
  { actor: AdminSessionUser } | { error: UserActionState }
> {
  const actor = await readWorkspaceWriter("/admin/users");
  if (!actor) {
    return { error: fail(VIEW_ONLY_MESSAGE) };
  }
  return { actor };
}

export async function createAdminAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const gate = await requireActor();
  if ("error" in gate) {
    return gate.error;
  }
  const actor = gate.actor;
  const rawRole = formData.get("role");
  const role =
    rawRole == null || rawRole === "" ? "admin" : parseAdminRole(String(rawRole));
  if (!role) {
    return fail("Choose Admin or Viewer.");
  }
  try {
    const created = await createAdmin({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      role,
    });
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "admin.added",
      summary: `Added ${created.role} ${created.email}`,
    });
    revalidatePath("/admin/users");
    revalidatePath("/admin/audit-log");
    return { ok: true, error: null };
  } catch (error) {
    if (
      error instanceof AdminValidationError ||
      error instanceof AdminConflictError
    ) {
      return fail(error.message);
    }
    return fail("Could not add that admin. Is Postgres running?");
  }
}

export async function setAdminRoleAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const gate = await requireActor();
  if ("error" in gate) {
    return gate.error;
  }
  const actor = gate.actor;
  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  const role = parseAdminRole(String(formData.get("role") ?? ""));
  if (!id.success) {
    return fail("That admin is not valid.");
  }
  if (!role) {
    return fail("Choose Admin or Viewer.");
  }
  try {
    const updated = await setAdminRole({ id: id.data, actorId: actor.id, role });
    if (updated.changed) {
      await recordAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        action: "admin.role_changed",
        summary: `Set ${updated.email} to ${updated.role}`,
      });
      revalidatePath("/admin/users");
      revalidatePath("/admin/audit-log");
    }
    return { ok: true, error: null };
  } catch (error) {
    if (
      error instanceof AdminValidationError ||
      error instanceof AdminNotFoundError
    ) {
      return fail(error.message);
    }
    return fail("Could not change that access. Is Postgres running?");
  }
}

export async function deleteAdminAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const gate = await requireActor();
  if ("error" in gate) {
    return gate.error;
  }
  const actor = gate.actor;
  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    return fail("That admin is not valid.");
  }
  try {
    const existing = (await listAdmins()).find((account) => account.id === id.data);
    await deleteAdmin({ id: id.data, actorId: actor.id });
    const kind = existing?.role === "viewer" ? "viewer" : "admin";
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "admin.removed",
      summary: `Removed ${kind} ${existing?.email ?? id.data}`,
    });
    revalidatePath("/admin/users");
    revalidatePath("/admin/audit-log");
    return { ok: true, error: null };
  } catch (error) {
    if (
      error instanceof AdminValidationError ||
      error instanceof AdminNotFoundError
    ) {
      return fail(error.message);
    }
    return fail("Could not remove that admin. Is Postgres running?");
  }
}
