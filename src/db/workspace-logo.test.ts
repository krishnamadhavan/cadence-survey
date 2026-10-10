import "./../lib/load-env";
import assert from "node:assert/strict";
import { test } from "node:test";
import { asc, eq } from "drizzle-orm";
import { GET } from "@/app/brand/logo/route";
import { db, pg } from "@/db/client";
import { admins, auditEvents, workspaceSettings } from "@/db/schema";
import {
  SettingsValidationError,
  clearWorkspaceLogo,
  getAnonymityFloor,
  getWorkspaceLogo,
  getWorkspaceLogoStamp,
  setWorkspaceLogo,
} from "@/db/settings";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG = Uint8Array.from(Buffer.from(PNG_BASE64, "base64"));

test("stores a workspace logo without changing the anonymity floor", async (t) => {
  const [before] = await db
    .select({
      floor: workspaceSettings.anonymityFloor,
      logo: workspaceSettings.logo,
      contentType: workspaceSettings.logoContentType,
      updatedAt: workspaceSettings.logoUpdatedAt,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.id, "default"))
    .limit(1);

  const email = `logo-${Date.now()}@cadence.test`;
  const [admin] = await db
    .insert(admins)
    .values({ email, passwordHash: "test-only-hash" })
    .returning({ id: admins.id });
  assert.ok(admin);
  const actor = { id: admin.id, email };

  t.after(async () => {
    try {
      if (before) {
        await db
          .update(workspaceSettings)
          .set({
            anonymityFloor: before.floor,
            logo: before.logo,
            logoContentType: before.contentType,
            logoUpdatedAt: before.updatedAt,
          })
          .where(eq(workspaceSettings.id, "default"));
      } else {
        await db.delete(workspaceSettings).where(eq(workspaceSettings.id, "default"));
      }
    } finally {
      await db.delete(auditEvents).where(eq(auditEvents.actorEmail, email));
      await db.delete(admins).where(eq(admins.email, email));
      await pg.end({ timeout: 2 });
    }
  });

  const floor = await getAnonymityFloor();

  await setWorkspaceLogo({ bytes: PNG, contentType: "image/png", actor });
  assert.equal(await getAnonymityFloor(), floor);

  const stored = await getWorkspaceLogo();
  assert.ok(stored);
  assert.equal(stored.contentType, "image/png");
  assert.deepEqual(stored.bytes, PNG);

  const stamp = await getWorkspaceLogoStamp();
  assert.equal(typeof stamp, "number");
  assert.ok(stamp !== null && Math.abs(Date.now() - stamp) < 60_000);

  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PNG);

  await assert.rejects(
    () => setWorkspaceLogo({ bytes: PNG, contentType: "image/jpeg", actor }),
    SettingsValidationError,
  );
  const still = await getWorkspaceLogo();
  assert.equal(still?.contentType, "image/png");
  assert.deepEqual(still?.bytes, PNG);
  assert.equal(await getAnonymityFloor(), floor);

  await clearWorkspaceLogo({ actor });
  assert.equal(await getWorkspaceLogo(), null);
  assert.equal(await getWorkspaceLogoStamp(), null);
  assert.equal(await getAnonymityFloor(), floor);
  const missing = await GET();
  assert.equal(missing.status, 404);

  await clearWorkspaceLogo({ actor });

  const audits = await db
    .select({
      action: auditEvents.action,
      summary: auditEvents.summary,
    })
    .from(auditEvents)
    .where(eq(auditEvents.actorEmail, email))
    .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id));
  assert.deepEqual(
    audits.map((row) => row.summary),
    ["Uploaded a workspace logo", "Removed the workspace logo"],
  );
  assert.ok(audits.every((row) => row.action === "workspace_logo.changed"));
  assert.ok(audits.every((row) => !row.summary.includes(PNG_BASE64)));
});
