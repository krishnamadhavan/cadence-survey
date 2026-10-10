import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray, not } from "drizzle-orm";
import { test } from "node:test";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
  adminDeletionBlock,
  createAdmin,
  deleteAdmin,
  listAdmins,
  setAdminRole,
} from "@/db/admins";
import { db, pg } from "@/db/client";
import { admins } from "@/db/schema";
import { verifyAdminCredentials } from "@/lib/auth";
import { redis } from "@/lib/redis";

const stamp = Date.now();
const emailA = `admin-a-${stamp}@cadence.test`;
const emailB = `admin-b-${stamp}@cadence.test`;
const emailV = `admin-v-${stamp}@cadence.test`;
const emailC = `admin-c-${stamp}@cadence.test`;

test("create, list, and remove admins without dropping the last account", async (t) => {
  const emails = [emailA, emailB, emailV, emailC];
  const outsiders = await db
    .select({ id: admins.id, role: admins.role })
    .from(admins)
    .where(not(inArray(admins.email, emails)));
  t.after(async () => {
    for (const row of outsiders) {
      await db.update(admins).set({ role: row.role }).where(eq(admins.id, row.id));
    }
    await db.delete(admins).where(inArray(admins.email, emails));
    await pg.end({ timeout: 2 });
    await redis.quit();
  });

  const created = await createAdmin({
    email: `  ${emailA.toUpperCase()}  `,
    password: "a-long-password",
  });
  assert.equal(created.email, emailA);
  assert.equal(created.role, "admin");
  const signedIn = await verifyAdminCredentials(emailA, "a-long-password");
  assert.equal(signedIn?.id, created.id);

  const [stored] = await db
    .select({ passwordHash: admins.passwordHash })
    .from(admins)
    .where(eq(admins.email, emailA))
    .limit(1);
  assert.ok(stored);
  assert.notEqual(stored.passwordHash, "a-long-password");

  await assert.rejects(
    () => createAdmin({ email: emailA, password: "another-password" }),
    AdminConflictError,
  );
  await assert.rejects(
    () => createAdmin({ email: "not-an-email", password: "a-long-password" }),
    AdminValidationError,
  );
  await assert.rejects(
    () => createAdmin({ email: emailB, password: "short" }),
    AdminValidationError,
  );

  const second = await createAdmin({ email: emailB, password: "another-long-password" });
  const listed = await listAdmins();
  assert.ok(listed.some((account) => account.email === emailA));
  assert.ok(listed.some((account) => account.email === emailB));
  assert.equal(
    listed.some((account) => "passwordHash" in account),
    false,
  );

  assert.equal(
    adminDeletionBlock([{ id: created.id, role: "admin" }], created.id, "other"),
    "last",
  );
  assert.equal(
    adminDeletionBlock(
      [
        { id: created.id, role: "admin" },
        { id: second.id, role: "admin" },
      ],
      created.id,
      created.id,
    ),
    "self",
  );
  assert.equal(
    adminDeletionBlock([{ id: created.id, role: "admin" }], "missing", created.id),
    "missing",
  );

  await assert.rejects(
    () => deleteAdmin({ id: created.id, actorId: created.id }),
    AdminValidationError,
  );
  await deleteAdmin({ id: second.id, actorId: created.id });
  assert.equal(
    (await listAdmins()).some((account) => account.id === second.id),
    false,
  );
  assert.equal(await verifyAdminCredentials(emailB, "another-long-password"), null);

  await assert.rejects(
    () =>
      deleteAdmin({
        id: "00000000-0000-4000-8000-000000000000",
        actorId: created.id,
      }),
    AdminNotFoundError,
  );

  await assert.rejects(
    () => createAdmin({ email: emailV, password: "a-long-password", role: "owner" }),
    (error: unknown) => {
      assert.ok(error instanceof AdminValidationError);
      assert.equal(error.message, "Choose Admin or Viewer.");
      return true;
    },
  );

  const viewer = await createAdmin({
    email: emailV,
    password: "a-long-password",
    role: "viewer",
  });
  assert.equal(viewer.role, "viewer");
  const withViewer = await listAdmins();
  assert.equal(withViewer.find((account) => account.id === viewer.id)?.role, "viewer");
  assert.equal(
    adminDeletionBlock(
      [
        { id: created.id, role: "admin" },
        { id: viewer.id, role: "viewer" },
      ],
      viewer.id,
      created.id,
    ),
    null,
  );
  assert.equal(
    adminDeletionBlock(
      [
        { id: created.id, role: "admin" },
        { id: viewer.id, role: "viewer" },
      ],
      created.id,
      "other-actor",
    ),
    "last",
  );

  await db
    .update(admins)
    .set({ role: "viewer" })
    .where(not(inArray(admins.email, emails)));
  try {
    await assert.rejects(
      () => deleteAdmin({ id: created.id, actorId: viewer.id }),
      (error: unknown) => {
        assert.ok(error instanceof AdminValidationError);
        assert.equal(error.message, "Keep at least one admin who can make changes.");
        return true;
      },
    );
    await assert.rejects(
      () => setAdminRole({ id: created.id, actorId: viewer.id, role: "viewer" }),
      (error: unknown) => {
        assert.ok(error instanceof AdminValidationError);
        assert.equal(error.message, "Keep at least one admin who can make changes.");
        return true;
      },
    );
  } finally {
    for (const row of outsiders) {
      await db.update(admins).set({ role: row.role }).where(eq(admins.id, row.id));
    }
  }
  await assert.rejects(
    () => setAdminRole({ id: created.id, actorId: created.id, role: "viewer" }),
    (error: unknown) => {
      assert.ok(error instanceof AdminValidationError);
      assert.equal(error.message, "You can't change your own access.");
      return true;
    },
  );

  const third = await createAdmin({
    email: emailC,
    password: "another-long-password",
  });
  assert.equal(third.role, "admin");
  await assert.rejects(
    () => setAdminRole({ id: third.id, actorId: created.id, role: "owner" }),
    (error: unknown) => {
      assert.ok(error instanceof AdminValidationError);
      assert.equal(error.message, "Choose Admin or Viewer.");
      return true;
    },
  );
  const demoted = await setAdminRole({
    id: third.id,
    actorId: created.id,
    role: "viewer",
  });
  assert.equal(demoted.changed, true);
  assert.equal(demoted.email, emailC);
  assert.equal(demoted.role, "viewer");
  const unchanged = await setAdminRole({
    id: third.id,
    actorId: created.id,
    role: "viewer",
  });
  assert.equal(unchanged.changed, false);
  const promoted = await setAdminRole({
    id: third.id,
    actorId: created.id,
    role: "admin",
  });
  assert.equal(promoted.changed, true);
  assert.equal(promoted.role, "admin");
  assert.equal(
    (await listAdmins()).find((account) => account.id === third.id)?.role,
    "admin",
  );

  await deleteAdmin({ id: viewer.id, actorId: created.id });
  await deleteAdmin({ id: third.id, actorId: created.id });
  const remaining = await listAdmins();
  assert.equal(remaining.some((account) => account.id === viewer.id), false);
  assert.equal(remaining.some((account) => account.id === third.id), false);
  assert.equal(remaining.some((account) => account.id === created.id), true);
});
