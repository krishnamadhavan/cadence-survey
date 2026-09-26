import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowedSurveyTransitions,
  formatSurveyStatus,
  surveyTransitionError,
} from "./survey-status";

test("formatSurveyStatus uses Live for open", () => {
  assert.equal(formatSurveyStatus("open"), "Live");
  assert.equal(formatSurveyStatus("closed"), "Closed");
  assert.equal(formatSurveyStatus("draft"), "Draft");
});

test("drafts open only when they have questions; live closes; closed reopens", () => {
  assert.deepEqual(allowedSurveyTransitions("draft", 0), []);
  assert.deepEqual(allowedSurveyTransitions("draft", 1), ["open"]);
  assert.deepEqual(allowedSurveyTransitions("open", 3), ["closed"]);
  assert.deepEqual(allowedSurveyTransitions("closed", 0), ["open"]);
});

test("surveyTransitionError covers empty draft and illegal moves", () => {
  assert.equal(
    surveyTransitionError("draft", "open", 0),
    "Add a question before opening this pulse.",
  );
  assert.equal(surveyTransitionError("draft", "open", 1), null);
  assert.equal(
    surveyTransitionError("draft", "closed", 1),
    "Open the pulse before closing it.",
  );
  assert.equal(
    surveyTransitionError("open", "draft", 1),
    "Pulses cannot go back to draft.",
  );
  assert.equal(
    surveyTransitionError("open", "open", 1),
    "That pulse is already live.",
  );
});
