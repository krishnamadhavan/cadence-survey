import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { after, test } from "node:test";
import { db, pg } from "@/db/client";
import { questions, responses, surveys } from "@/db/schema";
import { applyDueSurveySchedules, listSurveyQuestions, setSurveySchedule } from "@/db/surveys";

const stamp = Date.now();
const token = `qa-recur-${stamp}`;

after(async () => {
  await pg.end({ timeout: 2 });
});

async function deleteSeries(publicToken: string) {
  const rows = await db
    .select({ id: surveys.id, seriesId: surveys.seriesId })
    .from(surveys)
    .where(eq(surveys.publicToken, publicToken));
  const ids = rows.map((row) => row.id);
  const seriesId = rows[0]?.seriesId;
  if (seriesId) {
    const family = await db
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.seriesId, seriesId));
    ids.push(...family.map((row) => row.id));
  }
  if (ids.length > 0) {
    await db.delete(surveys).where(inArray(surveys.id, [...new Set(ids)]));
  }
}

test("closing a weekly pulse creates the next draft and does not create a second", async (t) => {
  t.after(async () => {
    await deleteSeries(token);
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

test("a long outage opens the current window instead of one that already ended", async (t) => {
  const gapToken = `qa-recur-gap-${stamp}`;
  const now = new Date("2099-07-12T09:00:00.000Z");
  t.after(async () => {
    await deleteSeries(gapToken);
  });

  const [survey] = await db
    .insert(surveys)
    .values({ title: "Gap pulse", publicToken: gapToken, status: "draft" })
    .returning({ id: surveys.id });
  assert.ok(survey);
  await db.insert(questions).values({
    surveyId: survey.id,
    prompt: "Still here?",
    type: "scale",
    options: { min: 1, max: 5 },
    position: 1,
    required: true,
  });
  await setSurveySchedule({
    token: gapToken,
    opensAt: new Date("2098-01-05T09:00:00.000Z"),
    closesAt: new Date("2098-01-09T17:00:00.000Z"),
    cadence: "weekly",
  });

  await applyDueSurveySchedules(now);
  await applyDueSurveySchedules(now);

  const family = await db
    .select({
      id: surveys.id,
      status: surveys.status,
      opensAt: surveys.opensAt,
      closesAt: surveys.closesAt,
      publicToken: surveys.publicToken,
      nextSurveyId: surveys.nextSurveyId,
    })
    .from(surveys)
    .where(eq(surveys.seriesId, survey.id));
  assert.equal(family.length, 2);
  const closed = family.find((row) => row.publicToken === gapToken);
  const next = family.find((row) => row.publicToken !== gapToken);
  assert.equal(closed?.status, "closed");
  assert.equal(closed?.nextSurveyId, next?.id);
  assert.equal(next?.status, "open");
  assert.ok(next?.closesAt && next.closesAt > now);
  assert.ok(next.opensAt && next.opensAt <= now);
  assert.equal(
    family.filter((row) => row.status === "open" && row.closesAt && row.closesAt <= now).length,
    0,
  );
});

test("two overlapping ticks create one next pulse", async (t) => {
  const raceToken = `qa-recur-race-${stamp}`;
  t.after(async () => {
    await deleteSeries(raceToken);
  });

  const [survey] = await db
    .insert(surveys)
    .values({
      title: "Race pulse",
      publicToken: raceToken,
      status: "closed",
      opensAt: new Date("2099-06-02T09:00:00.000Z"),
      closesAt: new Date("2099-06-06T17:00:00.000Z"),
      cadence: "weekly",
    })
    .returning({ id: surveys.id });
  assert.ok(survey);
  await db.update(surveys).set({ seriesId: survey.id }).where(eq(surveys.id, survey.id));
  await db.insert(questions).values({
    surveyId: survey.id,
    prompt: "Focus?",
    type: "scale",
    options: { min: 1, max: 5 },
    position: 1,
    required: true,
  });

  await Promise.all([
    applyDueSurveySchedules(new Date("2099-07-12T09:00:00.000Z")),
    applyDueSurveySchedules(new Date("2099-07-12T09:00:00.000Z")),
  ]);

  const family = await db
    .select({ id: surveys.id })
    .from(surveys)
    .where(eq(surveys.seriesId, survey.id));
  assert.equal(family.length, 2);
});
