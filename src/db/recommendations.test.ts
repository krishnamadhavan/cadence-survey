import "./../lib/load-env";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import { SUPPRESSED_TEAM_NAME } from "@/db/results";
import { listRecommendations } from "./recommendations";

const stamp = Date.now();
const lowToken = `qa-reco-low-${stamp}`;
const watchToken = `qa-reco-watch-${stamp}`;
const okToken = `qa-reco-ok-${stamp}`;
const draftToken = `qa-reco-draft-${stamp}`;
const foldedToken = `qa-reco-folded-${stamp}`;
const smallToken = `qa-reco-small-${stamp}`;

test("recommends named low and watch teams and hides ok, draft, small, and folded teams", async (t) => {
  const tokens = [lowToken, watchToken, okToken, draftToken, foldedToken, smallToken];
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

  await seedScores(lowToken, "open", teamA.id, 3, 1);
  await seedScores(watchToken, "closed", teamA.id, 3, 3.2);
  await seedScores(okToken, "open", teamA.id, 3, 4.5);
  await seedScores(draftToken, "draft", teamA.id, 3, 1);
  await seedScores(smallToken, "open", teamB.id, 1, 1);
  await seedScores(foldedToken, "open", teamA.id, 3, 1);
  await seedScores(foldedToken, "open", teamB.id, 3, 1, true);
  await seedScores(foldedToken, "open", teamC.id, 1, 1, true);

  const rows = await listRecommendations();
  const mine = rows.filter((row) => tokens.includes(row.surveyToken));

  const low = mine.find((row) => row.surveyToken === lowToken);
  assert.equal(low?.teamName, teamA.name);
  assert.equal(low?.health, "low");
  assert.match(low?.followUp ?? "", /this week/);

  const watch = mine.find((row) => row.surveyToken === watchToken);
  assert.equal(watch?.health, "watch");
  assert.match(watch?.followUp ?? "", /slipping/);

  assert.equal(mine.some((row) => row.surveyToken === okToken), false);
  assert.equal(mine.some((row) => row.surveyToken === draftToken), false);
  assert.equal(mine.some((row) => row.surveyToken === smallToken), false);
  assert.equal(
    mine.some((row) => row.teamName === SUPPRESSED_TEAM_NAME),
    false,
  );

  const folded = mine.filter((row) => row.surveyToken === foldedToken);
  assert.equal(folded.length, 1);
  assert.notEqual(folded[0]?.teamName, teamC.name);
});

async function seedScores(
  token: string,
  status: "open" | "closed" | "draft",
  teamId: string,
  count: number,
  score: number,
  existing = false,
) {
  let surveyId: string;
  if (existing) {
    const [survey] = await db
      .select({ id: surveys.id })
      .from(surveys)
      .where(inArray(surveys.publicToken, [token]))
      .limit(1);
    assert.ok(survey);
    surveyId = survey.id;
  } else {
    const [survey] = await db
      .insert(surveys)
      .values({ title: `QA Reco ${token}`, publicToken: token, status })
      .returning({ id: surveys.id });
    assert.ok(survey);
    surveyId = survey.id;
    await db.insert(questions).values({
      surveyId,
      prompt: "How was the week?",
      type: "scale",
      options: { min: 1, max: 5 },
      position: 1,
      required: true,
    });
  }

  const [question] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(inArray(questions.surveyId, [surveyId]))
    .limit(1);
  assert.ok(question);

  for (let index = 0; index < count; index += 1) {
    const [response] = await db
      .insert(responses)
      .values({ surveyId, teamId })
      .returning({ id: responses.id });
    assert.ok(response);
    await db.insert(answers).values({
      responseId: response.id,
      questionId: question.id,
      value: { value: score },
    });
  }
}
