import assert from "node:assert/strict";
import { test } from "node:test";
import { initialsFromName } from "@/components/admin/admin-nav";
import {
  adminProfileSummary,
  parseAdminEmail,
  parseDisplayName,
} from "./admin-account";

test("display name trims, clears, and stays on one line", () => {
  assert.deepEqual(parseDisplayName("  Ada Lovelace  "), {
    ok: true,
    name: "Ada Lovelace",
  });
  assert.deepEqual(parseDisplayName("   "), { ok: true, name: null });
  assert.deepEqual(parseDisplayName(null), { ok: true, name: null });
  assert.equal(parseDisplayName("a".repeat(80)).ok, true);
  assert.deepEqual(parseDisplayName("a".repeat(81)), {
    ok: false,
    error: "Display name must be 80 characters or fewer.",
  });
  assert.deepEqual(parseDisplayName("Ada\nLovelace"), {
    ok: false,
    error: "Enter a display name on one line.",
  });
});

test("admin email is trimmed and lowercased", () => {
  assert.deepEqual(parseAdminEmail("  Ada@Cadence.Test  "), {
    ok: true,
    email: "ada@cadence.test",
  });
  assert.deepEqual(parseAdminEmail("not-an-email"), {
    ok: false,
    error: "Enter a valid email address.",
  });
  assert.deepEqual(parseAdminEmail(""), {
    ok: false,
    error: "Enter a valid email address.",
  });
});

test("profile summary names the email and display name changes", () => {
  assert.equal(
    adminProfileSummary({
      previousEmail: "ada@cadence.test",
      email: "ada@cadence.test",
      previousName: null,
      name: "Ada",
    }),
    "Set display name to Ada",
  );
  assert.equal(
    adminProfileSummary({
      previousEmail: "ada@cadence.test",
      email: "ada@cadence.test",
      previousName: "Ada",
      name: null,
    }),
    "Cleared the display name",
  );
  assert.equal(
    adminProfileSummary({
      previousEmail: "ada@cadence.test",
      email: "new@cadence.test",
      previousName: null,
      name: "Ada",
    }),
    "Changed email from ada@cadence.test to new@cadence.test and set display name to Ada",
  );
  assert.equal(initialsFromName("Ada Lovelace"), "AL");
  assert.equal(initialsFromName("Ada"), "AD");
});
