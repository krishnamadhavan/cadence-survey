import { randomBytes } from "node:crypto";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export class SessionStoreUnavailable extends Error {
  constructor() {
    super("Session store unavailable");
    this.name = "SessionStoreUnavailable";
  }
}

export type SessionStore = {
  set(key: string, value: string, flag: "EX", ttl: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
};

export function sessionKey(token: string): string {
  return `session:admin:${token}`;
}

function wrapStoreError(error: unknown): never {
  if (error instanceof SessionStoreUnavailable) {
    throw error;
  }
  throw new SessionStoreUnavailable();
}

export async function createAdminSession(
  adminId: string,
  store: SessionStore,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  try {
    await store.set(sessionKey(token), adminId, "EX", SESSION_TTL_SECONDS);
  } catch (error) {
    wrapStoreError(error);
  }
  return token;
}

export async function readAdminSession(
  token: string | null | undefined,
  store: SessionStore,
): Promise<{ adminId: string } | null> {
  if (!token) {
    return null;
  }
  try {
    const adminId = await store.get(sessionKey(token));
    if (!adminId) {
      return null;
    }
    return { adminId };
  } catch (error) {
    wrapStoreError(error);
  }
}

export async function destroyAdminSession(
  token: string | null | undefined,
  store: SessionStore,
): Promise<void> {
  if (!token) {
    return;
  }
  try {
    await store.del(sessionKey(token));
  } catch (error) {
    wrapStoreError(error);
  }
}
