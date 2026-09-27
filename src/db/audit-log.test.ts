import "./../lib/load-env";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { test } from "node:test";
import { listAuditEvents, recordAudit } from "@/db/audit-log";
import { db, pg } from "@/db/client";
import { auditEvents } from "@/db/schema";

const stamp = Date.now();
const actor = `audit-${stamp}@cadence.test`;

test("lists audit events newest first with who and when", async (t) => {
  const ids: string[] = [];
  t.after(async () => {
    if (ids.length > 0) {
      await db.delete(auditEvents).where(inArray(auditEvents.id, ids));
    }
    await pg.end({ timeout: 2 });
  });

  await recordAudit({
    actorId: null,
    actorEmail: actor,
    action: "admin.added",
    summary: "Added admin older@cadence.test",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  await recordAudit({
    actorId: null,
    actorEmail: actor,
    action: "anonymity_floor.changed",
    summary: "Changed the anonymity floor from 3 to 5",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
  });
  await recordAudit({
    actorId: null,
    actorEmail: actor,
    action: "api_key.revoked",
    summary: "Revoked API key HRIS sync",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
  });

  const mine = (await listAuditEvents()).filter((event) => event.actorEmail === actor);
  ids.push(...mine.map((event) => event.id));
  assert.deepEqual(
    mine.map((event) => event.action),
    ["anonymity_floor.changed", "api_key.revoked", "admin.added"],
  );
  assert.equal(mine[0]?.summary, "Changed the anonymity floor from 3 to 5");
  assert.ok(mine.every((event) => event.createdAt));

  const pageSize = 2;
  const first = mine.slice(0, pageSize);
  const second = mine.slice(pageSize, pageSize * 2);
  assert.equal(first.length, 2);
  assert.equal(second.length, 1);
  assert.equal(second[0]?.action, "admin.added");
});
