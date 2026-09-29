"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { readLoginClientIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { verifyManagerCredentials } from "@/lib/manager-auth";
import { safeManagerNext } from "@/lib/manager-path";
import { limitManagerLogin } from "@/lib/rate-limit";
import {
  MANAGER_SESSION_COOKIE,
  createManagerSession,
  destroyManagerSession,
  sessionCookieClearOptions,
  sessionCookieOptions,
} from "@/lib/session";

export type ManagerLoginState = {
  error: string;
} | null;

export async function loginManager(
  _prev: ManagerLoginState,
  formData: FormData,
): Promise<ManagerLoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = readLoginClientIp(await headers(), env.TRUST_PROXY === "true");

  try {
    const limited = await limitManagerLogin(email, ip);
    if (!limited.ok) {
      return {
        error: `Too many sign-in attempts. Try again in ${limited.retryAfterSeconds}s.`,
      };
    }
  } catch {
    return { error: "Could not reach Redis. Is Docker running?" };
  }

  let manager;
  try {
    manager = await verifyManagerCredentials(email, password);
  } catch {
    return { error: "Could not reach Postgres. Is Docker running?" };
  }

  if (!manager) {
    return { error: "Email or password is not right." };
  }

  let token: string;
  try {
    token = await createManagerSession(manager.id);
  } catch {
    return { error: "Could not start a session. Is Redis running?" };
  }

  const jar = await cookies();
  jar.set(MANAGER_SESSION_COOKIE, token, sessionCookieOptions());
  redirect(safeManagerNext(String(formData.get("next") ?? "")));
}

export async function logoutManager() {
  const jar = await cookies();
  const token = jar.get(MANAGER_SESSION_COOKIE)?.value;
  try {
    await destroyManagerSession(token);
  } finally {
    jar.set(MANAGER_SESSION_COOKIE, "", sessionCookieClearOptions());
  }
  redirect("/manage/login");
}
