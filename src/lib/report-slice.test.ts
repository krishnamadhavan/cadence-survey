import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReportSlice } from "./report-slice";

test("blank filters mean the whole report", () => {
  assert.deepEqual(parseReportSlice({ teamId: "  ", role: "", tenure: null }), {
    teamId: null,
    role: null,
    tenure: null,
    unmatched: false,
  });
});

test("a role is trimmed and an unknown tenure or team matches nothing", () => {
  assert.deepEqual(
    parseReportSlice({
      teamId: "ABCDEFFF-1111-4222-8333-444444444444",
      role: "  Engineer  ",
      tenure: "<1yr",
    }),
    {
      teamId: "abcdefff-1111-4222-8333-444444444444",
      role: "Engineer",
      tenure: "lt_1",
      unmatched: false,
    },
  );

  const badTeam = parseReportSlice({ teamId: "not-a-team", role: "Engineer" });
  assert.equal(badTeam.unmatched, true);
  assert.equal(badTeam.teamId, null);
  assert.equal(badTeam.role, "Engineer");

  const badTenure = parseReportSlice({ tenure: "nope", role: "Engineer" });
  assert.equal(badTenure.unmatched, true);
  assert.equal(badTenure.tenure, null);
  assert.equal(badTenure.role, "Engineer");
});

test("an over-long role is kept as a value that matches nothing", () => {
  const slice = parseReportSlice({ role: "x".repeat(81) });
  assert.equal(slice.unmatched, false);
  assert.equal(slice.role?.length, 81);
});
