import "./../lib/load-env";
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { getSurveyByToken } from "@/db/queries";
import {
  ensureResultShare,
  getResultShareToken,
  readSharedResults,
  ResultShareError,
} from "@/db/result-shares";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import { SUPPRESSED_TEAM_NAME } from "@/db/results";
import { duplicateSurvey, setSurveyStatus } from "@/db/surveys";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";

const stamp = Date.now();
const token = `share-results-${stamp}`;
const visibleName = `Share Visible ${stamp}`;
const foldedName = `Share Folded ${stamp}`;
const hiddenName = `Share Hidden ${stamp}`;
const secretNote = `secret-note-${stamp}`;

test("a closed pulse can publish results on an unguessable link", async (t) => {
  const surveyTokens = [token];
  const teamIds: string[] = [];

  t.after(async () => {
    await db.delete(surveys).where(inArray(surveys.publicToken, surveyTokens));
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await pg.end({ timeout: 2 });
  });

  const visible = await insertTeam(visibleName, `share-visible-${stamp}`);
  const folded = await insertTeam(foldedName, `share-folded-${stamp}`);
  const hidden = await insertTeam(hiddenName, `share-hidden-${stamp}`);
  teamIds.push(visible, folded, hidden);

  const surveyId = await insertSurvey(token, `Share ${stamp}`, "draft");
  const scaleId = await insertQuestion(surveyId, "scale", "How was the week?", 1);
  const textId = await insertQuestion(surveyId, "text", "Anything else?", 2);
  await addScores(surveyId, visible, scaleId, MIN_TEAM_RESPONSES + 2, 5);
  await addScores(surveyId, folded, scaleId, MIN_TEAM_RESPONSES, 2);
  await addScores(surveyId, hidden, scaleId, 1, 1);
  await db.insert(answers).values({
    responseId: await oneResponseId(surveyId, hidden),
    questionId: textId,
    value: { value: secretNote },
  });

  await assert.rejects(() => ensureResultShare(token), (error: unknown) => {
    assert.ok(error instanceof ResultShareError);
    assert.equal(error.reason, "not_closed");
    return true;
  });
  assert.equal(await getResultShareToken(token), null);

  const opened = await setSurveyStatus({ token, status: "open" });
  assert.equal(opened.status, "open");
  await assert.rejects(() => ensureResultShare(token), (error: unknown) => {
    assert.ok(error instanceof ResultShareError);
    assert.equal(error.reason, "not_closed");
    return true;
  });

  const closed = await setSurveyStatus({ token, status: "closed" });
  assert.equal(closed.status, "closed");
  const [first, second] = await Promise.all([
    ensureResultShare(token),
    ensureResultShare(token),
  ]);
  assert.equal(first.token, second.token);
  assert.match(first.token, /^[0-9a-f]{32}$/);
  assert.notEqual(first.token, token);
  const third = await ensureResultShare(token);
  assert.equal(third.token, first.token);

  const published = await readSharedResults(first.token, { floor: MIN_TEAM_RESPONSES });
  assert.equal(published.state, "ready");
  if (published.state !== "ready") {
    return;
  }
  const body = JSON.stringify(published.report);
  assert.equal(published.report.title, `Share ${stamp}`);
  assert.equal(published.report.responseCount, MIN_TEAM_RESPONSES * 2 + 3);
  assert.equal(
    published.report.teams.some((team) => team.teamName === visibleName),
    true,
  );
  assert.equal(body.includes(hiddenName), false);
  assert.equal(body.includes(foldedName), false);
  assert.equal(body.includes(secretNote), false);
  assert.equal(body.includes(token), false);
  assert.equal(body.includes(first.token), false);
  assert.equal(body.includes("employeeId"), false);
  const named = published.report.teams.find((team) => team.teamName === visibleName);
  assert.equal(named?.responseCount, MIN_TEAM_RESPONSES + 2);
  const bucket = published.report.teams.find(
    (team) => team.teamName === SUPPRESSED_TEAM_NAME,
  );
  assert.equal(bucket?.responseCount, MIN_TEAM_RESPONSES + 1);
  const written = published.report.questions.find((question) => question.writtenCount !== null);
  assert.equal(written?.writtenCount, 1);

  assert.equal((await readSharedResults(token, { floor: MIN_TEAM_RESPONSES })).state, "missing");
  assert.equal((await readSharedResults("", { floor: MIN_TEAM_RESPONSES })).state, "missing");
  assert.equal(
    (await readSharedResults("f".repeat(32), { floor: MIN_TEAM_RESPONSES })).state,
    "missing",
  );
  await assert.rejects(
    () => ensureResultShare(`missing-${stamp}`),
    (error: unknown) => {
      assert.ok(error instanceof ResultShareError);
      assert.equal(error.reason, "missing");
      return true;
    },
  );

  await db.update(surveys).set({ status: "open" }).where(eq(surveys.id, surveyId));
  assert.equal(
    (await readSharedResults(first.token, { floor: MIN_TEAM_RESPONSES })).state,
    "unavailable",
  );
  await db.update(surveys).set({ status: "closed" }).where(eq(surveys.id, surveyId));

  const reopened = await setSurveyStatus({ token, status: "open" });
  assert.equal(reopened.status, "open");
  assert.equal(reopened.revokedResultsToken, first.token);
  assert.equal(await getResultShareToken(token), null);
  assert.equal(
    (await readSharedResults(first.token, { floor: MIN_TEAM_RESPONSES })).state,
    "missing",
  );

  await setSurveyStatus({ token, status: "closed" });
  assert.equal(await getResultShareToken(token), null);
  const renewed = await ensureResultShare(token);
  assert.notEqual(renewed.token, first.token);
  assert.equal(
    (await readSharedResults(renewed.token, { floor: MIN_TEAM_RESPONSES })).state,
    "ready",
  );

  const copy = await duplicateSurvey(surveyId);
  surveyTokens.push(copy.publicToken);
  const [copied] = await db
    .select({ resultsToken: surveys.resultsToken, status: surveys.status })
    .from(surveys)
    .where(eq(surveys.id, copy.id));
  assert.equal(copied?.status, "draft");
  assert.equal(copied?.resultsToken, null);
  assert.equal(await getResultShareToken(token), renewed.token);

  const publicSurvey = await getSurveyByToken(token);
  assert.ok(publicSurvey);
  assert.equal(JSON.stringify(publicSurvey).includes(renewed.token), false);
  assert.equal(JSON.stringify(publicSurvey).includes(secretNote), false);
});

async function insertTeam(name: string, slug: string) {
  const [team] = await db.insert(teams).values({ name, slug }).returning({ id: teams.id });
  assert.ok(team);
  return team.id;
}

async function insertSurvey(publicToken: string, title: string, status: "draft" | "open" | "closed") {
  const [survey] = await db
    .insert(surveys)
    .values({ title, publicToken, status })
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

async function addScores(
  surveyId: string,
  teamId: string,
  questionId: string,
  count: number,
  score: number,
) {
  for (let index = 0; index < count; index += 1) {
    const [response] = await db
      .insert(responses)
      .values({ surveyId, teamId })
      .returning({ id: responses.id });
    assert.ok(response);
    await db.insert(answers).values({
      responseId: response.id,
      questionId,
      value: { value: score },
    });
  }
}

async function oneResponseId(surveyId: string, teamId: string) {
  const [row] = await db
    .select({ id: responses.id })
    .from(responses)
    .where(and(eq(responses.surveyId, surveyId), eq(responses.teamId, teamId)))
    .limit(1);
  assert.ok(row);
  return row.id;
}
