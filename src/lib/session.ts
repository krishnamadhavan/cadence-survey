import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";

export const SESSION_COOKIE = "cadence_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function sessionKey(token: string): string {
  return `session:admin:${token}`;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production" || env.APP_URL.startsWith("https://"),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function createAdminSession(adminId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await redis.set(sessionKey(token), adminId, "EX", SESSION_TTL_SECONDS);
  return token;
}

export async function readAdminSession(
  token: string | null | undefined,
): Promise<{ adminId: string } | null> {
  if (!token) {
    return null;
  }
  const adminId = await redis.get(sessionKey(token));
  if (!adminId) {
    return null;
  }
  return { adminId };
}

export async function destroyAdminSession(
  token: string | null | undefined,
): Promise<void> {
  if (!token) {
    return;
  }
  await redis.del(sessionKey(token));
}
