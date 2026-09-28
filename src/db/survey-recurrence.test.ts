import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { questions, responses, surveys } from "@/db/schema";
import { applyDueSurveySchedules, listSurveyQuestions, setSurveySchedule } from "@/db/surveys";

const stamp = Date.now();
const token = `qa-recur-${stamp}`;

test("closing a weekly pulse creates the next draft and does not create a second", async (t) => {
  const ids: string[] = [];
  t.after(async () => {
    const rows = await db
      .select({ id: surveys.id, seriesId: surveys.seriesId })
      .from(surveys)
      .where(eq(surveys.publicToken, token));
    const seriesId = rows[0]?.seriesId;
    if (seriesId) {
      const family = await db
        .select({ id: surveys.id })
        .from(surveys)
        .where(eq(surveys.seriesId, seriesId));
      ids.push(...family.map((row) => row.id));
    }
    ids.push(...rows.map((row) => row.id));
    if (ids.length > 0) {
      await db.delete(surveys).where(inArray(surveys.id, [...new Set(ids)]));
    }
    await pg.end({ timeout: 2 });
  });

  const [survey] = await db
    .insert(surveys)
    .values({ title: "Weekly pulse", publicToken: token, status: "draft" })
    .returning({ id: surveys.id });
  assert.ok(survey);
  await db.insert(questions).values({
    surveyId: survey.id,
    prompt: "Energy?",
    type: "scale",
    options: { min: 1, max: 5 },
    position: 1,
    required: true,
  });
  await setSurveySchedule({
    token,
    opensAt: new Date("2099-07-07T09:00:00.000Z"),
    closesAt: new Date("2099-07-11T17:00:00.000Z"),
    cadence: "weekly",
  });

  await applyDueSurveySchedules(new Date("2099-07-12T09:00:00.000Z"));
  await applyDueSurveySchedules(new Date("2099-07-12T09:00:00.000Z"));

  const family = await db
    .select({
      id: surveys.id,
      status: surveys.status,
      title: surveys.title,
      opensAt: surveys.opensAt,
      closesAt: surveys.closesAt,
      cadence: surveys.cadence,
      publicToken: surveys.publicToken,
      nextSurveyId: surveys.nextSurveyId,
    })
    .from(surveys)
    .where(eq(surveys.seriesId, survey.id));
  assert.equal(family.length, 2);
  const closed = family.find((row) => row.publicToken === token);
  const next = family.find((row) => row.publicToken !== token);
  assert.equal(closed?.status, "closed");
  assert.equal(closed?.nextSurveyId, next?.id);
  assert.equal(next?.status, "draft");
  assert.equal(next?.title, "Weekly pulse");
  assert.equal(next?.cadence, "weekly");
  assert.equal(next?.opensAt?.toISOString(), "2099-07-14T09:00:00.000Z");
  assert.equal(next?.closesAt?.toISOString(), "2099-07-18T17:00:00.000Z");
  assert.deepEqual(
    (await listSurveyQuestions(next?.publicToken ?? "")).map((question) => question.prompt),
    ["Energy?"],
  );
  const copiedResponses = await db
    .select({ id: responses.id })
    .from(responses)
    .where(eq(responses.surveyId, next?.id ?? survey.id));
  assert.equal(copiedResponses.length, 0);
});
