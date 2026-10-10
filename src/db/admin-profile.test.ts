import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
  createAdmin,
} from "@/db/admins";
import {
  changeOwnAdminPassword,
  readOwnAdminAccount,
  updateOwnAdminAccount,
} from "@/db/admin-profile";
import { db, pg } from "@/db/client";
import { admins, auditEvents } from "@/db/schema";
import { verifyAdminCredentials } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  createAdminSession,
  destroySessionsForAdmin,
  readAdminSession,
} from "@/lib/session";

const stamp = Date.now();
const emailA = `profile-a-${stamp}@cadence.test`;
const emailB = `profile-b-${stamp}@cadence.test`;
const emailNext = `profile-a-next-${stamp}@cadence.test`;
const password = "a-long-password";
const nextPassword = "another-long-password";

test("an admin updates their own name, email, and password", async (t) => {
  const emails = [emailA, emailB, emailNext];
  let adminId = "";
  t.after(async () => {
    try {
      if (adminId) {
        await destroySessionsForAdmin(adminId);
        await db.delete(auditEvents).where(eq(auditEvents.actorId, adminId));
      }
      await db.delete(admins).where(inArray(admins.email, emails));
    } finally {
      await pg.end({ timeout: 2 });
      await redis.quit();
    }
  });

  const created = await createAdmin({ email: `  ${emailA.toUpperCase()}  `, password });
  adminId = created.id;
  const other = await createAdmin({ email: emailB, password });
  assert.equal((await readOwnAdminAccount(created.id)).name, null);

  const named = await updateOwnAdminAccount({
    id: created.id,
    name: "  Ada Lovelace  ",
    email: emailA,
  });
  assert.equal(named.changed, true);
  assert.equal(named.name, "Ada Lovelace");
  assert.equal(named.previousName, null);
  assert.equal((await readOwnAdminAccount(created.id)).name, "Ada Lovelace");
  assert.equal(
    (await profileAudits(created.id)).some(
      (row) => row.summary === "Set display name to Ada Lovelace",
    ),
    true,
  );

  const unchanged = await updateOwnAdminAccount({
    id: created.id,
    name: "Ada Lovelace",
    email: `  ${emailA.toUpperCase()}  `,
  });
  assert.equal(unchanged.changed, false);
  assert.equal((await profileAudits(created.id)).length, 1);

  await assert.rejects(
    () =>
      updateOwnAdminAccount({
        id: created.id,
        name: "a".repeat(81),
        email: emailA,
      }),
    (error: unknown) => {
      assert.ok(error instanceof AdminValidationError);
      assert.equal(error.message, "Display name must be 80 characters or fewer.");
      return true;
    },
  );
  assert.equal((await readOwnAdminAccount(created.id)).name, "Ada Lovelace");

  await assert.rejects(
    () => updateOwnAdminAccount({ id: created.id, name: "Ada", email: emailB }),
    (error: unknown) => {
      assert.ok(error instanceof AdminConflictError);
      assert.equal(error.message, "An admin with that email already exists.");
      return true;
    },
  );
  assert.equal((await readOwnAdminAccount(created.id)).email, emailA);

  const moved = await updateOwnAdminAccount({
    id: created.id,
    name: "   ",
    email: emailNext,
  });
  assert.equal(moved.changed, true);
  assert.equal(moved.email, emailNext);
  assert.equal(moved.previousEmail, emailA);
  assert.equal(moved.name, null);
  assert.equal((await verifyAdminCredentials(emailA, password)), null);
  assert.equal((await verifyAdminCredentials(emailNext, password))?.id, created.id);

  await assert.rejects(
    () =>
      updateOwnAdminAccount({
        id: "00000000-0000-4000-8000-000000000000",
        name: "Ada",
        email: emailNext,
      }),
    AdminNotFoundError,
  );

  const keep = await createAdminSession(created.id);
  const otherSession = await createAdminSession(created.id);
  await assert.rejects(
    () =>
      changeOwnAdminPassword({
        id: created.id,
        currentPassword: "wrong-password",
        nextPassword,
        confirmPassword: nextPassword,
        keepSessionToken: keep,
      }),
    (error: unknown) => {
      assert.ok(error instanceof AdminValidationError);
      assert.equal(error.message, "Current password is wrong.");
      return true;
    },
  );
  assert.equal((await verifyAdminCredentials(emailNext, password))?.id, created.id);

  await assert.rejects(
    () =>
      changeOwnAdminPassword({
        id: created.id,
        currentPassword: password,
        nextPassword: "short",
        confirmPassword: "short",
        keepSessionToken: keep,
      }),
    (error: unknown) => {
      assert.ok(error instanceof AdminValidationError);
      assert.equal(error.message, "Password must be 8–200 characters.");
      return true;
    },
  );
  await assert.rejects(
    () =>
      changeOwnAdminPassword({
        id: created.id,
        currentPassword: password,
        nextPassword,
        confirmPassword: "different-long-password",
        keepSessionToken: keep,
      }),
    (error: unknown) => {
      assert.ok(error instanceof AdminValidationError);
      assert.equal(error.message, "New password and confirmation do not match.");
      return true;
    },
  );
  await assert.rejects(
    () =>
      changeOwnAdminPassword({
        id: created.id,
        currentPassword: password,
        nextPassword: password,
        confirmPassword: password,
        keepSessionToken: keep,
      }),
    (error: unknown) => {
      assert.ok(error instanceof AdminValidationError);
      assert.equal(error.message, "Choose a different password.");
      return true;
    },
  );

  const changed = await changeOwnAdminPassword({
    id: created.id,
    currentPassword: password,
    nextPassword,
    confirmPassword: nextPassword,
    keepSessionToken: keep,
  });
  assert.equal(changed.email, emailNext);
  assert.equal((await verifyAdminCredentials(emailNext, password)), null);
  assert.equal((await verifyAdminCredentials(emailNext, nextPassword))?.id, created.id);
  assert.equal((await readAdminSession(keep))?.adminId, created.id);
  assert.equal(await readAdminSession(otherSession), null);
  assert.equal(
    (await profileAudits(created.id)).some(
      (row) => row.action === "admin.password_changed" && row.summary === "Changed password",
    ),
    true,
  );
  assert.equal((await verifyAdminCredentials(emailB, password))?.id, other.id);

  const [stored] = await db
    .select({ passwordHash: admins.passwordHash, name: admins.name })
    .from(admins)
    .where(eq(admins.id, created.id))
    .limit(1);
  assert.ok(stored);
  assert.notEqual(stored.passwordHash, nextPassword);
  assert.equal(stored.name, null);
});

async function profileAudits(actorId: string) {
  return db
    .select({ action: auditEvents.action, summary: auditEvents.summary })
    .from(auditEvents)
    .where(eq(auditEvents.actorId, actorId));
}
