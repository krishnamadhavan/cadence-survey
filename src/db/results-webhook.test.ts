import "./../lib/load-env";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import type { PulseClosedPayload } from "@/lib/results-webhook";
import { MIN_TEAM_RESPONSES, SUPPRESSED_TEAM_NAME } from "@/lib/min-cell";
import {
  SettingsValidationError,
  getAnonymityFloor,
  getResultsWebhookUrl,
  setAnonymityFloor,
  setResultsWebhookUrl,
} from "@/db/settings";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import {
  SurveyStatusError,
  applyDueSurveySchedules,
  setSurveyStatus,
} from "@/db/surveys";
import { setResultsWebhookSendForTests } from "./results-webhook";

const stamp = Date.now();
const token = `hook-pulse-${stamp}`;
const draftToken = `hook-draft-${stamp}`;
const scheduleToken = `hook-sched-${stamp}`;
const webhookUrl = "https://hooks.example/cadence";

test("closing a pulse posts the published summary and leaves small teams out", async (t) => {
  const tokens = [token, draftToken, scheduleToken];
  const teamIds: string[] = [];
  const posts: Array<{ url: string; body: PulseClosedPayload }> = [];
  const originalFloor = await getAnonymityFloor();
  const originalWebhook = await getResultsWebhookUrl();

  t.after(async () => {
    setResultsWebhookSendForTests(null);
    await setResultsWebhookUrl(originalWebhook ?? "");
    await setAnonymityFloor(originalFloor);
    await db.delete(surveys).where(inArray(surveys.publicToken, tokens));
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await pg.end({ timeout: 2 });
  });

  setResultsWebhookSendForTests(async ({ url, body }) => {
    posts.push({ url, body: JSON.parse(body) as PulseClosedPayload });
  });
  await setAnonymityFloor(MIN_TEAM_RESPONSES);
  await setResultsWebhookUrl("");

  const floor = MIN_TEAM_RESPONSES;
  const engineeringName = `Hook Eng ${stamp}`;
  const designName = `Hook Design ${stamp}`;
  const operationsName = `Hook Ops ${stamp}`;
  const secret = `secret-folded-${stamp}`;
  const engineering = await insertTeam(engineeringName, `hook-eng-${stamp}`);
  const design = await insertTeam(designName, `hook-des-${stamp}`);
  const operations = await insertTeam(operationsName, `hook-ops-${stamp}`);
  teamIds.push(engineering, design, operations);

  await insertSurvey(draftToken, "draft");
  await assert.rejects(
    () => setSurveyStatus({ token: draftToken, status: "closed" }),
    SurveyStatusError,
  );
  assert.equal(posts.length, 0);

  const surveyId = await insertSurvey(token, "open");
  const scale = await insertQuestion(surveyId, "scale", "How was the week?", 1);
  const notes = await insertQuestion(surveyId, "text", "Notes", 2);
  for (let index = 0; index < floor + 2; index += 1) {
    await addResponse({
      surveyId,
      teamId: engineering,
      scoreQuestionId: scale,
      score: 5,
      noteQuestionId: notes,
      note: "named-note",
    });
  }
  for (let index = 0; index < floor; index += 1) {
    await addResponse({
      surveyId,
      teamId: design,
      scoreQuestionId: scale,
      score: 1,
      noteQuestionId: notes,
      note: secret,
    });
  }
  await addResponse({
    surveyId,
    teamId: operations,
    scoreQuestionId: scale,
    score: 1,
    noteQuestionId: notes,
    note: secret,
  });

  const closedWithoutUrl = await setSurveyStatus({ token, status: "closed" });
  assert.equal(closedWithoutUrl.status, "closed");
  assert.equal(posts.length, 0);

  assert.equal(await setResultsWebhookUrl(webhookUrl), webhookUrl);
  assert.equal(await getResultsWebhookUrl(), webhookUrl);
  const reopened = await setSurveyStatus({ token, status: "open" });
  assert.equal(reopened.status, "open");
  assert.equal(posts.length, 0);

  const closed = await setSurveyStatus({ token, status: "closed" });
  assert.equal(closed.status, "closed");
  assert.equal(posts.length, 1);
  const post = posts[0];
  assert.ok(post);
  assert.equal(post.url, webhookUrl);
  assert.equal(post.body.event, "pulse.closed");
  assert.match(post.body.sentAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(post.body.survey.publicToken, token);
  assert.equal(post.body.survey.status, "closed");
  assert.equal(post.body.survey.responseCount, floor + 2 + floor + 1);
  const named = post.body.teams.find((team) => team.teamName === engineeringName);
  assert.ok(named);
  assert.equal(named.teamId, engineering);
  assert.equal(named.responseCount, floor + 2);
  assert.equal(named.averageScore, 5);
  assert.equal(
    post.body.teams.some((team) => team.teamName === SUPPRESSED_TEAM_NAME),
    true,
  );
  const encoded = JSON.stringify(post.body);
  assert.equal(encoded.includes(designName), false);
  assert.equal(encoded.includes(operationsName), false);
  assert.equal(encoded.includes(secret), false);
  assert.equal(encoded.includes(design), false);
  assert.equal(encoded.includes(operations), false);
  assert.equal("roleVisibility" in post.body, false);

  setResultsWebhookSendForTests(async () => {
    throw new Error("receiver down");
  });
  await setSurveyStatus({ token, status: "open" });
  const closedDespiteFailure = await setSurveyStatus({ token, status: "closed" });
  assert.equal(closedDespiteFailure.status, "closed");
  assert.equal(posts.length, 1);

  setResultsWebhookSendForTests(async ({ url, body }) => {
    posts.push({ url, body: JSON.parse(body) as PulseClosedPayload });
  });
  const opensAt = new Date(Date.now() + 5 * 60 * 1000);
  const closesAt = new Date(Date.now() + 10 * 60 * 1000);
  const scheduleId = await insertSurvey(scheduleToken, "open", opensAt, closesAt);
  await insertQuestion(scheduleId, "scale", "How was the week?", 1);
  await applyDueSurveySchedules(new Date(closesAt.getTime() + 1000));
  const scheduled = posts.filter((item) => item.body.survey.publicToken === scheduleToken);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0]?.body.survey.status, "closed");
  assert.equal(scheduled[0]?.body.survey.responseCount, 0);
  await applyDueSurveySchedules(new Date(closesAt.getTime() + 1000));
  assert.equal(
    posts.filter((item) => item.body.survey.publicToken === scheduleToken).length,
    1,
  );

  assert.equal(await setResultsWebhookUrl("  "), null);
  await setSurveyStatus({ token, status: "open" });
  await setSurveyStatus({ token, status: "closed" });
  assert.equal(posts.filter((item) => item.body.survey.publicToken === token).length, 1);

  await assert.rejects(
    () => setResultsWebhookUrl("javascript:alert(1)"),
    SettingsValidationError,
  );
  await assert.rejects(
    () => setResultsWebhookUrl("https://user:secret@hooks.example/cadence"),
    SettingsValidationError,
  );
  assert.equal(await getResultsWebhookUrl(), null);
});

async function insertTeam(name: string, slug: string) {
  const [team] = await db
    .insert(teams)
    .values({ name, slug })
    .returning({ id: teams.id });
  assert.ok(team);
  return team.id;
}

async function insertSurvey(
  publicToken: string,
  status: "draft" | "open",
  opensAt?: Date,
  closesAt?: Date,
) {
  const [survey] = await db
    .insert(surveys)
    .values({
      title: `Hook ${publicToken}`,
      publicToken,
      status,
      opensAt: opensAt ?? null,
      closesAt: closesAt ?? null,
    })
    .returning({ id: surveys.id });
  assert.ok(survey);
  return survey.id;
}

async function insertQuestion(
  surveyId: string,
  type: "scale" | "text",
  prompt: string,
  position: number,
) {
  const [question] = await db
    .insert(questions)
    .values({
      surveyId,
      prompt,
      type,
      options: type === "scale" ? { min: 1, max: 5 } : null,
      position,
      required: type === "scale",
    })
    .returning({ id: questions.id });
  assert.ok(question);
  return question.id;
}

async function addResponse(input: {
  surveyId: string;
  teamId: string;
  scoreQuestionId: string;
  score: number;
  noteQuestionId: string;
  note: string;
}) {
  const [response] = await db
    .insert(responses)
    .values({
      surveyId: input.surveyId,
      teamId: input.teamId,
      role: null,
      tenureBand: null,
    })
    .returning({ id: responses.id });
  assert.ok(response);
  await db.insert(answers).values([
    {
      responseId: response.id,
      questionId: input.scoreQuestionId,
      value: { value: input.score },
    },
    {
      responseId: response.id,
      questionId: input.noteQuestionId,
      value: { value: input.note },
    },
  ]);
}
