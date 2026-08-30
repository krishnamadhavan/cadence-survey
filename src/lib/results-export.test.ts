import assert from "node:assert/strict";
import { test } from "node:test";
import type { SurveyResults } from "@/db/results";
import {
  buildResultsCsv,
  parseExportFormat,
  resultsFilename,
} from "./results-export";
import { sanitizeFilenameToken, sanitizeSpreadsheetValue } from "./spreadsheet";

const sample: SurveyResults = {
  survey: {
    id: "s1",
    title: "Weekly pulse",
    publicToken: "weekly-pulse",
    status: "open",
    responseCount: 8,
    averageScore: 3.6,
  },
  teams: [
    {
      teamId: "ops",
      teamName: "Operations",
      responseCount: 3,
      averageScore: 2.3,
      health: "low",
    },
  ],
  questions: [
    {
      id: "q1",
      prompt: "How was your week?",
      type: "scale",
      position: 1,
      scale: {
        min: 1,
        max: 5,
        average: 3.6,
        count: 8,
        byTeam: [
          { teamId: "ops", teamName: "Operations", average: 2.3, count: 3 },
        ],
      },
      choice: null,
      text: null,
    },
    {
      id: "q2",
      prompt: "One thing we should keep doing?",
      type: "text",
      position: 2,
      scale: null,
      choice: null,
      text: { count: 1 },
    },
  ],
};

test("csv includes only the comments passed in", () => {
  const csv = buildResultsCsv(sample, [
    {
      question: "One thing we should keep doing?",
      teamName: "Operations",
      text: "On-call is brutal.",
    },
  ]);

  assert.match(csv, /Weekly pulse/);
  assert.match(csv, /Operations/);
  assert.match(csv, /On-call is brutal\./);
  assert.match(csv, /One thing we should keep doing\?/);
});

test("csv empty comments section when none are published", () => {
  const csv = buildResultsCsv(sample, []);
  assert.match(csv, /No written comments/);
  assert.doesNotMatch(csv, /On-call is brutal/);
});

test("formula-prefixed comments are neutralized in csv", () => {
  const csv = buildResultsCsv(sample, [
    {
      question: "Notes?",
      teamName: "Operations",
      text: "=1+2",
    },
  ]);
  assert.match(csv, /'=1\+2/);
  assert.doesNotMatch(csv, /(^|,)=1\+2/m);
});

test("parseExportFormat treats xls as xlsx", () => {
  assert.equal(parseExportFormat("csv"), "csv");
  assert.equal(parseExportFormat("xlsx"), "xlsx");
  assert.equal(parseExportFormat("xls"), "xlsx");
  assert.equal(parseExportFormat("pdf"), null);
  assert.equal(parseExportFormat(null), null);
});

test("resultsFilename allowlists the token", () => {
  const name = resultsFilename('weekly/"pulse\n', "xlsx");
  assert.match(name, /^weekly-pulse-results-\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.equal(sanitizeFilenameToken(""), "survey");
  assert.equal(sanitizeFilenameToken("ok_token.1"), "ok_token.1");
});

test("sanitizeSpreadsheetValue prefixes formula starters", () => {
  assert.equal(sanitizeSpreadsheetValue("=1+2"), "'=1+2");
  assert.equal(sanitizeSpreadsheetValue("+cmd"), "'+cmd");
  assert.equal(sanitizeSpreadsheetValue("-1"), "'-1");
  assert.equal(sanitizeSpreadsheetValue("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(sanitizeSpreadsheetValue("Keep Friday demos."), "Keep Friday demos.");
  assert.equal(sanitizeSpreadsheetValue(3.6), 3.6);
});
