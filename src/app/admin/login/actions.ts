"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { consumeAdminTotp } from "@/db/admin-totp";
import {
  ADMIN_LOGIN_CODE_EXPIRED,
  ADMIN_LOGIN_CODE_INVALID,
  ADMIN_LOGIN_CODE_REUSED,
  ADMIN_LOGIN_INVALID,
  gateAdminPassword,
  presentTotpCode,
} from "@/lib/admin-login";
import { readLoginClientIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { limitAdminLogin } from "@/lib/rate-limit";
import {
  SESSION_COOKIE,
  SessionStoreUnavailable,
  createAdminSession,
  destroyAdminSession,
  sessionCookieClearOptions,
  sessionCookieOptions,
} from "@/lib/session";
import {
  TOTP_CHALLENGE_COOKIE,
  createTotpChallenge,
  destroyTotpChallenge,
  readTotpChallenge,
  totpChallengeCookieClearOptions,
  totpChallengeCookieOptions,
} from "@/lib/totp-challenge";

export type LoginState = {
  error?: string;
  step?: "code" | "password";
  email?: string;
} | null;

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/admin")) {
    return "/admin";
  }
  return raw;
}

async function clearChallengeCookie() {
  const jar = await cookies();
  const token = jar.get(TOTP_CHALLENGE_COOKIE)?.value;
  if (token) {
    await destroyTotpChallenge(token);
  }
  jar.set(TOTP_CHALLENGE_COOKIE, "", totpChallengeCookieClearOptions());
}

export async function loginAdmin(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const intent = String(formData.get("intent") ?? "password");
  if (intent === "cancel") {
    try {
      await clearChallengeCookie();
    } catch {
      return {
        error: "Could not reach Redis. Is Docker running?",
        step: "password",
      };
    }
    return { step: "password" };
  }
  if (intent === "code") {
    return loginWithCode(formData);
  }
  return loginWithPassword(formData);
}

async function loginWithPassword(formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = readLoginClientIp(await headers(), env.TRUST_PROXY === "true");

  try {
    const limited = await limitAdminLogin(email, ip);
    if (!limited.ok) {
      return {
        error: `Too many sign-in attempts. Try again in ${limited.retryAfterSeconds}s.`,
        step: "password",
      };
    }
  } catch {
    return { error: "Could not reach Redis. Is Docker running?", step: "password" };
  }

  let gate;
  try {
    gate = await gateAdminPassword({ email, password, code: null });
  } catch (error) {
    if (error instanceof SessionStoreUnavailable) {
      return {
        error: "Could not start a session. Is Redis running?",
        step: "password",
      };
    }
    return { error: "Could not reach Postgres. Is Docker running?", step: "password" };
  }

  if (gate.status === "invalid") {
    return { error: ADMIN_LOGIN_INVALID, step: "password" };
  }
  if (gate.status === "code_required") {
    try {
      const jar = await cookies();
      const token = await createTotpChallenge(
        { adminId: gate.adminId, email: gate.email },
        jar.get(TOTP_CHALLENGE_COOKIE)?.value,
      );
      jar.set(TOTP_CHALLENGE_COOKIE, token, totpChallengeCookieOptions());
    } catch {
      return { error: "Could not reach Redis. Is Docker running?", step: "password" };
    }
    return { step: "code", email: gate.email };
  }
  if (gate.status !== "session") {
    return { error: ADMIN_LOGIN_CODE_INVALID, step: "password" };
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, gate.token, sessionCookieOptions());
  try {
    await clearChallengeCookie();
  } catch {
    jar.set(TOTP_CHALLENGE_COOKIE, "", totpChallengeCookieClearOptions());
  }
  redirect(safeNext(String(formData.get("next") ?? "")));
}

async function loginWithCode(formData: FormData): Promise<LoginState> {
  const ip = readLoginClientIp(await headers(), env.TRUST_PROXY === "true");
  const jar = await cookies();
  const challengeToken = jar.get(TOTP_CHALLENGE_COOKIE)?.value;
  let challenge;
  try {
    challenge = await readTotpChallenge(challengeToken);
  } catch {
    return { error: "Could not reach Redis. Is Docker running?", step: "password" };
  }

  try {
    const limited = await limitAdminLogin(challenge?.email ?? "", ip);
    if (!limited.ok) {
      return {
        error: `Too many sign-in attempts. Try again in ${limited.retryAfterSeconds}s.`,
        step: challenge ? "code" : "password",
        email: challenge?.email,
      };
    }
  } catch {
    return { error: "Could not reach Redis. Is Docker running?", step: "password" };
  }

  if (!challenge) {
    return { error: ADMIN_LOGIN_CODE_EXPIRED, step: "password" };
  }

  const code = presentTotpCode(String(formData.get("code") ?? ""));
  if (!code) {
    return {
      error: ADMIN_LOGIN_CODE_INVALID,
      step: "code",
      email: challenge.email,
    };
  }

  let checked;
  try {
    checked = await consumeAdminTotp(challenge.adminId, code);
  } catch {
    return {
      error: "Could not reach Postgres. Is Docker running?",
      step: "code",
      email: challenge.email,
    };
  }
  if (checked === "reused") {
    return {
      error: ADMIN_LOGIN_CODE_REUSED,
      step: "code",
      email: challenge.email,
    };
  }
  if (checked !== "ok") {
    return {
      error: ADMIN_LOGIN_CODE_INVALID,
      step: "code",
      email: challenge.email,
    };
  }

  let token: string;
  try {
    token = await createAdminSession(challenge.adminId);
  } catch {
    return {
      error: "Could not start a session. Is Redis running?",
      step: "code",
      email: challenge.email,
    };
  }

  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
  jar.set(TOTP_CHALLENGE_COOKIE, "", totpChallengeCookieClearOptions());
  try {
    await destroyTotpChallenge(challengeToken);
  } catch {
    // The code is already spent. The challenge expires on its own.
  }
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function logoutAdmin() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  try {
    await destroyAdminSession(token);
  } finally {
    jar.set(SESSION_COOKIE, "", sessionCookieClearOptions());
  }
  redirect("/admin/login");
}
