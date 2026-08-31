import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSessionUser } from "./admin-user";

test("resolveSessionUser uses the directory row when lookup succeeds", async () => {
  const user = await resolveSessionUser("admin-1", async () => ({
    id: "admin-1",
    email: "admin@cadence.local",
  }));
  assert.deepEqual(user, { id: "admin-1", email: "admin@cadence.local" });
});

test("resolveSessionUser falls back when the admin row is missing", async () => {
  const user = await resolveSessionUser("admin-1", async () => undefined);
  assert.deepEqual(user, { id: "admin-1", email: "Admin" });
});

test("resolveSessionUser falls back when the directory lookup throws", async () => {
  const user = await resolveSessionUser("admin-1", async () => {
    throw new Error("connect ECONNREFUSED");
  });
  assert.deepEqual(user, { id: "admin-1", email: "Admin" });
});
