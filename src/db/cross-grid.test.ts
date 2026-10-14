import "./../lib/load-env";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { getSurveyCrossGrid } from "@/db/cross-grid";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import type { TenureBand } from "@/lib/employee-attributes";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";

const stamp = Date.now();
const engineer = `Engineer ${stamp}`;
const designer = `Designer ${stamp}`;
const floor = MIN_TEAM_RESPONSES;

test("a report grid crosses two breakdowns and hides a pocket that would identify a smaller group", async (t) => {
  const tokens = [
    `x-show-${stamp}`,
    `x-fold-${stamp}`,
    `x-col-${stamp}`,
    `x-off-${stamp}`,
  ];
  const teamIds: string[] = [];

  t.after(async () => {
    await db.delete(surveys).where(inArray(surveys.publicToken, tokens));
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await pg.end({ timeout: 2 });
  });

  const lowTeam = await insertTeam(`Cross Low ${stamp}`);
  const highTeam = await insertTeam(`Cross High ${stamp}`);
  teamIds.push(lowTeam, highTeam);

  const showId = await insertSurvey(tokens[0]);
  const showFirst = await insertQuestion(showId, "Week?", 1);
  const showSecond = await insertQuestion(showId, "Energy?", 2);
  await addResponses({
    surveyId: showId,
    teamId: lowTeam,
    role: engineer,
    tenure: "lt_1",
    first: [1, 1, 1, 1],
    second: [1, 1, 1, 2],
    firstQuestionId: showFirst,
    secondQuestionId: showSecond,
  });
  await addResponses({
    surveyId: showId,
    teamId: highTeam,
    role: designer,
    tenure: "lt_1",
    first: [5, 5, 5, 5],
    second: [5, 5, 5, 5],
    firstQuestionId: showFirst,
    secondQuestionId: showSecond,
  });

  const byTenure = await getSurveyCrossGrid(tokens[0], { floor });
  assert.ok(byTenure);
  assert.equal(byTenure.kind, "grid");
  if (byTenure.kind !== "grid") {
    return;
  }
  assert.equal(byTenure.rowAxis, "tenure");
  assert.equal(byTenure.colAxis, "role");
  assert.deepEqual(
    byTenure.rows.map((row) => row.label),
    ["<1yr"],
  );
  assert.deepEqual(
    byTenure.cols.map((col) => col.label),
    [designer, engineer].sort((a, b) => a.localeCompare(b)),
  );
  const lowPocket = byTenure.cells.find((cell) => cell.colKey === engineer);
  const highPocket = byTenure.cells.find((cell) => cell.colKey === designer);
  assert.ok(lowPocket);
  assert.ok(highPocket);
  assert.equal(lowPocket.responseCount, 4);
  assert.equal(lowPocket.averageScore, 1.1);
  assert.equal(highPocket.responseCount, 4);
  assert.equal(highPocket.averageScore, 5);

  const byTeam = await getSurveyCrossGrid(tokens[0], {
    rows: "team",
    cols: "role",
    floor,
  });
  assert.ok(byTeam);
  assert.equal(byTeam.kind, "grid");
  if (byTeam.kind !== "grid") {
    return;
  }
  const lowTeamCell = byTeam.cells.find((cell) => cell.rowKey === lowTeam);
  assert.ok(lowTeamCell);
  assert.equal(lowTeamCell.colKey, engineer);
  assert.equal(lowTeamCell.responseCount, 4);
  assert.equal(lowTeamCell.averageScore, 1.1);
  assert.equal(
    byTeam.rows.find((row) => row.key === lowTeam)?.label,
    `Cross Low ${stamp}`,
  );

  const engineersOnly = await getSurveyCrossGrid(tokens[0], {
    role: engineer,
    floor,
  });
  assert.ok(engineersOnly);
  assert.equal(engineersOnly.kind, "grid");
  if (engineersOnly.kind !== "grid") {
    return;
  }
  assert.equal(engineersOnly.rowAxis, "tenure");
  assert.equal(engineersOnly.colAxis, "team");
  assert.equal(engineersOnly.cells.length, 1);
  assert.equal(engineersOnly.cells[0]?.responseCount, 4);
  assert.equal(engineersOnly.cells[0]?.averageScore, 1.1);

  const foldId = await insertSurvey(tokens[1]);
  const foldScale = await insertQuestion(foldId, "Fold?", 1);
  await addResponses({
    surveyId: foldId,
    teamId: null,
    role: engineer,
    tenure: "lt_1",
    first: Array.from({ length: 8 }, () => 5),
    firstQuestionId: foldScale,
  });
  await addResponses({
    surveyId: foldId,
    teamId: null,
    role: designer,
    tenure: "lt_1",
    first: [1, 1],
    firstQuestionId: foldScale,
  });
  const folded = await getSurveyCrossGrid(tokens[1], { floor });
  assert.ok(folded);
  assert.equal(folded.kind, "grid");
  if (folded.kind === "grid") {
    assert.deepEqual(folded.cells, []);
  }

  const colId = await insertSurvey(tokens[2]);
  const colScale = await insertQuestion(colId, "Column?", 1);
  await addResponses({
    surveyId: colId,
    teamId: null,
    role: engineer,
    tenure: "lt_1",
    first: [2, 2, 2, 2],
    firstQuestionId: colScale,
  });
  await addResponses({
    surveyId: colId,
    teamId: null,
    role: designer,
    tenure: "lt_1",
    first: [5, 5, 5, 5],
    firstQuestionId: colScale,
  });
  await addResponses({
    surveyId: colId,
    teamId: null,
    role: engineer,
    tenure: "y1_3",
    first: [4, 4, 4, 4],
    firstQuestionId: colScale,
  });
  await addResponses({
    surveyId: colId,
    teamId: null,
    role: designer,
    tenure: "y1_3",
    first: [1, 1],
    firstQuestionId: colScale,
  });
  const column = await getSurveyCrossGrid(tokens[2], { floor });
  assert.ok(column);
  assert.equal(column.kind, "grid");
  if (column.kind === "grid") {
    assert.deepEqual(
      column.cells.map((cell) => ({
        row: cell.rowKey,
        col: cell.colKey,
        count: cell.responseCount,
        score: cell.averageScore,
      })),
      [{ row: "lt_1", col: engineer, count: 4, score: 2 }],
    );
  }

  const london = `London ${stamp}`;
  const berlin = `Berlin ${stamp}`;
  const offId = await insertSurvey(tokens[3]);
  const offScale = await insertQuestion(offId, "Office?", 1);
  await addResponses({
    surveyId: offId,
    teamId: null,
    role: engineer,
    tenure: "lt_1",
    office: london,
    first: Array.from({ length: 6 }, () => 1),
    firstQuestionId: offScale,
  });
  await addResponses({
    surveyId: offId,
    teamId: null,
    role: engineer,
    tenure: "lt_1",
    office: berlin,
    first: [5, 5],
    firstQuestionId: offScale,
  });
  await addResponses({
    surveyId: offId,
    teamId: null,
    role: designer,
    tenure: "lt_1",
    office: london,
    first: Array.from({ length: 6 }, () => 5),
    firstQuestionId: offScale,
  });
  await addResponses({
    surveyId: offId,
    teamId: null,
    role: engineer,
    tenure: "gte_3",
    office: london,
    first: Array.from({ length: 6 }, () => 4),
    firstQuestionId: offScale,
  });
  await addResponses({
    surveyId: offId,
    teamId: null,
    role: engineer,
    tenure: "gte_3",
    office: berlin,
    first: [4, 4, 4],
    firstQuestionId: offScale,
  });

  const londonGrid = await getSurveyCrossGrid(tokens[3], { office: london, floor });
  assert.ok(londonGrid);
  assert.equal(londonGrid.kind, "grid");
  if (londonGrid.kind === "grid") {
    assert.equal(londonGrid.cells.length, 2);
    assert.deepEqual(londonGrid.rows.map((row) => row.label), ["<1yr", "3yr+"]);
    assert.equal(
      londonGrid.cells.find((cell) => cell.rowKey === "lt_1" && cell.colKey === engineer),
      undefined,
    );
    const designers = londonGrid.cells.find(
      (cell) => cell.rowKey === "lt_1" && cell.colKey === designer,
    );
    const later = londonGrid.cells.find(
      (cell) => cell.rowKey === "gte_3" && cell.colKey === engineer,
    );
    assert.ok(designers);
    assert.equal(designers.responseCount, 6);
    assert.equal(designers.averageScore, 5);
    assert.ok(later);
    assert.equal(later.responseCount, 6);
    assert.equal(later.averageScore, 4);
  }

  const allOffices = await getSurveyCrossGrid(tokens[3], { floor });
  assert.ok(allOffices);
  assert.equal(allOffices.kind, "grid");
  if (allOffices.kind === "grid") {
    const blended = allOffices.cells.find(
      (cell) => cell.rowKey === "lt_1" && cell.colKey === engineer,
    );
    assert.ok(blended);
    assert.equal(blended.responseCount, 8);
    assert.equal(blended.averageScore, 2);
  }

  const missing = await getSurveyCrossGrid(`x-missing-${stamp}`, { floor });
  assert.equal(missing, null);
});

async function insertTeam(name: string) {
  const [team] = await db
    .insert(teams)
    .values({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") })
    .returning({ id: teams.id });
  assert.ok(team);
  return team.id;
}

async function insertSurvey(token: string) {
  const [survey] = await db
    .insert(surveys)
    .values({ title: `Cross ${token}`, publicToken: token, status: "closed" })
    .returning({ id: surveys.id });
  assert.ok(survey);
  return survey.id;
}

async function insertQuestion(surveyId: string, prompt: string, position: number) {
  const [question] = await db
    .insert(questions)
    .values({
      surveyId,
      prompt,
      type: "scale",
      options: { min: 1, max: 5 },
      position,
      required: true,
    })
    .returning({ id: questions.id });
  assert.ok(question);
  return question.id;
}

async function addResponses(input: {
  surveyId: string;
  teamId: string | null;
  role: string | null;
  tenure: TenureBand | null;
  office?: string | null;
  first: number[];
  second?: number[];
  firstQuestionId: string;
  secondQuestionId?: string;
}) {
  for (let index = 0; index < input.first.length; index += 1) {
    const [response] = await db
      .insert(responses)
      .values({
        surveyId: input.surveyId,
        teamId: input.teamId,
        role: input.role,
        tenureBand: input.tenure,
        office: input.office ?? null,
      })
      .returning({ id: responses.id });
    assert.ok(response);
    await db.insert(answers).values({
      responseId: response.id,
      questionId: input.firstQuestionId,
      value: { value: input.first[index] ?? 0 },
    });
    if (input.secondQuestionId && input.second) {
      await db.insert(answers).values({
        responseId: response.id,
        questionId: input.secondQuestionId,
        value: { value: input.second[index] ?? 0 },
      });
    }
  }
}
