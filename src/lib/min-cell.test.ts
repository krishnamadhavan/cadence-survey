import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_TEAM_RESPONSES, planTeamPublish } from "./min-cell";

test("hides teams below the minimum", () => {
  const plan = planTeamPublish([
    { key: "eng", count: 5 },
    { key: "design", count: 2 },
    { key: "product", count: 2 },
  ]);

  assert.deepEqual(plan.namedKeys.sort(), ["eng"]);
  assert.deepEqual(plan.suppressedKeys.sort(), ["design", "product"]);
  assert.equal(plan.showSuppressedBucket, true);
});

test("folds a named team when the leftover would be 1–2 people", () => {
  const plan = planTeamPublish([
    { key: "eng", count: 3 },
    { key: "ops", count: 3 },
    { key: "design", count: 2 },
  ]);

  assert.ok(!plan.namedKeys.includes("design"));
  assert.equal(plan.showSuppressedBucket, true);
  assert.ok(plan.suppressedKeys.includes("design"));
  assert.ok(plan.suppressedKeys.length >= 2);
  const namedCount = plan.namedKeys.length;
  assert.ok(namedCount <= 1);
});

test("shows no team names when everyone is below the minimum", () => {
  const plan = planTeamPublish([
    { key: "a", count: 1 },
    { key: "b", count: 1 },
  ]);

  assert.deepEqual(plan.namedKeys, []);
  assert.equal(plan.showSuppressedBucket, false);
  assert.equal(MIN_TEAM_RESPONSES, 3);
});
