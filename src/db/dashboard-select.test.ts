import assert from "node:assert/strict";
import { test } from "node:test";
import { arrangeDashboardSurveys } from "./dashboard-select";

test("arrangeDashboardSurveys features the newest open survey", () => {
  const arranged = arrangeDashboardSurveys([
    { id: "old-open", status: "open" },
    { id: "closed", status: "closed" },
    { id: "new-open", status: "open" },
  ]);
  assert.equal(arranged.featured?.id, "new-open");
  assert.deepEqual(
    arranged.newestFirst.map((survey) => survey.id),
    ["new-open", "closed", "old-open"],
  );
});

test("arrangeDashboardSurveys has no featured cycle when nothing is open", () => {
  const arranged = arrangeDashboardSurveys([
    { id: "old-closed", status: "closed" },
    { id: "draft", status: "draft" },
  ]);
  assert.equal(arranged.featured, null);
  assert.equal(arranged.newestFirst[0]?.id, "draft");
});

test("arrangeDashboardSurveys returns empty lists when there are no surveys", () => {
  const arranged = arrangeDashboardSurveys([]);
  assert.equal(arranged.featured, null);
  assert.deepEqual(arranged.newestFirst, []);
});
