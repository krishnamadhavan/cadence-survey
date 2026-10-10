import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import {
  SESSION_TTL_SECONDS,
  SessionStoreUnavailable,
  createAdminSession as createStoredSession,
  createManagerSession as createStoredManagerSession,
  destroyAdminSession as destroyStoredSession,
  destroyManagerSession as destroyStoredManagerSession,
  readAdminSession as readStoredSession,
  readManagerSession as readStoredManagerSession,
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
export const MANAGER_SESSION_COOKIE = "cadence_manager";

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

export async function destroySessionsForAdmin(adminId: string): Promise<void> {
  await destroySessionsMatching("session:admin:*", adminId);
}

export async function destroyOtherAdminSessions(
  adminId: string,
  keepToken: string | null | undefined,
): Promise<void> {
  const keepKey = keepToken ? sessionKey(keepToken) : null;
  await destroySessionsMatching("session:admin:*", adminId, keepKey);
}

export async function createManagerSession(
  employeeId: string,
  store: SessionStore = redis,
): Promise<string> {
  return createStoredManagerSession(employeeId, store);
}

export async function readManagerSession(
  token: string | null | undefined,
  store: SessionStore = redis,
): Promise<{ employeeId: string } | null> {
  return readStoredManagerSession(token, store);
}

export async function destroyManagerSession(
  token: string | null | undefined,
  store: SessionStore = redis,
): Promise<void> {
  return destroyStoredManagerSession(token, store);
}

export async function destroySessionsForManager(employeeId: string): Promise<void> {
  await destroySessionsMatching("session:manager:*", employeeId);
}

async function destroySessionsMatching(
  pattern: string,
  subjectId: string,
  keepKey: string | null = null,
): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = (await redis.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      100,
    )) as [string, string[]];
    cursor = next;
    if (keys.length === 0) {
      continue;
    }
    const values = await redis.mget(...keys);
    const stale = keys.filter(
      (key, index) => values[index] === subjectId && key !== keepKey,
    );
    if (stale.length > 0) {
      await redis.del(...stale);
    }
  } while (cursor !== "0");
}
