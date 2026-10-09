import "./../lib/load-env";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { getSurveyReportDetail } from "@/db/reports";
import { getPublishedComments, getSurveyResults } from "@/db/results";
import { answers, employees, questions, responses, surveys, teams } from "@/db/schema";
import type { TenureBand } from "@/lib/employee-attributes";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";

const stamp = Date.now();
const engineer = `Engineer ${stamp}`;
const designer = `Designer ${stamp}`;
const floor = MIN_TEAM_RESPONSES;

test("team, role, and tenure filters combine without exposing a smaller group", async (t) => {
  const tokens = [
    `seg-gap-${stamp}`,
    `seg-safe-${stamp}`,
    `seg-hide-${stamp}`,
    `seg-fold-${stamp}`,
  ];
  const teamIds: string[] = [];
  const employeeIds: string[] = [];

  t.after(async () => {
    await db.delete(surveys).where(inArray(surveys.publicToken, tokens));
    if (employeeIds.length > 0) {
      await db.delete(employees).where(inArray(employees.id, employeeIds));
    }
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await pg.end({ timeout: 2 });
  });

  const gapA = await insertTeam(`Seg Gap A ${stamp}`);
  const gapB = await insertTeam(`Seg Gap B ${stamp}`);
  const safeA = await insertTeam(`Seg Safe A ${stamp}`);
  const safeB = await insertTeam(`Seg Safe B ${stamp}`);
  const tiny = await insertTeam(`Seg Tiny ${stamp}`);
  const one = await insertTeam(`Seg One ${stamp}`);
  const wide = await insertTeam(`Seg Wide ${stamp}`);
  const rest = await insertTeam(`Seg Rest ${stamp}`);
  teamIds.push(gapA, gapB, safeA, safeB, tiny, one, wide, rest);

  employeeIds.push(
    ...(await insertPeople(safeA, engineer, "lt_1", 5)),
    ...(await insertPeople(safeA, designer, "gte_3", 5)),
    ...(await insertPeople(safeB, engineer, "lt_1", 5)),
  );

  const gapId = await insertSurvey(tokens[0]);
  const gapScale = await insertQuestion(gapId, "scale", "Gap week?", 1);
  const gapText = await insertQuestion(gapId, "text", "Gap note?", 2);
  await addResponses({
    surveyId: gapId,
    teamId: gapA,
    role: engineer,
    tenure: "lt_1",
    count: 4,
    score: 5,
    comment: "gap-a-lt",
    scaleQuestionId: gapScale,
    textQuestionId: gapText,
  });
  await addResponses({
    surveyId: gapId,
    teamId: gapA,
    role: engineer,
    tenure: "gte_3",
    count: 1,
    score: 1,
    comment: "gap-a-gte",
    scaleQuestionId: gapScale,
    textQuestionId: gapText,
  });
  await addResponses({
    surveyId: gapId,
    teamId: gapB,
    role: engineer,
    tenure: "lt_1",
    count: 5,
    score: 2,
    comment: "gap-b-lt",
    scaleQuestionId: gapScale,
    textQuestionId: gapText,
  });

  const tenureOnly = await getSurveyResults(tokens[0], { tenure: "lt_1", floor });
  assert.ok(tenureOnly);
  assert.equal(tenureOnly.roleVisibility, "withheld");
  assert.equal(tenureOnly.tenure, "lt_1");
  assert.equal(tenureOnly.survey.responseCount, 0);
  assert.deepEqual(tenureOnly.teams, []);
  assert.equal(tenureOnly.survey.averageScore, null);
  const tenureComments = await getPublishedComments(tokens[0], { tenure: "lt_1", floor });
  assert.deepEqual(tenureComments, []);

  const gapAll = await getSurveyResults(tokens[0], { floor });
  assert.ok(gapAll);
  assert.equal(gapAll.roleVisibility, "all");
  assert.equal(gapAll.teamId, null);
  assert.equal(gapAll.tenure, null);
  const gapAAll = gapAll.teams.find((team) => team.teamName === `Seg Gap A ${stamp}`);
  const gapBAll = gapAll.teams.find((team) => team.teamName === `Seg Gap B ${stamp}`);
  assert.ok(gapAAll);
  assert.ok(gapBAll);
  assert.equal(gapAAll.responseCount, 5);
  assert.notEqual(gapAAll.averageScore, 5);

  const gapCell = await getSurveyResults(tokens[0], {
    teamId: gapA,
    role: engineer,
    tenure: "lt_1",
    floor,
  });
  assert.ok(gapCell);
  assert.equal(gapCell.roleVisibility, "withheld");
  assert.equal(gapCell.teamId, gapA);
  assert.equal(gapCell.survey.responseCount, 0);

  const gapBCell = await getSurveyResults(tokens[0], {
    teamId: gapB,
    role: engineer,
    tenure: "<1yr",
    floor,
  });
  assert.ok(gapBCell);
  assert.equal(gapBCell.roleVisibility, "shown");
  assert.equal(gapBCell.tenure, "lt_1");
  assert.equal(gapBCell.survey.responseCount, 5);
  assert.equal(gapBCell.survey.averageScore, 2);
  assert.deepEqual(
    gapBCell.teams.map((team) => team.teamName),
    [`Seg Gap B ${stamp}`],
  );
  const gapBComments = await getPublishedComments(tokens[0], {
    teamId: gapB,
    tenure: "lt_1",
    floor,
  });
  assert.deepEqual(
    gapBComments?.map((comment) => comment.text),
    ["gap-b-lt"],
  );

  const safeId = await insertSurvey(tokens[1]);
  const safeScale = await insertQuestion(safeId, "scale", "Safe week?", 1);
  const safeText = await insertQuestion(safeId, "text", "Safe note?", 2);
  await addResponses({
    surveyId: safeId,
    teamId: safeA,
    role: engineer,
    tenure: "lt_1",
    count: 5,
    score: 5,
    comment: "safe-a-eng",
    scaleQuestionId: safeScale,
    textQuestionId: safeText,
  });
  await addResponses({
    surveyId: safeId,
    teamId: safeA,
    role: designer,
    tenure: "gte_3",
    count: 5,
    score: 1,
    comment: "safe-a-des",
    scaleQuestionId: safeScale,
    textQuestionId: safeText,
  });
  await addResponses({
    surveyId: safeId,
    teamId: safeA,
    role: engineer,
    tenure: null,
    count: 3,
    score: 3,
    comment: "safe-a-blank",
    scaleQuestionId: safeScale,
    textQuestionId: safeText,
  });
  await addResponses({
    surveyId: safeId,
    teamId: safeB,
    role: engineer,
    tenure: "lt_1",
    count: 5,
    score: 2,
    comment: "safe-b-eng",
    scaleQuestionId: safeScale,
    textQuestionId: safeText,
  });
  await addResponses({
    surveyId: safeId,
    teamId: safeB,
    role: designer,
    tenure: "gte_3",
    count: 5,
    score: 1,
    scaleQuestionId: safeScale,
    textQuestionId: safeText,
  });

  const safeCell = await getSurveyReportDetail(
    tokens[1],
    { teamId: safeA, role: `  ${engineer}  `, tenure: "lt_1" },
    floor,
  );
  assert.ok(safeCell);
  assert.equal(safeCell.results.roleVisibility, "shown");
  assert.equal(safeCell.results.role, engineer);
  assert.equal(safeCell.teamId, safeA);
  assert.equal(safeCell.teamName, `Seg Safe A ${stamp}`);
  assert.equal(safeCell.tenure, "lt_1");
  assert.equal(safeCell.employeeCount, 5);
  assert.equal(safeCell.results.survey.responseCount, 5);
  assert.equal(safeCell.results.survey.averageScore, 5);
  assert.deepEqual(
    safeCell.results.teams.map((team) => team.teamName),
    [`Seg Safe A ${stamp}`],
  );
  assert.ok(safeCell.teams.some((team) => team.id === safeA));
  const safeComments = await getPublishedComments(tokens[1], {
    teamId: safeA,
    role: engineer,
    tenure: "lt_1",
    floor,
  });
  assert.deepEqual(
    safeComments?.map((comment) => comment.text),
    ["safe-a-eng"],
  );

  const newEngineers = await getSurveyResults(tokens[1], {
    role: engineer,
    tenure: "lt_1",
    floor,
  });
  assert.ok(newEngineers);
  assert.equal(newEngineers.roleVisibility, "shown");
  assert.equal(newEngineers.survey.responseCount, 10);
  assert.equal(newEngineers.teamId, null);
  assert.deepEqual(
    newEngineers.teams.map((team) => team.teamName).sort(),
    [`Seg Safe A ${stamp}`, `Seg Safe B ${stamp}`].sort(),
  );

  const crossed = await getSurveyResults(tokens[1], {
    role: engineer,
    tenure: "gte_3",
    floor,
  });
  assert.ok(crossed);
  assert.equal(crossed.roleVisibility, "empty");
  assert.equal(crossed.survey.responseCount, 0);

  const hideId = await insertSurvey(tokens[2]);
  const hideScale = await insertQuestion(hideId, "scale", "Hide week?", 1);
  await addResponses({
    surveyId: hideId,
    teamId: tiny,
    role: null,
    tenure: null,
    count: 2,
    score: 4,
    scaleQuestionId: hideScale,
    textQuestionId: hideScale,
  });
  await addResponses({
    surveyId: hideId,
    teamId: one,
    role: null,
    tenure: null,
    count: 1,
    score: 1,
    scaleQuestionId: hideScale,
    textQuestionId: hideScale,
  });
  const hiddenTeam = await getSurveyResults(tokens[2], { teamId: tiny, floor });
  assert.ok(hiddenTeam);
  assert.equal(hiddenTeam.roleVisibility, "hidden");
  assert.equal(hiddenTeam.survey.responseCount, 0);
  assert.equal(hiddenTeam.teamName, `Seg Tiny ${stamp}`);

  const foldId = await insertSurvey(tokens[3]);
  const foldScale = await insertQuestion(foldId, "scale", "Fold week?", 1);
  await addResponses({
    surveyId: foldId,
    teamId: wide,
    role: engineer,
    tenure: "y1_3",
    count: 5,
    score: 4,
    scaleQuestionId: foldScale,
    textQuestionId: foldScale,
  });
  await addResponses({
    surveyId: foldId,
    teamId: rest,
    role: engineer,
    tenure: "y1_3",
    count: 2,
    score: 1,
    scaleQuestionId: foldScale,
    textQuestionId: foldScale,
  });
  const foldedTeam = await getSurveyResults(tokens[3], { teamId: wide, floor });
  assert.ok(foldedTeam);
  assert.equal(foldedTeam.roleVisibility, "withheld");
  assert.equal(foldedTeam.survey.responseCount, 0);
  assert.deepEqual(foldedTeam.teams, []);
  const foldedAll = await getSurveyResults(tokens[3], { floor });
  assert.ok(foldedAll);
  assert.equal(
    foldedAll.teams.some((team) => team.teamName === `Seg Wide ${stamp}`),
    false,
  );

  const badTenure = await getSurveyReportDetail(tokens[1], { tenure: "nope" }, floor);
  assert.ok(badTenure);
  assert.equal(badTenure.results.roleVisibility, "empty");
  assert.equal(badTenure.employeeCount, 0);
  assert.equal(badTenure.tenure, null);

  const badTeam = await getSurveyReportDetail(
    tokens[1],
    { teamId: "not-a-team", role: engineer },
    floor,
  );
  assert.ok(badTeam);
  assert.equal(badTeam.results.roleVisibility, "empty");
  assert.equal(badTeam.employeeCount, 0);
  assert.equal(badTeam.teamId, null);

  const missingTeam = await getSurveyReportDetail(
    tokens[1],
    { teamId: "11111111-1111-4111-8111-111111111111" },
    floor,
  );
  assert.ok(missingTeam);
  assert.equal(missingTeam.results.roleVisibility, "empty");
  assert.equal(missingTeam.results.survey.responseCount, 0);
  assert.equal(missingTeam.teamName, null);
  assert.equal(missingTeam.employeeCount, 0);
});

async function insertTeam(name: string) {
  const [team] = await db
    .insert(teams)
    .values({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") })
    .returning({ id: teams.id });
  assert.ok(team);
  return team.id;
}

async function insertPeople(
  teamId: string,
  role: string,
  tenure: TenureBand,
  count: number,
) {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const [person] = await db
      .insert(employees)
      .values({
        name: `${role} ${index} ${teamId.slice(0, 8)}`,
        email: `${teamId}-${tenure}-${index}-${stamp}@cadence.test`,
        teamId,
        role,
        tenureBand: tenure,
      })
      .returning({ id: employees.id });
    assert.ok(person);
    ids.push(person.id);
  }
  return ids;
}

async function insertSurvey(token: string) {
  const [survey] = await db
    .insert(surveys)
    .values({ title: `Segment ${token}`, publicToken: token, status: "closed" })
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

async function addResponses(input: {
  surveyId: string;
  teamId: string;
  role: string | null;
  tenure: TenureBand | null;
  count: number;
  score: number;
  comment?: string;
  scaleQuestionId: string;
  textQuestionId: string;
}) {
  for (let index = 0; index < input.count; index += 1) {
    const [response] = await db
      .insert(responses)
      .values({
        surveyId: input.surveyId,
        teamId: input.teamId,
        role: input.role,
        tenureBand: input.tenure,
      })
      .returning({ id: responses.id });
    assert.ok(response);
    await db.insert(answers).values({
      responseId: response.id,
      questionId: input.scaleQuestionId,
      value: { value: input.score },
    });
    if (input.comment && index === 0 && input.textQuestionId !== input.scaleQuestionId) {
      await db.insert(answers).values({
        responseId: response.id,
        questionId: input.textQuestionId,
        value: { value: input.comment },
      });
    }
  }
}
