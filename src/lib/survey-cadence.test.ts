import assert from "node:assert/strict";
import { test } from "node:test";
import { addSurveyCadence, nextSurveyWindow } from "./survey-cadence";

test("weekly, every 2 weeks, and monthly move both dates forward", () => {
  const opens = new Date("2026-01-05T09:00:00.000Z");
  const closes = new Date("2026-01-09T17:00:00.000Z");
  assert.equal(addSurveyCadence(opens, "weekly").toISOString(), "2026-01-12T09:00:00.000Z");
  assert.equal(addSurveyCadence(opens, "biweekly").toISOString(), "2026-01-19T09:00:00.000Z");
  assert.equal(addSurveyCadence(opens, "monthly").toISOString(), "2026-02-05T09:00:00.000Z");
  assert.equal(addSurveyCadence(closes, "weekly").toISOString(), "2026-01-16T17:00:00.000Z");
});

test("a late close skips windows that have already ended", () => {
  const now = new Date("2026-01-28T12:00:00.000Z");
  const window = nextSurveyWindow(
    new Date("2026-01-05T09:00:00.000Z"),
    new Date("2026-01-09T17:00:00.000Z"),
    "weekly",
    now,
  );
  assert.ok(window);
  assert.equal(window.opensAt.toISOString(), "2026-01-26T09:00:00.000Z");
  assert.equal(window.closesAt.toISOString(), "2026-01-30T17:00:00.000Z");
  assert.ok(window.closesAt > now);
});

test("monthly recurrence keeps the original day after a short month", () => {
  const opens = new Date("2026-01-31T09:00:00.000Z");
  const closes = new Date("2026-02-04T17:00:00.000Z");
  assert.equal(addSurveyCadence(opens, "monthly", 1).toISOString(), "2026-02-28T09:00:00.000Z");
  assert.equal(addSurveyCadence(opens, "monthly", 2).toISOString(), "2026-03-31T09:00:00.000Z");
  assert.equal(addSurveyCadence(opens, "monthly", 3).toISOString(), "2026-04-30T09:00:00.000Z");
  const window = nextSurveyWindow(opens, closes, "monthly", new Date("2026-04-15T12:00:00.000Z"));
  assert.ok(window);
  assert.equal(window.opensAt.toISOString(), "2026-04-30T09:00:00.000Z");
  assert.equal(window.closesAt.toISOString(), "2026-05-04T17:00:00.000Z");
});

test("a monthly leap day returns in the next leap year", () => {
  const leap = new Date("2024-02-29T09:00:00.000Z");
  assert.equal(addSurveyCadence(leap, "monthly", 12).toISOString(), "2025-02-28T09:00:00.000Z");
  assert.equal(addSurveyCadence(leap, "monthly", 48).toISOString(), "2028-02-29T09:00:00.000Z");
});

test("a long outage skips to the first window that is still open", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  const closes = new Date("2024-01-05T17:00:00.000Z");
  const window = nextSurveyWindow(
    new Date("2024-01-01T09:00:00.000Z"),
    closes,
    "weekly",
    now,
  );
  assert.ok(window);
  assert.ok(window.closesAt > now);
  assert.ok(new Date(window.closesAt.getTime() - 7 * 86_400_000) <= now);
  assert.ok(window.opensAt < window.closesAt);
});
