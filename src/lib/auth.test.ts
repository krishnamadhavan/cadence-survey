import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEmail } from "./email";

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Admin@Cadence.Local "), "admin@cadence.local");
});
