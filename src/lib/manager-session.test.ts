import assert from "node:assert/strict";
import { test } from "node:test";
import { managerLoginEmailKey } from "./login-keys";
import { safeManagerNext } from "./manager-path";
import {
  createAdminSession,
  createManagerSession,
  managerSessionKey,
  readAdminSession,
  readManagerSession,
  sessionKey,
  type SessionStore,
} from "./session-store";

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

test("manager and admin sessions do not share a token namespace", async () => {
  const store = memoryStore();
  const managerToken = await createManagerSession("employee-1", store);
  const adminToken = await createManagerSession("employee-1", store);
  assert.equal((await readManagerSession(managerToken, store))?.employeeId, "employee-1");
  assert.equal(await readAdminSession(managerToken, store), null);
  assert.ok(store.data.has(managerSessionKey(managerToken)));
  assert.equal(store.data.has(sessionKey(managerToken)), false);

  const realAdmin = await createAdminSession("admin-1", store);
  assert.equal((await readAdminSession(realAdmin, store))?.adminId, "admin-1");
  assert.equal(await readManagerSession(realAdmin, store), null);
  assert.equal((await readManagerSession(adminToken, store))?.employeeId, "employee-1");
});

test("manager login limiter keys stay off the admin limiter", () => {
  assert.equal(
    managerLoginEmailKey("  Lead@Cadence.Local "),
    "rl:manager-login:email:lead@cadence.local",
  );
});

test("manager next paths stay inside the portal", () => {
  assert.equal(safeManagerNext("/manage"), "/manage");
  assert.equal(safeManagerNext("/manage/teams"), "/manage/teams");
  assert.equal(safeManagerNext("/admin"), "/manage");
  assert.equal(safeManagerNext("/manage/../admin"), "/manage");
  assert.equal(safeManagerNext("//manage"), "/manage");
  assert.equal(safeManagerNext("https://evil.example/manage"), "/manage");
});
