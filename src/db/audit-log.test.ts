import "./../lib/load-env";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { test } from "node:test";
import { listAuditEvents, recordAudit, searchAuditEvents } from "@/db/audit-log";
import { db, pg } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { auditActionLabel } from "@/lib/audit-csv";
import { auditDayAfter, auditDayStart, type AuditSort } from "@/lib/audit-search";

const stamp = Date.now();
const actor = `audit-${stamp}@cadence.test`;
const aaa = `aaa-${stamp}@cadence.test`;
const zzz = `zzz-${stamp}@cadence.test`;
const pct = `pct-${stamp}@cadence.test`;
const plain = `plain-${stamp}@cadence.test`;
const emails = [actor, aaa, zzz, pct, plain];

function day(isoDate: string) {
  return auditDayStart(isoDate, 0);
}

function dayAfter(isoDate: string) {
  return auditDayStart(auditDayAfter(isoDate), 0);
}

function haystack(event: { actorEmail: string; action: string; summary: string }) {
  return `${event.actorEmail}\n${event.action}\n${auditActionLabel(event.action)}\n${event.summary}`.toLowerCase();
}

test("lists, searches, and sorts audit events", async (t) => {
  t.after(async () => {
    try {
      await db.delete(auditEvents).where(inArray(auditEvents.actorEmail, emails));
    } finally {
      await pg.end({ timeout: 2 });
    }
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
  await recordAudit({
    actorId: null,
    actorEmail: aaa,
    action: "admin.added",
    summary: `Alpha ${stamp}`,
    createdAt: new Date("2026-01-15T00:00:00.000Z"),
  });
  await recordAudit({
    actorId: null,
    actorEmail: zzz,
    action: "manager.unassigned",
    summary: `Zulu ${stamp}`,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
  });
  await recordAudit({
    actorId: null,
    actorEmail: pct,
    action: "admin.removed",
    summary: `100% ${stamp}`,
    createdAt: new Date("2026-05-01T02:00:00.000Z"),
  });
  await recordAudit({
    actorId: null,
    actorEmail: plain,
    action: "employees.reassigned",
    summary: `Plain ${stamp}`,
    createdAt: new Date("2026-05-01T01:00:00.000Z"),
  });

  const mine = (await listAuditEvents()).filter((event) => event.actorEmail === actor);
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

  async function search(overrides: {
    text?: string;
    from?: Date | null;
    toExclusive?: Date | null;
    sort?: AuditSort;
    direction?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  }) {
    return searchAuditEvents({
      text: String(stamp),
      from: null,
      toExclusive: null,
      sort: "when",
      direction: "desc",
      page: 1,
      pageSize: 20,
      ...overrides,
    });
  }

  const newest = await search({});
  assert.equal(newest.total, 7);
  assert.equal(newest.page, 1);
  assert.deepEqual(
    newest.events.map((event) => event.summary),
    [
      `100% ${stamp}`,
      `Plain ${stamp}`,
      `Zulu ${stamp}`,
      "Changed the anonymity floor from 3 to 5",
      "Revoked API key HRIS sync",
      `Alpha ${stamp}`,
      "Added admin older@cadence.test",
    ],
  );

  const pageOne = await search({ pageSize: 2 });
  const pageTwo = await search({ page: 2, pageSize: 2 });
  const pastEnd = await search({ page: 9, pageSize: 2 });
  assert.deepEqual(
    pageOne.events.map((event) => event.summary),
    [`100% ${stamp}`, `Plain ${stamp}`],
  );
  assert.deepEqual(
    pageTwo.events.map((event) => event.summary),
    [`Zulu ${stamp}`, "Changed the anonymity floor from 3 to 5"],
  );
  assert.equal(pastEnd.page, 4);
  assert.equal(pastEnd.total, 7);
  assert.deepEqual(pastEnd.events.map((event) => event.summary), [
    "Added admin older@cadence.test",
  ]);

  const byWho = await search({ sort: "who", direction: "asc" });
  assert.deepEqual(
    byWho.events.map((event) => event.actorEmail),
    [aaa, actor, actor, actor, pct, plain, zzz],
  );
  assert.deepEqual(
    byWho.events.filter((event) => event.actorEmail === actor).map((event) => event.action),
    ["anonymity_floor.changed", "api_key.revoked", "admin.added"],
  );

  const byDetail = await search({ sort: "detail", direction: "asc" });
  assert.deepEqual(
    byDetail.events.map((event) => event.summary),
    [
      `100% ${stamp}`,
      "Added admin older@cadence.test",
      `Alpha ${stamp}`,
      "Changed the anonymity floor from 3 to 5",
      `Plain ${stamp}`,
      "Revoked API key HRIS sync",
      `Zulu ${stamp}`,
    ],
  );

  // "Manager unassigned" sorts before "People moved"; the raw codes sort the other way.
  const byAction = await search({ sort: "action", direction: "asc" });
  assert.deepEqual(
    byAction.events.map((event) => auditActionLabel(event.action)),
    [
      "Admin added",
      "Admin added",
      "Admin removed",
      "Anonymity floor",
      "API key revoked",
      "Manager unassigned",
      "People moved",
    ],
  );
  assert.equal(byAction.events[0]?.actorEmail, aaa);
  assert.equal(byAction.events[1]?.summary, "Added admin older@cadence.test");

  const ranged = await search({
    from: day("2026-02-01"),
    toExclusive: dayAfter("2026-03-01"),
  });
  assert.equal(ranged.total, 2);
  assert.deepEqual(
    ranged.events.map((event) => event.action),
    ["anonymity_floor.changed", "api_key.revoked"],
  );

  const oneDay = await search({
    from: day("2026-02-01"),
    toExclusive: dayAfter("2026-02-01"),
  });
  assert.equal(oneDay.total, 1);
  assert.equal(oneDay.events[0]?.action, "api_key.revoked");

  const floorId = newest.events.find((event) => event.action === "anonymity_floor.changed")?.id;
  const addedId = newest.events.find((event) => event.summary === "Added admin older@cadence.test")
    ?.id;
  const labelHits = await search({
    text: "Anonymity floor",
    from: day("2026-03-01"),
    toExclusive: dayAfter("2026-03-01"),
  });
  assert.ok(floorId);
  assert.ok(labelHits.events.some((event) => event.id === floorId));
  assert.ok(labelHits.events.every((event) => event.id !== addedId));
  assert.ok(labelHits.events.every((event) => haystack(event).includes("anonymity floor")));

  const labelOnly = await search({
    text: "Admin added",
    from: day("2026-01-01"),
    toExclusive: dayAfter("2026-01-15"),
  });
  const addedIds = newest.events
    .filter((event) => event.action === "admin.added")
    .map((event) => event.id);
  assert.equal(addedIds.length, 2);
  for (const id of addedIds) {
    assert.ok(labelOnly.events.some((event) => event.id === id));
  }
  assert.ok(labelOnly.events.every((event) => event.id !== floorId));
  assert.ok(labelOnly.events.every((event) => haystack(event).includes("admin added")));

  const alpha = await search({ text: `Alpha ${stamp}` });
  assert.equal(alpha.total, 1);
  assert.equal(alpha.events[0]?.actorEmail, aaa);

  const who = await search({ text: aaa });
  assert.equal(who.total, 1);
  assert.equal(who.events[0]?.summary, `Alpha ${stamp}`);

  const raw = await search({
    text: "api_key.revoked",
    from: day("2026-02-01"),
    toExclusive: dayAfter("2026-02-01"),
  });
  assert.equal(raw.events[0]?.id, oneDay.events[0]?.id);
  assert.ok(raw.events.every((event) => haystack(event).includes("api_key.revoked")));

  const pctId = newest.events.find((event) => event.actorEmail === pct)?.id;
  const plainId = newest.events.find((event) => event.actorEmail === plain)?.id;
  const escaped = await search({
    text: "%",
    from: day("2026-05-01"),
    toExclusive: dayAfter("2026-05-01"),
  });
  assert.ok(pctId);
  assert.ok(plainId);
  assert.ok(escaped.events.some((event) => event.id === pctId));
  assert.ok(escaped.events.every((event) => event.id !== plainId));
  assert.ok(escaped.events.every((event) => haystack(event).includes("%")));

  const unfiltered = await searchAuditEvents({
    text: "",
    from: null,
    toExclusive: null,
    sort: "when",
    direction: "desc",
    page: 1,
    pageSize: 5,
  });
  assert.ok(unfiltered.total >= 7);
  assert.ok(unfiltered.events.length > 0);
  assert.ok(unfiltered.events.length <= 5);
});
