"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
} from "@/db/admins";
import {
  changeOwnAdminPassword,
  updateOwnAdminAccount,
} from "@/db/admin-profile";
import {
  AdminTotpStateError,
  beginAdminTotp,
  confirmAdminTotp,
  disableAdminTotp,
  restartAdminTotp,
  type TotpCodeStatus,
} from "@/db/admin-totp";
import { getAdminSessionUser } from "@/lib/admin";
import { SESSION_COOKIE } from "@/lib/session";
import {
  ADMIN_LOGIN_CODE_INVALID,
  ADMIN_LOGIN_CODE_REUSED,
  presentTotpCode,
} from "@/lib/admin-login";

export type TotpActionState = {
  error: string | null;
} | null;

async function requireActor() {
  const actor = await getAdminSessionUser();
  if (!actor) {
    redirect("/admin/login?next=/admin/profile");
  }
  return actor;
}

function revalidateProfile() {
  revalidatePath("/admin/profile");
  revalidatePath("/admin/audit-log");
}

function codeError(status: TotpCodeStatus): string {
  if (status === "reused") {
    return ADMIN_LOGIN_CODE_REUSED;
  }
  if (status === "invalid") {
    return ADMIN_LOGIN_CODE_INVALID;
  }
  if (status === "already_on") {
    return "Authenticator app is already on.";
  }
  if (status === "missing") {
    return "That admin is gone.";
  }
  if (status === "off") {
    return "Authenticator app is already off.";
  }
  return "Turn on an authenticator app first.";
}

export async function beginAdminTotpAction(
  _prev: TotpActionState,
  formData: FormData,
): Promise<TotpActionState> {
  const actor = await requireActor();
  if (String(formData.get("intent") ?? "") !== "begin") {
    return { error: "Could not start setup. Is Postgres running?" };
  }
  try {
    await beginAdminTotp(actor.id);
    revalidateProfile();
    return { error: null };
  } catch (error) {
    if (error instanceof AdminTotpStateError) {
      return { error: error.message };
    }
    return { error: "Could not start setup. Is Postgres running?" };
  }
}

export async function restartAdminTotpAction(
  _prev: TotpActionState,
  formData: FormData,
): Promise<TotpActionState> {
  const actor = await requireActor();
  if (String(formData.get("intent") ?? "") !== "restart") {
    return { error: "Could not start over. Is Postgres running?" };
  }
  try {
    await restartAdminTotp(actor.id);
    revalidateProfile();
    return { error: null };
  } catch (error) {
    if (error instanceof AdminTotpStateError) {
      return { error: error.message };
    }
    return { error: "Could not start over. Is Postgres running?" };
  }
}

export async function confirmAdminTotpAction(
  _prev: TotpActionState,
  formData: FormData,
): Promise<TotpActionState> {
  const actor = await requireActor();
  const code = presentTotpCode(String(formData.get("code") ?? ""));
  if (!code) {
    return { error: ADMIN_LOGIN_CODE_INVALID };
  }
  try {
    const status = await confirmAdminTotp(actor.id, code);
    if (status !== "ok") {
      return { error: codeError(status) };
    }
    revalidateProfile();
    return { error: null };
  } catch {
    return { error: "Could not turn on the authenticator app. Is Postgres running?" };
  }
}

export async function disableAdminTotpAction(
  _prev: TotpActionState,
  formData: FormData,
): Promise<TotpActionState> {
  const actor = await requireActor();
  const code = presentTotpCode(String(formData.get("code") ?? ""));
  if (!code) {
    return { error: ADMIN_LOGIN_CODE_INVALID };
  }
  try {
    const status = await disableAdminTotp(actor.id, code);
    if (status !== "ok") {
      return { error: codeError(status) };
    }
    revalidateProfile();
    return { error: null };
  } catch {
    return { error: "Could not turn off the authenticator app. Is Postgres running?" };
  }
}

export type AccountActionState = {
  ok: boolean;
  error: string | null;
  savedAt: number | null;
} | null;

function accountFail(error: string): AccountActionState {
  return { ok: false, error, savedAt: null };
}

export async function updateOwnAdminAccountAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const actor = await requireActor();
  try {
    const updated = await updateOwnAdminAccount({
      id: actor.id,
      name: formData.get("name"),
      email: formData.get("email"),
    });
    if (updated.changed) {
      revalidateProfile();
    }
    return { ok: true, error: null, savedAt: Date.now() };
  } catch (error) {
    if (
      error instanceof AdminValidationError ||
      error instanceof AdminConflictError ||
      error instanceof AdminNotFoundError
    ) {
      return accountFail(error.message);
    }
    return accountFail("Could not save that account. Is Postgres running?");
  }
}

export async function changeOwnAdminPasswordAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const actor = await requireActor();
  const keepSessionToken = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  try {
    const currentPassword = formData.get("currentPassword");
    const nextPassword = formData.get("nextPassword");
    const confirmPassword = formData.get("confirmPassword");
    await changeOwnAdminPassword({
      id: actor.id,
      currentPassword: typeof currentPassword === "string" ? currentPassword : "",
      nextPassword: typeof nextPassword === "string" ? nextPassword : "",
      confirmPassword: typeof confirmPassword === "string" ? confirmPassword : "",
      keepSessionToken,
    });
    revalidateProfile();
    return { ok: true, error: null, savedAt: Date.now() };
  } catch (error) {
    if (
      error instanceof AdminValidationError ||
      error instanceof AdminNotFoundError
    ) {
      return accountFail(error.message);
    }
    return accountFail("Could not change that password. Is Postgres running?");
  }
}
