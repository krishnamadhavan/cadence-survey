import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import {
  SESSION_TTL_SECONDS,
  SessionStoreUnavailable,
  createAdminSession as createStoredSession,
  destroyAdminSession as destroyStoredSession,
  readAdminSession as readStoredSession,
  sessionKey,
  type SessionStore,
} from "@/lib/session-store";

export {
  SESSION_TTL_SECONDS,
  SessionStoreUnavailable,
  sessionKey,
  type SessionStore,
};

export const SESSION_COOKIE = "cadence_session";

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production" || env.APP_URL.startsWith("https://"),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function sessionCookieClearOptions() {
  return {
    ...sessionCookieOptions(),
    maxAge: 0,
  };
}

export async function createAdminSession(
  adminId: string,
  store: SessionStore = redis,
): Promise<string> {
  return createStoredSession(adminId, store);
}

export async function readAdminSession(
  token: string | null | undefined,
  store: SessionStore = redis,
): Promise<{ adminId: string } | null> {
  return readStoredSession(token, store);
}

export async function destroyAdminSession(
  token: string | null | undefined,
  store: SessionStore = redis,
): Promise<void> {
  return destroyStoredSession(token, store);
}
