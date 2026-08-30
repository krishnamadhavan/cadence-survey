"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminCredentials } from "@/lib/auth";
import { readLoginClientIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { limitAdminLogin } from "@/lib/rate-limit";
import {
  SESSION_COOKIE,
  createAdminSession,
  destroyAdminSession,
  sessionCookieClearOptions,
  sessionCookieOptions,
} from "@/lib/session";

export type LoginState = {
  error: string;
} | null;

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/admin")) {
    return "/admin";
  }
  return raw;
}

export async function loginAdmin(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = readLoginClientIp(
    await headers(),
    env.TRUST_PROXY === "true",
  );

  try {
    const limited = await limitAdminLogin(email, ip);
    if (!limited.ok) {
      return {
        error: `Too many sign-in attempts. Try again in ${limited.retryAfterSeconds}s.`,
      };
    }
  } catch {
    return { error: "Could not reach Redis. Is Docker running?" };
  }

  let admin;
  try {
    admin = await verifyAdminCredentials(email, password);
  } catch {
    return { error: "Could not reach Postgres. Is Docker running?" };
  }

  if (!admin) {
    return { error: "Email or password is not right." };
  }

  let token: string;
  try {
    token = await createAdminSession(admin.id);
  } catch {
    return { error: "Could not start a session. Is Redis running?" };
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());

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
