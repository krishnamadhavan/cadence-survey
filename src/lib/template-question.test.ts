import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatQuestionOptions,
  formatQuestionSummary,
  parseChoiceOptions,
  parseQuestionOptions,
  parseQuestionPrompt,
  parseQuestionType,
  parseRequired,
  parseScaleOptions,
  parseTemplateDescription,
  parseTemplateName,
} from "./template-question";

test("parseTemplateName trims and rejects empty or long names", () => {
  assert.equal(parseTemplateName("  Weekly pulse  "), "Weekly pulse");
  assert.equal(parseTemplateName(""), null);
  assert.equal(parseTemplateName("a".repeat(81)), null);
});

test("parseTemplateDescription treats blank as null and caps length", () => {
  assert.equal(parseTemplateDescription("  "), null);
  assert.equal(parseTemplateDescription("A two-minute check-in."), "A two-minute check-in.");
  assert.equal(parseTemplateDescription("a".repeat(281)), null);
});

test("parseQuestionPrompt and type", () => {
  assert.equal(parseQuestionPrompt("How was your week?"), "How was your week?");
  assert.equal(parseQuestionPrompt("   "), null);
  assert.equal(parseQuestionType("scale"), "scale");
  assert.equal(parseQuestionType("choice"), "choice");
  assert.equal(parseQuestionType("text"), "text");
  assert.equal(parseQuestionType("rating"), null);
});

test("parseRequired accepts checkbox and boolean strings", () => {
  assert.equal(parseRequired("on"), true);
  assert.equal(parseRequired("true"), true);
  assert.equal(parseRequired("1"), true);
  assert.equal(parseRequired(null), false);
  assert.equal(parseRequired("off"), false);
});

test("parseScaleOptions defaults to integer bounds 0–10", () => {
  assert.deepEqual(
    parseScaleOptions({
      min: "1",
      max: "5",
      minLabel: "Rough",
      maxLabel: "Great",
    }),
    { min: 1, max: 5, minLabel: "Rough", maxLabel: "Great" },
  );
  assert.equal(
    parseScaleOptions({ min: "5", max: "5", minLabel: "", maxLabel: "" }),
    null,
  );
  assert.equal(
    parseScaleOptions({ min: "0", max: "11", minLabel: "", maxLabel: "" }),
    null,
  );
});

test("parseChoiceOptions splits on commas or newlines and drops dupes", () => {
  assert.deepEqual(parseChoiceOptions("No, A little, Yes — I need help"), {
    choices: ["No", "A little", "Yes — I need help"],
  });
  assert.deepEqual(parseChoiceOptions("No\nA little\nYes, I need help"), {
    choices: ["No", "A little", "Yes, I need help"],
  });
  assert.equal(parseChoiceOptions("Only one"), null);
});

test("parseQuestionOptions returns null for text and parsed options otherwise", () => {
  assert.deepEqual(
    parseQuestionOptions("text", {
      min: "1",
      max: "5",
      minLabel: "",
      maxLabel: "",
      choices: "",
    }),
    { ok: true, options: null },
  );
  assert.deepEqual(
    parseQuestionOptions("choice", {
      min: "1",
      max: "5",
      minLabel: "",
      maxLabel: "",
      choices: "Only one",
    }),
    { ok: false },
  );
});

test("formatQuestionOptions summarizes scale and choice", () => {
  assert.equal(
    formatQuestionOptions("scale", {
      min: 1,
      max: 5,
      minLabel: "Rough",
      maxLabel: "Great",
    }),
    "1–5 · Rough–Great",
  );
  assert.equal(
    formatQuestionOptions("choice", {
      choices: ["No", "A little"],
    }),
    "No, A little",
  );
  assert.equal(formatQuestionOptions("text", null), "—");
});

test("formatQuestionSummary adds type, options, and required", () => {
  assert.equal(
    formatQuestionSummary(
      "scale",
      { min: 1, max: 5, minLabel: "Rough", maxLabel: "Great" },
      true,
    ),
    "Scale · 1–5 · Rough–Great · Required",
  );
  assert.equal(
    formatQuestionSummary("text", null, false),
    "Text · Optional",
  );
});
