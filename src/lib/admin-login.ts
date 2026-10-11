import { consumeAdminTotp } from "@/db/admin-totp";
import { verifyAdminCredentials } from "@/lib/auth";
import { createAdminSession } from "@/lib/session";

export const ADMIN_LOGIN_INVALID = "Email or password is not right.";
export const ADMIN_LOGIN_CODE_INVALID = "That code is not right.";
export const ADMIN_LOGIN_CODE_REUSED =
  "That code was already used. Wait for the next one.";
export const ADMIN_LOGIN_CODE_REQUIRED =
  "Enter the 6-digit code from your authenticator app.";
export const ADMIN_LOGIN_CODE_EXPIRED =
  "Sign in again. That code waited too long.";

export type AdminPasswordGate =
  | { status: "invalid" }
  | { status: "code_required"; adminId: string; email: string }
  | { status: "code_invalid" }
  | { status: "code_reused" }
  | { status: "session"; token: string; adminId: string };

export function presentTotpCode(code: string | null | undefined): string | null {
  if (typeof code !== "string") {
    return null;
  }
  const trimmed = code.replace(/\s+/gu, "");
  return trimmed.length > 0 ? trimmed : null;
}

export async function gateAdminPassword(input: {
  email: string;
  password: string;
  code: string | null;
  nowMs?: number;
}): Promise<AdminPasswordGate> {
  const admin = await verifyAdminCredentials(input.email, input.password);
  if (!admin) {
    return { status: "invalid" };
  }
  if (!admin.totpEnabled) {
    return {
      status: "session",
      token: await createAdminSession(admin.id),
      adminId: admin.id,
    };
  }

  const code = presentTotpCode(input.code);
  if (!code) {
    return { status: "code_required", adminId: admin.id, email: admin.email };
  }

  const checked = await consumeAdminTotp(admin.id, code, input.nowMs);
  if (checked === "reused") {
    return { status: "code_reused" };
  }
  if (checked !== "ok") {
    return { status: "code_invalid" };
  }
  return {
    status: "session",
    token: await createAdminSession(admin.id),
    adminId: admin.id,
  };
}
