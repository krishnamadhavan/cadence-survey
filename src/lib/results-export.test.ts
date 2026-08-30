import assert from "node:assert/strict";
import { test } from "node:test";
import type { SurveyResults } from "@/db/results";
import { buildResultsCsv } from "./results-export";

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
    {
      teamId: "__suppressed__",
      teamName: "Too few to show",
      responseCount: 5,
      averageScore: 4.1,
      health: "ok",
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
          {
            teamId: "__suppressed__",
            teamName: "Too few to show",
            average: 4.1,
            count: 5,
          },
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
      text: { count: 2 },
    },
  ],
  comments: [
    {
      question: "One thing we should keep doing?",
      teamName: "Operations",
      text: "On-call is brutal.",
    },
    {
      question: "One thing we should keep doing?",
      teamName: "Too few to show",
      text: "Keep Friday demos.",
    },
  ],
};

test("csv includes written comments with published team names only", () => {
  const csv = buildResultsCsv(sample);

  assert.match(csv, /Weekly pulse/);
  assert.match(csv, /Operations/);
  assert.match(csv, /Too few to show/);
  assert.match(csv, /2\.3/);
  assert.match(csv, /On-call is brutal\./);
  assert.match(csv, /Keep Friday demos\./);
  assert.doesNotMatch(csv, /Design/);
  assert.match(csv, /One thing we should keep doing\?/);
});
