import "./load-env";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resetSurveyScheduleTimerForTests,
  startSurveyScheduleTimer,
} from "./survey-schedule-timer";

test("the schedule timer runs immediately and does not start twice", async () => {
  resetSurveyScheduleTimerForTests();
  let calls = 0;
  const timer = startSurveyScheduleTimer(async () => {
    calls += 1;
  }, 60_000);
  assert.ok(timer);
  assert.equal(startSurveyScheduleTimer(async () => {
    calls += 1;
  }), null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  clearInterval(timer);
  resetSurveyScheduleTimerForTests();
});
