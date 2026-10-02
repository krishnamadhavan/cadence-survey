import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFeedbackCsv } from "./feedback-csv";

test("feedback csv groups comments by team and keeps the text safe", () => {
  const csv = buildFeedbackCsv([
    {
      teamName: "Product",
      surveyTitle: "Weekly pulse",
      question: "Notes?",
      text: "Later note",
      submittedAt: "2026-03-02T10:00:00.000Z",
    },
    {
      teamName: "Design",
      surveyTitle: "Weekly pulse",
      question: "Notes?",
      text: '=HYPERLINK("http://evil")',
      submittedAt: "2026-03-01T10:00:00.000Z",
    },
    {
      teamName: "Product",
      surveyTitle: "Weekly pulse",
      question: "Notes?",
      text: "Earlier note",
      submittedAt: "2026-03-01T10:00:00.000Z",
    },
  ]);

  const lines = csv.trimEnd().split("\n");
  assert.equal(lines[0], "Team,Survey,Question,Comment,Submitted");
  assert.match(lines[1] ?? "", /^Design,/);
  assert.match(lines[1] ?? "", /'=HYPERLINK/);
  assert.match(lines[2] ?? "", /^Product,.*Later note/);
  assert.match(lines[3] ?? "", /^Product,.*Earlier note/);
});
