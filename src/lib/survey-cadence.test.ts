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
  const window = nextSurveyWindow(
    new Date("2026-01-05T09:00:00.000Z"),
    new Date("2026-01-09T17:00:00.000Z"),
    "weekly",
    new Date("2026-01-28T12:00:00.000Z"),
  );
  assert.equal(window.opensAt.toISOString(), "2026-01-26T09:00:00.000Z");
  assert.equal(window.closesAt.toISOString(), "2026-01-30T17:00:00.000Z");
});
