import "./../lib/load-env";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { test } from "node:test";
import {
  ActionPlanError,
  createActionPlan,
  listActionPlans,
  setActionPlanStatus,
} from "@/db/action-plans";
import { db, pg } from "@/db/client";
import { answers, questions, responses, surveys, teams } from "@/db/schema";

const stamp = Date.now();
const lowToken = `qa-plan-low-${stamp}`;
const okToken = `qa-plan-ok-${stamp}`;
const smallToken = `qa-plan-small-${stamp}`;
const draftToken = `qa-plan-draft-${stamp}`;

test("creates a plan only for a current low or watch team, then can finish and reopen", async (t) => {
  const tokens = [lowToken, okToken, smallToken, draftToken];
  t.after(async () => {
    await db.delete(surveys).where(inArray(surveys.publicToken, tokens));
    await pg.end({ timeout: 2 });
  });

  const [teamA, teamB] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .limit(2);
  assert.ok(teamA && teamB);

  await seedScores(lowToken, "open", teamA.id, 3, 1);
  await seedScores(okToken, "open", teamA.id, 3, 4.5);
  await seedScores(smallToken, "open", teamB.id, 1, 1);
  await seedScores(draftToken, "draft", teamA.id, 3, 1);

  const created = await createActionPlan({ token: lowToken, teamKey: teamA.id });
  assert.equal(created.teamName, teamA.name);
  assert.equal(created.status, "open");
  assert.match(created.followUp, /this week/);

  await assert.rejects(
    () => createActionPlan({ token: lowToken, teamKey: teamA.id }),
    ActionPlanError,
  );
  await assert.rejects(
    () => createActionPlan({ token: okToken, teamKey: teamA.id }),
    ActionPlanError,
  );
  await assert.rejects(
    () => createActionPlan({ token: smallToken, teamKey: teamB.id }),
    ActionPlanError,
  );
  await assert.rejects(
    () => createActionPlan({ token: draftToken, teamKey: teamA.id }),
    ActionPlanError,
  );

  await setActionPlanStatus({ id: created.id, status: "done" });
  const again = await createActionPlan({ token: lowToken, teamKey: teamA.id });
  assert.equal(again.status, "open");
  assert.notEqual(again.id, created.id);

  const mine = (await listActionPlans()).filter((plan) => tokens.includes(plan.surveyToken));
  assert.equal(mine.length, 2);
  assert.equal(mine.filter((plan) => plan.status === "done").length, 1);
});

async function seedScores(
  token: string,
  status: "open" | "closed" | "draft",
  teamId: string,
  count: number,
  score: number,
) {
  const [survey] = await db
    .insert(surveys)
    .values({ title: `QA Plan ${token}`, publicToken: token, status })
    .returning({ id: surveys.id });
  assert.ok(survey);
  const [question] = await db
    .insert(questions)
    .values({
      surveyId: survey.id,
      prompt: "How was the week?",
      type: "scale",
      options: { min: 1, max: 5 },
      position: 1,
      required: true,
    })
    .returning({ id: questions.id });
  assert.ok(question);
  for (let index = 0; index < count; index += 1) {
    const [response] = await db
      .insert(responses)
      .values({ surveyId: survey.id, teamId })
      .returning({ id: responses.id });
    assert.ok(response);
    await db.insert(answers).values({
      responseId: response.id,
      questionId: question.id,
      value: { value: score },
    });
  }
}
