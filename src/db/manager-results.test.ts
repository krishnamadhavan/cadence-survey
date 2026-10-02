import "./../lib/load-env";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { getAnonymityFloor } from "@/db/settings";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import { getManagerPulseResults } from "./manager-results";

const stamp = Date.now();
const oldToken = `qa-mgr-pulse-old-${stamp}`;
const newToken = `qa-mgr-pulse-new-${stamp}`;
const draftToken = `qa-mgr-pulse-draft-${stamp}`;
const visibleA = `visible-a-${stamp}`;
const hiddenB = `hidden-b-${stamp}`;
const visibleD = `visible-d-${stamp}`;
const oldNote = `old-note-${stamp}`;
const draftNote = `draft-note-${stamp}`;

test("latest pulse scores are per managed team and stay hidden under the floor", async (t) => {
  const teamIds: string[] = [];
  t.after(async () => {
    await db
      .delete(surveys)
      .where(inArray(surveys.publicToken, [oldToken, newToken, draftToken]));
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await pg.end({ timeout: 2 });
  });

  const floor = await getAnonymityFloor();
  const teamA = await insertTeam(`QA Pulse A ${stamp}`, `qa-pulse-a-${stamp}`);
  const teamB = await insertTeam(`QA Pulse B ${stamp}`, `qa-pulse-b-${stamp}`);
  const teamC = await insertTeam(`QA Pulse C ${stamp}`, `qa-pulse-c-${stamp}`);
  const teamD = await insertTeam(`QA Pulse D ${stamp}`, `qa-pulse-d-${stamp}`);
  teamIds.push(teamA, teamB, teamC, teamD);

  await seedSurvey({
    token: oldToken,
    title: `Old pulse ${stamp}`,
    status: "closed",
    createdAt: new Date("2098-01-01T00:00:00.000Z"),
    teams: [{ teamId: teamC, count: floor, score: 1, text: oldNote }],
  });
  await seedSurvey({
    token: newToken,
    title: `New pulse ${stamp}`,
    status: "open",
    createdAt: new Date("2099-02-01T00:00:00.000Z"),
    teams: [
      { teamId: teamA, count: floor, score: 5, choice: "Yes", text: visibleA, blankLast: true },
      { teamId: teamB, count: Math.max(floor - 1, 1), score: 1, choice: "No", text: hiddenB },
      { teamId: teamD, count: floor, score: 2, choice: "No", text: visibleD },
    ],
  });
  await seedSurvey({
    token: draftToken,
    title: `Draft pulse ${stamp}`,
    status: "draft",
    createdAt: new Date("2099-06-01T00:00:00.000Z"),
    teams: [{ teamId: teamA, count: floor, score: 2, text: draftNote }],
  });

  const result = await getManagerPulseResults([teamB, teamA, teamC, teamD, teamA]);
  assert.equal(result.survey?.title, `New pulse ${stamp}`);
  assert.equal(result.survey?.status, "open");
  assert.deepEqual(
    result.teams.map((team) => team.teamId),
    [teamB, teamA, teamC, teamD],
  );

  const hidden = result.teams[0];
  const shown = result.teams[1];
  const empty = result.teams[2];
  const low = result.teams[3];
  assert.ok(hidden && shown && empty && low);

  assert.equal(hidden.published, false);
  assert.equal(hidden.responseCount, Math.max(floor - 1, 1));
  assert.equal(hidden.averageScore, null);
  assert.deepEqual(hidden.questions, []);
  assert.deepEqual(hidden.comments, []);

  assert.equal(shown.published, true);
  assert.equal(shown.responseCount, floor);
  assert.equal(shown.averageScore, 5);
  assert.equal(shown.health, "ok");
  assert.equal(shown.questions.length, 3);
  assert.equal(shown.questions[0]?.prompt, "How was the week?");
  assert.equal(shown.questions[0]?.scale?.average, 5);
  assert.equal(shown.questions[0]?.scale?.count, floor);
  assert.equal(shown.questions[1]?.choice?.count, floor);
  assert.equal(
    shown.questions[1]?.choice?.options.find((option) => option.label === "Yes")?.count,
    floor,
  );
  assert.equal(
    shown.questions[1]?.choice?.options.find((option) => option.label === "No")?.count,
    0,
  );
  assert.equal(shown.questions[2]?.text?.count, floor);
  assert.equal(shown.comments.length, floor - 1);
  assert.equal(
    shown.comments.every((comment) => comment.question === "Anything else?" && comment.text === visibleA),
    true,
  );
  assert.equal(JSON.stringify(result).includes(hiddenB), false);
  assert.equal(JSON.stringify(result).includes(oldNote), false);
  assert.equal(JSON.stringify(result).includes(draftNote), false);
  assert.equal(JSON.stringify(result).includes(`Old pulse ${stamp}`), false);
  assert.equal(JSON.stringify(result).includes(`Draft pulse ${stamp}`), false);

  assert.equal(empty.published, false);
  assert.equal(empty.responseCount, 0);
  assert.deepEqual(empty.questions, []);
  assert.deepEqual(empty.comments, []);

  assert.equal(low.published, true);
  assert.equal(low.averageScore, 2);
  assert.equal(low.health, "low");
  assert.equal(low.questions[0]?.scale?.average, 2);
  assert.equal(
    low.questions[1]?.choice?.options.find((option) => option.label === "No")?.count,
    floor,
  );
  assert.equal(low.comments.length, floor);
  assert.equal(
    low.comments.every((comment) => comment.text === visibleD),
    true,
  );
});

async function insertTeam(name: string, slug: string) {
  const [team] = await db.insert(teams).values({ name, slug }).returning({ id: teams.id });
  assert.ok(team);
  return team.id;
}

async function seedSurvey(input: {
  token: string;
  title: string;
  status: "open" | "closed" | "draft";
  createdAt: Date;
  teams: {
    teamId: string;
    count: number;
    score: number;
    choice?: string;
    text?: string;
    blankLast?: boolean;
  }[];
}) {
  const [survey] = await db
    .insert(surveys)
    .values({
      title: input.title,
      publicToken: input.token,
      status: input.status,
      createdAt: input.createdAt,
    })
    .returning({ id: surveys.id });
  assert.ok(survey);
  const inserted = await db
    .insert(questions)
    .values([
      {
        surveyId: survey.id,
        prompt: "How was the week?",
        type: "scale" as const,
        options: { min: 1, max: 5 },
        position: 1,
        required: true,
      },
      {
        surveyId: survey.id,
        prompt: "Come back?",
        type: "choice" as const,
        options: { choices: ["Yes", "No"] },
        position: 2,
        required: true,
      },
      {
        surveyId: survey.id,
        prompt: "Anything else?",
        type: "text" as const,
        options: null,
        position: 3,
        required: false,
      },
    ])
    .returning({ id: questions.id, type: questions.type });
  const scaleId = inserted.find((question) => question.type === "scale")?.id;
  const choiceId = inserted.find((question) => question.type === "choice")?.id;
  const textId = inserted.find((question) => question.type === "text")?.id;
  assert.ok(scaleId && choiceId && textId);

  for (const team of input.teams) {
    for (let index = 0; index < team.count; index += 1) {
      const [response] = await db
        .insert(responses)
        .values({ surveyId: survey.id, teamId: team.teamId })
        .returning({ id: responses.id });
      assert.ok(response);
      await db.insert(answers).values([
        { responseId: response.id, questionId: scaleId, value: { value: team.score } },
        {
          responseId: response.id,
          questionId: choiceId,
          value: { value: team.choice ?? "Yes" },
        },
        {
          responseId: response.id,
          questionId: textId,
          value: {
            value:
              team.blankLast && index === team.count - 1 ? "   " : (team.text ?? "note"),
          },
        },
      ]);
    }
  }

}
