import assert from "node:assert/strict";
import { test } from "node:test";
import { collectPublishedComments } from "./comments";

test("omits every comment when the leftover cannot be published", () => {
  const comments = collectPublishedComments(
    [
      {
        question: "Notes?",
        teamKey: "design",
        teamName: "Design",
        text: "Need more review time.",
      },
    ],
    {
      namedKeys: [],
      suppressedKeys: ["design"],
      showSuppressedBucket: false,
    },
  );

  assert.deepEqual(comments, []);
});

test("drops suppressed-team comments and never uses their real name", () => {
  const comments = collectPublishedComments(
    [
      {
        question: "Notes?",
        teamKey: "ops",
        teamName: "Operations",
        text: "On-call is brutal.",
      },
      {
        question: "Notes?",
        teamKey: "design",
        teamName: "Design",
        text: "Need more review time.",
      },
    ],
    {
      namedKeys: ["ops"],
      suppressedKeys: ["design", "product"],
      showSuppressedBucket: true,
    },
  );

  assert.deepEqual(comments, [
    {
      question: "Notes?",
      teamName: "Operations",
      text: "On-call is brutal.",
    },
  ]);
});
