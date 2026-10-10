"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AdminTotpStateError,
  beginAdminTotp,
  confirmAdminTotp,
  disableAdminTotp,
  restartAdminTotp,
  type TotpCodeStatus,
} from "@/db/admin-totp";
import { getAdminSessionUser } from "@/lib/admin";
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
