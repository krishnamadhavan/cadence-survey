import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
  adminDeletionBlock,
  createAdmin,
  deleteAdmin,
  listAdmins,
} from "@/db/admins";
import { db, pg } from "@/db/client";
import { admins } from "@/db/schema";
import { verifyAdminCredentials } from "@/lib/auth";

const stamp = Date.now();
const emailA = `admin-a-${stamp}@cadence.test`;
const emailB = `admin-b-${stamp}@cadence.test`;

test("create, list, and remove admins without dropping the last account", async (t) => {
  const emails = [emailA, emailB];
  t.after(async () => {
    await db.delete(admins).where(inArray(admins.email, emails));
    await pg.end({ timeout: 2 });
  });

  const created = await createAdmin({
    email: `  ${emailA.toUpperCase()}  `,
    password: "a-long-password",
  });
  assert.equal(created.email, emailA);
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

  assert.equal(adminDeletionBlock([created.id], created.id, "other"), "last");
  assert.equal(adminDeletionBlock([created.id, second.id], created.id, created.id), "self");
  assert.equal(adminDeletionBlock([created.id], "missing", created.id), "missing");

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
});
