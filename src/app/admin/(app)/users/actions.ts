"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
  createAdmin,
  deleteAdmin,
} from "@/db/admins";
import { getAdminSessionUser } from "@/lib/admin";

export type UserActionState = {
  ok: boolean;
  error: string | null;
} | null;

const idSchema = z.string().uuid();

function fail(error: string): UserActionState {
  return { ok: false, error };
}

async function requireActor() {
  const actor = await getAdminSessionUser();
  if (!actor) {
    redirect("/admin/login?next=/admin/users");
  }
  return actor;
}

export async function createAdminAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  await requireActor();
  try {
    await createAdmin({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    revalidatePath("/admin/users");
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

export async function deleteAdminAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requireActor();
  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    return fail("That admin is not valid.");
  }
  try {
    await deleteAdmin({ id: id.data, actorId: actor.id });
    revalidatePath("/admin/users");
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
