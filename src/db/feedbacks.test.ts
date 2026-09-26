import "./../lib/load-env";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import { listPublishedFeedback } from "./feedbacks";

const stamp = Date.now();
const openToken = `qa-feedback-open-${stamp}`;
const closedToken = `qa-feedback-closed-${stamp}`;
const draftToken = `qa-feedback-draft-${stamp}`;
const foldedToken = `qa-feedback-folded-${stamp}`;

test("publishes named-team comments and hides small teams, drafts, and folded teams", async (t) => {
  const tokens = [openToken, closedToken, draftToken, foldedToken];
  t.after(async () => {
    await db.delete(surveys).where(inArray(surveys.publicToken, tokens));
    await pg.end({ timeout: 2 });
  });

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .limit(3);
  assert.equal(teamRows.length, 3);
  const [teamA, teamB, teamC] = teamRows;
  assert.ok(teamA && teamB && teamC);

  const openId = await insertSurvey(openToken, "open");
  const openQuestion = await insertTextQuestion(openId, "What should we keep?");
  await insertComments(openId, openQuestion, teamA.id, 3, "Keep the Friday demo.");

  const smallToken = `qa-feedback-small-${stamp}`;
  tokens.push(smallToken);
  const smallId = await insertSurvey(smallToken, "open");
  const smallQuestion = await insertTextQuestion(smallId, "Private?");
  await insertComments(smallId, smallQuestion, teamB.id, 1, "Only I said this.");

  const closedId = await insertSurvey(closedToken, "closed");
  const closedQuestion = await insertTextQuestion(closedId, "What changed?");
  await insertComments(closedId, closedQuestion, teamA.id, 3, "Closed pulse note.");

  const draftId = await insertSurvey(draftToken, "draft");
  const draftQuestion = await insertTextQuestion(draftId, "Draft notes?");
  await insertComments(draftId, draftQuestion, teamA.id, 3, "Draft should stay hidden.");

  const foldedId = await insertSurvey(foldedToken, "open");
  const foldedQuestion = await insertTextQuestion(foldedId, "Folded?");
  await insertComments(foldedId, foldedQuestion, teamA.id, 3, `Fold A ${stamp}`);
  await insertComments(foldedId, foldedQuestion, teamB.id, 3, `Fold B ${stamp}`);
  await insertComments(foldedId, foldedQuestion, teamC.id, 1, `Fold C ${stamp}`);

  const rows = await listPublishedFeedback();
  const mine = rows.filter((row) => tokens.includes(row.surveyToken));
  const texts = mine.map((row) => row.text);

  assert.ok(texts.includes("Keep the Friday demo."));
  assert.equal(texts.includes("Only I said this."), false);
  assert.ok(texts.includes("Closed pulse note."));
  assert.equal(texts.includes("Draft should stay hidden."), false);
  assert.equal(texts.includes(`Fold C ${stamp}`), false);
  const foldedShown = texts.filter((text) => text.startsWith("Fold "));
  assert.equal(foldedShown.length, 1);
});

async function insertSurvey(token: string, status: "open" | "closed" | "draft") {
  const [survey] = await db
    .insert(surveys)
    .values({ title: `QA Feedback ${token}`, publicToken: token, status })
    .returning({ id: surveys.id });
  assert.ok(survey);
  return survey.id;
}

async function insertTextQuestion(surveyId: string, prompt: string) {
  const [question] = await db
    .insert(questions)
    .values({
      surveyId,
      prompt,
      type: "text",
      options: null,
      position: 1,
      required: false,
    })
    .returning({ id: questions.id });
  assert.ok(question);
  return question.id;
}

async function insertComments(
  surveyId: string,
  questionId: string,
  teamId: string,
  count: number,
  text: string,
) {
  for (let index = 0; index < count; index += 1) {
    const [response] = await db
      .insert(responses)
      .values({ surveyId, teamId })
      .returning({ id: responses.id });
    assert.ok(response);
    if (index === 0) {
      await db.insert(answers).values({
        responseId: response.id,
        questionId,
        value: { value: text },
      });
    }
  }
}
