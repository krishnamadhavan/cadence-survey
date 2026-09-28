import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import { SurveyNotFoundError, duplicateSurvey, listSurveyQuestions } from "@/db/surveys";

const stamp = Date.now();
const token = `qa-dup-${stamp}`;

test("duplicates a live pulse into a draft with the same questions and no responses", async (t) => {
  const createdIds: string[] = [];
  t.after(async () => {
    if (createdIds.length > 0) {
      await db.delete(surveys).where(inArray(surveys.id, createdIds));
    }
    await pg.end({ timeout: 2 });
  });

  const [source] = await db
    .insert(surveys)
    .values({
      title: "Weekly pulse",
      description: "How was the week?",
      publicToken: token,
      status: "open",
    })
    .returning({ id: surveys.id });
  assert.ok(source);
  createdIds.push(source.id);
  await db.insert(questions).values([
    {
      surveyId: source.id,
      prompt: "Energy?",
      type: "scale",
      options: { min: 1, max: 5 },
      position: 1,
      required: true,
    },
    {
      surveyId: source.id,
      prompt: "Notes?",
      type: "text",
      options: null,
      position: 2,
      required: false,
    },
  ]);
  const [team] = await db.select({ id: teams.id }).from(teams).limit(1);
  assert.ok(team);
  const [response] = await db
    .insert(responses)
    .values({ surveyId: source.id, teamId: team.id })
    .returning({ id: responses.id });
  assert.ok(response);
  const [question] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.surveyId, source.id))
    .limit(1);
  assert.ok(question);
  await db.insert(answers).values({
    responseId: response.id,
    questionId: question.id,
    value: { value: 4 },
  });

  const copy = await duplicateSurvey(source.id);
  createdIds.push(copy.id);
  assert.equal(copy.title, "Copy of Weekly pulse");
  assert.notEqual(copy.publicToken, token);

  const [stored] = await db
    .select({ status: surveys.status, description: surveys.description })
    .from(surveys)
    .where(eq(surveys.id, copy.id))
    .limit(1);
  assert.equal(stored?.status, "draft");
  assert.equal(stored?.description, "How was the week?");

  const copiedQuestions = await listSurveyQuestions(copy.publicToken);
  assert.deepEqual(
    copiedQuestions.map((question) => question.prompt),
    ["Energy?", "Notes?"],
  );
  const copiedResponses = await db
    .select({ id: responses.id })
    .from(responses)
    .where(eq(responses.surveyId, copy.id));
  assert.equal(copiedResponses.length, 0);

  const [original] = await db
    .select({ status: surveys.status })
    .from(surveys)
    .where(eq(surveys.id, source.id))
    .limit(1);
  assert.equal(original?.status, "open");

  await assert.rejects(
    () => duplicateSurvey("00000000-0000-4000-8000-000000000000"),
    SurveyNotFoundError,
  );
});
