import "./../lib/load-env";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import { exportClosedResponses } from "@/db/response-export";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";

const stamp = Date.now();
const closedToken = `raw-export-${stamp}`;
const openToken = `raw-export-open-${stamp}`;
const draftToken = `raw-export-draft-${stamp}`;
const emptyToken = `raw-export-empty-${stamp}`;
const hiddenToken = `raw-export-hidden-${stamp}`;
const unassignedToken = `raw-export-unassigned-${stamp}`;
const missingToken = `raw-export-missing-${stamp}`;

test("closed pulse exports one row per named team response", async (t) => {
  const tokens = [
    closedToken,
    openToken,
    draftToken,
    emptyToken,
    hiddenToken,
    unassignedToken,
  ];
  const teamIds: string[] = [];

  t.after(async () => {
    await db.delete(surveys).where(inArray(surveys.publicToken, tokens));
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await pg.end({ timeout: 2 });
  });

  const floor = MIN_TEAM_RESPONSES;
  const engineeringName = `Raw Eng ${stamp}`;
  const designName = `Raw Design ${stamp}`;
  const operationsName = `Raw Ops ${stamp}`;
  const engineering = await insertTeam(engineeringName, `raw-eng-${stamp}`);
  const design = await insertTeam(designName, `raw-des-${stamp}`);
  const operations = await insertTeam(operationsName, `raw-ops-${stamp}`);
  teamIds.push(engineering, design, operations);

  const closedId = await insertSurvey(closedToken, "closed");
  const scale = await insertQuestion(closedId, "scale", "How was the week?", 1);
  const notes = await insertQuestion(closedId, "text", "=notes", 2);
  const pace = await insertQuestion(closedId, "choice", "Pace", 3);

  const responseIds: string[] = [];
  const engineeringAnswers: Array<{
    score: number;
    note: string | null;
    choice: string | null;
    role: string | null;
    tenure: "lt_1" | "y1_3" | "gte_3" | null;
  }> = [
    { score: 5, note: "shipped, today", choice: "Fast", role: "Engineer", tenure: "lt_1" },
    { score: 4, note: null, choice: null, role: "Engineer", tenure: "y1_3" },
    { score: 5, note: "=1+1", choice: "Slow", role: "Designer", tenure: "gte_3" },
    { score: 3, note: null, choice: "Fast", role: null, tenure: null },
    { score: 5, note: null, choice: null, role: "Engineer", tenure: "lt_1" },
  ];
  assert.equal(engineeringAnswers.length, floor + 2);
  for (const [index, answer] of engineeringAnswers.entries()) {
    responseIds.push(
      await addResponse({
        surveyId: closedId,
        teamId: engineering,
        submittedAt: new Date(Date.UTC(2026, 9, 1, 0, index)),
        role: answer.role,
        tenureBand: answer.tenure,
        cells: [
          { questionId: scale, value: answer.score },
          ...(answer.note === null ? [] : [{ questionId: notes, value: answer.note }]),
          ...(answer.choice === null ? [] : [{ questionId: pace, value: answer.choice }]),
        ],
      }),
    );
  }
  responseIds.push(
    await addResponse({
      surveyId: closedId,
      teamId: design,
      submittedAt: new Date(Date.UTC(2026, 9, 2)),
      role: `Folded ${stamp}`,
      tenureBand: "y1_3",
      cells: [
        { questionId: scale, value: 2 },
        { questionId: notes, value: "folded-note" },
      ],
    }),
  );
  for (let index = 1; index < floor; index += 1) {
    responseIds.push(
      await addResponse({
        surveyId: closedId,
        teamId: design,
        submittedAt: new Date(Date.UTC(2026, 9, 2, 0, index)),
        cells: [{ questionId: scale, value: 2 }],
      }),
    );
  }
  responseIds.push(
    await addResponse({
      surveyId: closedId,
      teamId: operations,
      submittedAt: new Date(Date.UTC(2026, 9, 3)),
      role: `Secret ${stamp}`,
      tenureBand: "lt_1",
      cells: [
        { questionId: scale, value: 1 },
        { questionId: notes, value: "secret-note" },
      ],
    }),
  );

  const ready = await exportClosedResponses(closedToken, { floor });
  assert.equal(ready.state, "ready");
  if (ready.state !== "ready") {
    return;
  }
  assert.equal(ready.publicToken, closedToken);
  const lines = ready.csv.replace(/^\uFEFF/, "").replace(/\r\n$/, "").split("\r\n");
  assert.equal(lines.length, floor + 3);
  assert.equal(lines[0], `Team,Role,Tenure,How was the week?,'=notes,Pace`);
  assert.equal(
    lines[1],
    `${engineeringName},Engineer,<1yr,5,"shipped, today",Fast`,
  );
  assert.equal(lines[2], `${engineeringName},Engineer,1-3yr,4,,`);
  assert.equal(lines[3], `${engineeringName},Designer,3yr+,5,'=1+1,Slow`);
  assert.equal(lines[4], `${engineeringName},,,3,,Fast`);
  assert.equal(ready.csv.includes(designName), false);
  assert.equal(ready.csv.includes(operationsName), false);
  assert.equal(ready.csv.includes("folded-note"), false);
  assert.equal(ready.csv.includes("secret-note"), false);
  assert.equal(ready.csv.includes(`Folded ${stamp}`), false);
  assert.equal(ready.csv.includes(`Secret ${stamp}`), false);
  assert.equal(ready.csv.includes("lt_1"), false);
  assert.equal(ready.csv.includes("y1_3"), false);
  assert.equal(ready.csv.includes("gte_3"), false);
  assert.equal(ready.csv.includes("Too few to show"), false);
  assert.equal(ready.csv.includes(",=1+1"), false);
  for (const id of responseIds) {
    assert.equal(ready.csv.includes(id), false);
  }

  const unassignedId = await insertSurvey(unassignedToken, "closed");
  const unassignedScale = await insertQuestion(
    unassignedId,
    "scale",
    "How was the week?",
    1,
  );
  for (let index = 0; index < floor; index += 1) {
    const id = await addResponse({
      surveyId: unassignedId,
      teamId: null,
      submittedAt: new Date(Date.UTC(2026, 9, 4, 0, index)),
      cells: [{ questionId: unassignedScale, value: 4 }],
    });
    responseIds.push(id);
  }
  const unassigned = await exportClosedResponses(unassignedToken, { floor });
  assert.equal(unassigned.state, "ready");
  if (unassigned.state === "ready") {
    assert.match(unassigned.csv, /Unassigned,,,4/);
    for (const id of responseIds) {
      assert.equal(unassigned.csv.includes(id), false);
    }
  }

  const emptyId = await insertSurvey(emptyToken, "closed");
  await insertQuestion(emptyId, "scale", "How was the week?", 1);
  const empty = await exportClosedResponses(emptyToken, { floor });
  assert.equal(empty.state, "empty");

  const hiddenId = await insertSurvey(hiddenToken, "closed");
  const hiddenScale = await insertQuestion(hiddenId, "text", "Private?", 1);
  await addResponse({
    surveyId: hiddenId,
    teamId: operations,
    submittedAt: new Date(Date.UTC(2026, 9, 5)),
    cells: [{ questionId: hiddenScale, value: "secret-note" }],
  });
  const hidden = await exportClosedResponses(hiddenToken, { floor });
  assert.equal(hidden.state, "hidden");

  const openId = await insertSurvey(openToken, "open");
  const openScale = await insertQuestion(openId, "scale", "How was the week?", 1);
  await addResponse({
    surveyId: openId,
    teamId: engineering,
    submittedAt: new Date(Date.UTC(2026, 9, 6)),
    cells: [{ questionId: openScale, value: 5 }],
  });
  const open = await exportClosedResponses(openToken, { floor });
  assert.equal(open.state, "not_closed");

  const draftId = await insertSurvey(draftToken, "draft");
  await insertQuestion(draftId, "scale", "How was the week?", 1);
  const draft = await exportClosedResponses(draftToken, { floor });
  assert.equal(draft.state, "not_closed");

  const missing = await exportClosedResponses(missingToken, { floor });
  assert.equal(missing.state, "missing");
});

async function insertTeam(name: string, slug: string) {
  const [team] = await db
    .insert(teams)
    .values({ name, slug })
    .returning({ id: teams.id });
  assert.ok(team);
  return team.id;
}

async function insertSurvey(token: string, status: "draft" | "open" | "closed") {
  const [survey] = await db
    .insert(surveys)
    .values({ title: `Raw export ${token}`, publicToken: token, status })
    .returning({ id: surveys.id });
  assert.ok(survey);
  return survey.id;
}

async function insertQuestion(
  surveyId: string,
  type: "scale" | "text" | "choice",
  prompt: string,
  position: number,
) {
  const [question] = await db
    .insert(questions)
    .values({
      surveyId,
      prompt,
      type,
      options:
        type === "scale"
          ? { min: 1, max: 5 }
          : type === "choice"
            ? { choices: ["Fast", "Slow"] }
            : null,
      position,
      required: type === "scale",
    })
    .returning({ id: questions.id });
  assert.ok(question);
  return question.id;
}

async function addResponse(input: {
  surveyId: string;
  teamId: string | null;
  submittedAt: Date;
  role?: string | null;
  tenureBand?: "lt_1" | "y1_3" | "gte_3" | null;
  cells: { questionId: string; value: string | number }[];
}) {
  const [response] = await db
    .insert(responses)
    .values({
      surveyId: input.surveyId,
      teamId: input.teamId,
      submittedAt: input.submittedAt,
      role: input.role ?? null,
      tenureBand: input.tenureBand ?? null,
    })
    .returning({ id: responses.id });
  assert.ok(response);
  if (input.cells.length > 0) {
    await db.insert(answers).values(
      input.cells.map((cell) => ({
        responseId: response.id,
        questionId: cell.questionId,
        value: { value: cell.value },
      })),
    );
  }
  return response.id;
}
