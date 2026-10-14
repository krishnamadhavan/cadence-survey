import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTeamName, parseTeamOffice, parseTeamSlug, slugifyTeam } from "./team-slug";

test("slugifyTeam kebab-cases and strips accents", () => {
  assert.equal(slugifyTeam("Engineering"), "engineering");
  assert.equal(slugifyTeam("  People & Culture  "), "people-culture");
  assert.equal(slugifyTeam("Équipe Produit"), "equipe-produit");
});

test("parseTeamName trims and rejects empty or oversized names", () => {
  assert.equal(parseTeamName("  Design  "), "Design");
  assert.equal(parseTeamName("   "), null);
  assert.equal(parseTeamName("x".repeat(81)), null);
});

test("parseTeamOffice trims, keeps casing, and rejects an over-long value", () => {
  assert.deepEqual(parseTeamOffice("  London  "), { ok: true, office: "London" });
  assert.deepEqual(parseTeamOffice("New   York"), { ok: true, office: "New York" });
  assert.deepEqual(parseTeamOffice("   "), { ok: true, office: null });
  assert.deepEqual(parseTeamOffice(null), { ok: true, office: null });
  assert.deepEqual(parseTeamOffice("x".repeat(81)), { ok: false });
});

test("parseTeamSlug rejects values that slug to empty", () => {
  assert.equal(parseTeamSlug("Product Ops"), "product-ops");
  assert.equal(parseTeamSlug("@@@"), null);
});
