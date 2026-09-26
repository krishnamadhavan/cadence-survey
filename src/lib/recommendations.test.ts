import assert from "node:assert/strict";
import { test } from "node:test";
import { followUpFor } from "./recommendations";

test("low follow-up is stronger than watch, and ok has none", () => {
  const low = followUpFor("low");
  const watch = followUpFor("watch");
  assert.ok(low);
  assert.ok(watch);
  assert.notEqual(low, watch);
  assert.match(low, /this week/);
  assert.equal(followUpFor("ok"), null);
});
