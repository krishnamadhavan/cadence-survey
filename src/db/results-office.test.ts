import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { getSurveyReportDetail } from "@/db/reports";
import { getPublishedComments, getSurveyResults, SUPPRESSED_TEAM_NAME } from "@/db/results";
import { answers, employees, questions, responses, surveys, teams } from "@/db/schema";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";

const stamp = Date.now();
const floor = MIN_TEAM_RESPONSES;
const london = `London ${stamp}`;
const berlin = `Berlin ${stamp}`;
const madrid = `Madrid ${stamp}`;
const oslo = `Oslo ${stamp}`;
const engineer = `Engineer ${stamp}`;
const designer = `Designer ${stamp}`;

test("pulse results can be sliced by the office on each person", async (t) => {
  const tokens = [
    `off-show-${stamp}`,
    `off-gap-${stamp}`,
    `off-none-${stamp}`,
    `off-mix-${stamp}`,
    `off-hole-${stamp}`,
    `off-split-${stamp}`,
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

  const showA = await insertTeam(`Off A ${stamp}`);
  const showB = await insertTeam(`Off B ${stamp}`);
  const showC = await insertTeam(`Off C ${stamp}`);
  const showD = await insertTeam(`Off D ${stamp}`);
  const gapA = await insertTeam(`Off Gap A ${stamp}`);
  const gapB = await insertTeam(`Off Gap B ${stamp}`);
  const gapC = await insertTeam(`Off Gap C ${stamp}`);
  const none = await insertTeam(`Off None ${stamp}`);
  const mixLondon = await insertTeam(`Off Mix L ${stamp}`);
  const mixNone = await insertTeam(`Off Mix N ${stamp}`);
  const holeE = await insertTeam(`Off Hole E ${stamp}`);
  const holeF = await insertTeam(`Off Hole F ${stamp}`);
  const holeG = await insertTeam(`Off Hole G ${stamp}`);
  const holeH = await insertTeam(`Off Hole H ${stamp}`);
  const split = await insertTeam(`Off Split ${stamp}`, `Paris ${stamp}`);
  teamIds.push(
    showA,
    showB,
    showC,
    showD,
    gapA,
    gapB,
    gapC,
    none,
    mixLondon,
    mixNone,
    holeE,
    holeF,
    holeG,
    holeH,
    split,
  );

  employeeIds.push(
    ...(await insertPeople(showA, 2, london)),
    ...(await insertPeople(showB, 1, london)),
    ...(await insertPeople(showC, 1, berlin)),
  );

  const showId = await insertSurvey(tokens[0]);
  const showScale = await insertQuestion(showId, "scale", "Show week?", 1);
  const showText = await insertQuestion(showId, "text", "Show note?", 2);
  await addResponses({
    surveyId: showId,
    teamId: showA,
    role: engineer,
    office: london,
    count: 3,
    score: 5,
    scaleQuestionId: showScale,
    textQuestionId: showText,
  });
  await addResponses({
    surveyId: showId,
    teamId: showB,
    role: designer,
    office: london,
    count: 3,
    score: 1,
    scaleQuestionId: showScale,
    textQuestionId: showText,
  });
  await addResponses({
    surveyId: showId,
    teamId: showC,
    role: engineer,
    office: berlin,
    count: 3,
    score: 2,
    comment: "berlin-note",
    scaleQuestionId: showScale,
    textQuestionId: showText,
  });
  await addResponses({
    surveyId: showId,
    teamId: showD,
    role: designer,
    office: madrid,
    count: 3,
    score: 4,
    scaleQuestionId: showScale,
    textQuestionId: showText,
  });

  const shown = await getSurveyResults(tokens[0], { floor });
  assert.ok(shown);
  assert.equal(shown.roleVisibility, "all");
  assert.deepEqual(
    shown.offices.map((office) => office.teamName),
    [berlin, london, madrid],
  );
  assert.equal(shown.offices[0]?.responseCount, 3);
  assert.equal(shown.offices[0]?.averageScore, 2);
  assert.equal(shown.offices[0]?.health, "low");
  assert.equal(shown.offices[1]?.responseCount, 6);
  assert.equal(shown.offices[1]?.averageScore, 3);
  assert.equal(shown.offices[2]?.responseCount, 3);

  const londonSlice = await getSurveyResults(tokens[0], { office: `  ${london}  `, floor });
  assert.ok(londonSlice);
  assert.equal(londonSlice.roleVisibility, "shown");
  assert.equal(londonSlice.office, london);
  assert.equal(londonSlice.survey.responseCount, 6);
  assert.equal(londonSlice.survey.averageScore, 3);
  assert.deepEqual(londonSlice.offices, []);
  assert.deepEqual(
    londonSlice.teams.map((team) => team.teamName),
    [`Off B ${stamp}`, `Off A ${stamp}`],
  );

  const londonEngineers = await getSurveyResults(tokens[0], {
    office: london,
    role: engineer,
    floor,
  });
  assert.ok(londonEngineers);
  assert.equal(londonEngineers.roleVisibility, "shown");
  assert.equal(londonEngineers.survey.responseCount, 3);
  assert.deepEqual(
    londonEngineers.teams.map((team) => team.teamName),
    [`Off A ${stamp}`],
  );

  const wrongOffice = await getSurveyResults(tokens[0], {
    teamId: showA,
    office: berlin,
    floor,
  });
  assert.ok(wrongOffice);
  assert.equal(wrongOffice.roleVisibility, "empty");
  assert.equal(wrongOffice.survey.responseCount, 0);

  const berlinComments = await getPublishedComments(tokens[0], { office: berlin, floor });
  assert.equal(berlinComments?.length, 1);
  assert.equal(berlinComments?.[0]?.text, "berlin-note");
  const londonComments = await getPublishedComments(tokens[0], { office: london, floor });
  assert.deepEqual(londonComments, []);

  const detail = await getSurveyReportDetail(tokens[0], { office: london }, floor);
  assert.ok(detail);
  assert.equal(detail.employeeCount, 3);
  assert.equal(detail.office, london);
  assert.ok(detail.offices.includes(london));
  assert.ok(detail.offices.includes(berlin));

  const missing = await getSurveyReportDetail(tokens[0], { office: `Nowhere ${stamp}` }, floor);
  assert.ok(missing);
  assert.equal(missing.results.roleVisibility, "empty");
  assert.equal(missing.employeeCount, 0);
  assert.equal(missing.results.survey.responseCount, 0);

  const tooLong = await getSurveyResults(tokens[0], { office: "x".repeat(81), floor });
  assert.ok(tooLong);
  assert.equal(tooLong.roleVisibility, "empty");
  assert.equal(tooLong.office?.length, 81);
  assert.equal(tooLong.survey.responseCount, 0);

  const gapId = await insertSurvey(tokens[1]);
  const gapScale = await insertQuestion(gapId, "scale", "Gap week?", 1);
  await addResponses({
    surveyId: gapId,
    teamId: gapA,
    role: engineer,
    office: london,
    count: 3,
    score: 5,
    scaleQuestionId: gapScale,
    textQuestionId: gapScale,
  });
  await addResponses({
    surveyId: gapId,
    teamId: gapB,
    role: engineer,
    office: london,
    count: 3,
    score: 4,
    scaleQuestionId: gapScale,
    textQuestionId: gapScale,
  });
  await addResponses({
    surveyId: gapId,
    teamId: gapC,
    role: engineer,
    office: berlin,
    count: 2,
    score: 1,
    scaleQuestionId: gapScale,
    textQuestionId: gapScale,
  });

  const gapAll = await getSurveyResults(tokens[1], { floor });
  assert.ok(gapAll);
  assert.equal(
    gapAll.offices.some((office) => office.teamName === london),
    false,
  );
  assert.equal(gapAll.offices.at(-1)?.teamName, SUPPRESSED_TEAM_NAME);
  assert.equal(gapAll.offices.at(-1)?.responseCount, 8);

  const gapLondon = await getSurveyResults(tokens[1], { office: london, floor });
  assert.ok(gapLondon);
  assert.equal(gapLondon.roleVisibility, "withheld");
  assert.equal(gapLondon.survey.responseCount, 0);
  assert.deepEqual(gapLondon.teams, []);
  const gapLondonComments = await getPublishedComments(tokens[1], { office: london, floor });
  assert.deepEqual(gapLondonComments, []);

  const gapBerlin = await getSurveyResults(tokens[1], { office: berlin, floor });
  assert.ok(gapBerlin);
  assert.equal(gapBerlin.roleVisibility, "hidden");
  assert.equal(gapBerlin.survey.responseCount, 0);

  const holeId = await insertSurvey(tokens[4]);
  const holeScale = await insertQuestion(holeId, "scale", "Hole week?", 1);
  await addResponses({
    surveyId: holeId,
    teamId: holeE,
    role: engineer,
    office: london,
    count: 4,
    score: 5,
    scaleQuestionId: holeScale,
    textQuestionId: holeScale,
  });
  await addResponses({
    surveyId: holeId,
    teamId: holeF,
    role: designer,
    office: london,
    count: 2,
    score: 1,
    scaleQuestionId: holeScale,
    textQuestionId: holeScale,
  });
  await addResponses({
    surveyId: holeId,
    teamId: holeG,
    role: engineer,
    office: berlin,
    count: 4,
    score: 3,
    scaleQuestionId: holeScale,
    textQuestionId: holeScale,
  });
  await addResponses({
    surveyId: holeId,
    teamId: holeH,
    role: designer,
    office: madrid,
    count: 4,
    score: 4,
    scaleQuestionId: holeScale,
    textQuestionId: holeScale,
  });
  const hole = await getSurveyResults(tokens[4], {
    office: london,
    role: engineer,
    floor,
  });
  assert.ok(hole);
  assert.equal(hole.roleVisibility, "withheld");
  assert.equal(hole.survey.responseCount, 0);

  const noneId = await insertSurvey(tokens[2]);
  const noneScale = await insertQuestion(noneId, "scale", "None week?", 1);
  await addResponses({
    surveyId: noneId,
    teamId: none,
    role: null,
    office: null,
    count: 3,
    score: 4,
    scaleQuestionId: noneScale,
    textQuestionId: noneScale,
  });
  const noOffice = await getSurveyResults(tokens[2], { floor });
  assert.ok(noOffice);
  assert.deepEqual(noOffice.offices, []);
  assert.equal(noOffice.teams[0]?.teamName, `Off None ${stamp}`);

  await db.update(teams).set({ office: oslo }).where(eq(teams.id, none));
  const moved = await getSurveyResults(tokens[2], { office: oslo, floor });
  assert.ok(moved);
  assert.equal(moved.roleVisibility, "empty");
  assert.equal(moved.survey.responseCount, 0);
  const movedAll = await getSurveyResults(tokens[2], { floor });
  assert.deepEqual(movedAll?.offices, []);

  const mixId = await insertSurvey(tokens[3]);
  const mixScale = await insertQuestion(mixId, "scale", "Mix week?", 1);
  await addResponses({
    surveyId: mixId,
    teamId: mixLondon,
    role: engineer,
    office: london,
    count: 3,
    score: 4,
    scaleQuestionId: mixScale,
    textQuestionId: mixScale,
  });
  await addResponses({
    surveyId: mixId,
    teamId: mixNone,
    role: engineer,
    office: null,
    count: 3,
    score: 2,
    scaleQuestionId: mixScale,
    textQuestionId: mixScale,
  });
  const mixed = await getSurveyResults(tokens[3], { floor });
  assert.ok(mixed);
  assert.deepEqual(
    mixed.offices.map((office) => [office.teamName, office.responseCount]),
    [
      ["No office", 3],
      [london, 3],
    ],
  );
  assert.equal(
    mixed.offices.some((office) => office.teamName === `Paris ${stamp}`),
    false,
  );

  const splitId = await insertSurvey(tokens[5]);
  const splitScale = await insertQuestion(splitId, "scale", "Split week?", 1);
  await addResponses({
    surveyId: splitId,
    teamId: split,
    role: engineer,
    office: london,
    count: 3,
    score: 5,
    scaleQuestionId: splitScale,
    textQuestionId: splitScale,
  });
  await addResponses({
    surveyId: splitId,
    teamId: split,
    role: engineer,
    office: berlin,
    count: 3,
    score: 1,
    scaleQuestionId: splitScale,
    textQuestionId: splitScale,
  });
  const splitAll = await getSurveyResults(tokens[5], { floor });
  assert.ok(splitAll);
  assert.deepEqual(
    splitAll.offices.map((office) => [office.teamName, office.responseCount]),
    [
      [berlin, 3],
      [london, 3],
    ],
  );
  assert.equal(splitAll.teams.length, 1);
  assert.equal(splitAll.teams[0]?.responseCount, 6);
  assert.equal(
    splitAll.offices.some((office) => office.teamName === `Paris ${stamp}`),
    false,
  );
  const splitLondon = await getSurveyResults(tokens[5], { office: london, floor });
  assert.ok(splitLondon);
  assert.equal(splitLondon.roleVisibility, "shown");
  assert.equal(splitLondon.survey.responseCount, 3);
  assert.equal(splitLondon.teams[0]?.teamName, `Off Split ${stamp}`);
});

async function insertTeam(name: string, office: string | null = null) {
  const [team] = await db
    .insert(teams)
    .values({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      office,
    })
    .returning({ id: teams.id });
  assert.ok(team);
  return team.id;
}

async function insertPeople(teamId: string, count: number, office: string | null) {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const [person] = await db
      .insert(employees)
      .values({
        name: `Off ${index} ${teamId.slice(0, 8)}`,
        email: `${teamId}-${index}-${stamp}@office.test`,
        teamId,
        office,
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
    .values({ title: `Office ${token}`, publicToken: token, status: "closed" })
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
  office: string | null;
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
        office: input.office,
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
