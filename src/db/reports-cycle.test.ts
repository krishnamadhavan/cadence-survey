import assert from "node:assert/strict";
import { test } from "node:test";
import type { SurveyStatus } from "@/db/schema";
import { pickPreviousCycle } from "./reports-cycle";

function item(token: string, status: SurveyStatus) {
  return { publicToken: token, status };
}

test("pickPreviousCycle skips drafts and uses the next older open or closed pulse", () => {
  const newestFirst = [
    item("draft-new", "draft"),
    item("open-now", "open"),
    item("closed-old", "closed"),
  ];
  const picked = pickPreviousCycle(newestFirst, "open-now");
  assert.deepEqual(
    picked.cycles.map((survey) => survey.publicToken),
    ["open-now", "closed-old"],
  );
  assert.equal(picked.previous?.publicToken, "closed-old");
});

test("pickPreviousCycle has no previous for the oldest cycle", () => {
  const newestFirst = [item("newer", "open"), item("older", "closed")];
  const picked = pickPreviousCycle(newestFirst, "older");
  assert.equal(picked.cycles.length, 2);
  assert.equal(picked.previous, null);
});
