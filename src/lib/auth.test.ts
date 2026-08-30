import assert from "node:assert/strict";
import { hash } from "bcryptjs";
import { test } from "node:test";
import { readBearerToken } from "./bearer";
import { readLoginClientIp } from "./client-ip";
import { normalizeEmail } from "./email";
import { adminLoginEmailKey } from "./login-keys";
import { matchAdminPassword } from "./password";
import {
  SessionStoreUnavailable,
  createAdminSession,
  destroyAdminSession,
  readAdminSession,
  sessionKey,
  type SessionStore,
} from "./session-store";

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Admin@Cadence.Local "), "admin@cadence.local");
});

test("matchAdminPassword accepts the real hash and rejects everything else", async () => {
  const passwordHash = await hash("cadence-admin", 12);
  assert.equal(await matchAdminPassword("cadence-admin", passwordHash), true);
  assert.equal(await matchAdminPassword("wrong-password", passwordHash), false);
  assert.equal(await matchAdminPassword("not-a-real-password", undefined), false);
  assert.equal(await matchAdminPassword("cadence-admin", undefined), false);
});

function memoryStore(): SessionStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async set(key, value) {
      data.set(key, value);
    },
    async get(key) {
      return data.get(key) ?? null;
    },
    async del(key) {
      data.delete(key);
    },
  };
}

test("session create/read/destroy and leftover token is not a session", async () => {
  const store = memoryStore();
  const token = await createAdminSession("admin-1", store);
  assert.equal((await readAdminSession(token, store))?.adminId, "admin-1");
  assert.ok(store.data.has(sessionKey(token)));

  assert.equal(await readAdminSession("cadence-dev", store), null);
  assert.equal(await readAdminSession(null, store), null);

  await destroyAdminSession(token, store);
  assert.equal(await readAdminSession(token, store), null);
});

test("readAdminSession surfaces store failures as SessionStoreUnavailable", async () => {
  const store: SessionStore = {
    async set() {
      throw new Error("down");
    },
    async get() {
      throw new Error("down");
    },
    async del() {
      throw new Error("down");
    },
  };

  await assert.rejects(
    () => readAdminSession("abc", store),
    SessionStoreUnavailable,
  );
});

test("readBearerToken parses Authorization and ignores junk", () => {
  assert.equal(readBearerToken("Bearer abc123"), "abc123");
  assert.equal(readBearerToken("bearer xyz"), "xyz");
  assert.equal(readBearerToken("Basic nope"), null);
  assert.equal(readBearerToken(null), null);
});

test("login limiter keys on email, not a spoofable forwarded IP", () => {
  assert.equal(
    adminLoginEmailKey("  Admin@Cadence.Local "),
    "rl:admin-login:email:admin@cadence.local",
  );
  assert.equal(readLoginClientIp({
    get(name) {
      if (name === "x-forwarded-for") {
        return "203.0.113.9";
      }
      return null;
    },
  }, false), "direct");
  assert.equal(readLoginClientIp({
    get(name) {
      if (name === "x-forwarded-for") {
        return "203.0.113.9, 10.0.0.1";
      }
      return null;
    },
  }, true), "203.0.113.9");
});
