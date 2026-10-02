import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { questions, surveys } from "@/db/schema";
import {
  SurveyValidationError,
  applyDueSurveySchedules,
  setSurveySchedule,
} from "@/db/surveys";

const stamp = Date.now();
const draftToken = `qa-sched-draft-${stamp}`;
const emptyToken = `qa-sched-empty-${stamp}`;
const openToken = `qa-sched-open-${stamp}`;

test("a draft opens and closes on its schedule, and an empty draft stays a draft", async (t) => {
  const tokens = [draftToken, emptyToken, openToken];
  t.after(async () => {
    await db.delete(surveys).where(inArray(surveys.publicToken, tokens));
    await pg.end({ timeout: 2 });
  });

  const draftId = await insertSurvey(draftToken, "draft");
  await db.insert(questions).values({
    surveyId: draftId,
    prompt: "How was the week?",
    type: "scale",
    options: { min: 1, max: 5 },
    position: 1,
    required: true,
  });
  await insertSurvey(emptyToken, "draft");
  await insertSurvey(openToken, "open");

  const opensAt = new Date("2099-12-01T09:00:00.000Z");
  const closesAt = new Date("2099-12-08T09:00:00.000Z");
  await setSurveySchedule({ token: draftToken, opensAt, closesAt, cadence: null });
  await setSurveySchedule({ token: emptyToken, opensAt, closesAt, cadence: null });
  await assert.rejects(
    () =>
      setSurveySchedule({
        token: draftToken,
        opensAt: closesAt,
        closesAt: opensAt,
        cadence: null,
      }),
    SurveyValidationError,
  );
  await assert.rejects(
    () => setSurveySchedule({ token: openToken, opensAt, closesAt, cadence: "weekly" }),
    (error: unknown) => error instanceof Error && error.message.includes("draft"),
  );

  await applyDueSurveySchedules(new Date("2099-12-02T09:00:00.000Z"));
  assert.equal(await statusOf(draftToken), "open");
  assert.equal(await statusOf(emptyToken), "draft");

  await applyDueSurveySchedules(new Date("2099-12-09T09:00:00.000Z"));
  assert.equal(await statusOf(draftToken), "closed");
  assert.equal(await statusOf(emptyToken), "draft");
});

async function insertSurvey(token: string, status: "draft" | "open") {
  const [survey] = await db
    .insert(surveys)
    .values({ title: `QA schedule ${token}`, publicToken: token, status })
    .returning({ id: surveys.id });
  assert.ok(survey);
  return survey.id;
}

async function statusOf(token: string) {
  const [survey] = await db
    .select({ status: surveys.status })
    .from(surveys)
    .where(eq(surveys.publicToken, token))
    .limit(1);
  return survey?.status;
}
