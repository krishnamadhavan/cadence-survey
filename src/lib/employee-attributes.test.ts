import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRole, parseTenureBand } from "./employee-attributes";

test("parseTenureBand accepts the three bands and blanks", () => {
  assert.equal(parseTenureBand(""), null);
  assert.equal(parseTenureBand("  "), null);
  assert.equal(parseTenureBand("<1yr"), "lt_1");
  assert.equal(parseTenureBand("< 1 yr"), "lt_1");
  assert.equal(parseTenureBand("1-3yr"), "y1_3");
  assert.equal(parseTenureBand("1–3"), "y1_3");
  assert.equal(parseTenureBand("3yr+"), "gte_3");
  assert.equal(parseTenureBand("3 +"), "gte_3");
  assert.equal(parseTenureBand("forever"), "invalid");
});

test("parseRole trims and rejects a long value", () => {
  const blank = parseRole("  ");
  assert.equal(blank.ok, true);
  if (blank.ok) {
    assert.equal(blank.role, null);
  }
  assert.deepEqual(parseRole("  Staff   engineer "), { ok: true, role: "Staff engineer" });
  const long = parseRole("x".repeat(81));
  assert.equal(long.ok, false);
});
