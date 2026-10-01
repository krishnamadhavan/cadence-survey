import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { getSurveyReportDetail, listSegmentRoles } from "@/db/reports";
import {
  getPublishedComments,
  getSurveyResults,
  SUPPRESSED_TEAM_NAME,
} from "@/db/results";
import { getAnonymityFloor } from "@/db/settings";
import {
  answers,
  employees,
  questions,
  responses,
  surveys,
  teams,
} from "@/db/schema";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";
import { redis } from "@/lib/redis";
import { submitSurveyResponse } from "@/lib/submit-response";

const stamp = Date.now();
const engineerRole = `Engineer ${stamp}`;
const designerRole = `Designer ${stamp}`;
const directorRole = `Director ${stamp}`;
const oldRole = `Old Role ${stamp}`;
const mainToken = `role-report-${stamp}`;
const foldToken = `role-fold-${stamp}`;
const prevToken = `role-prev-${stamp}`;
const submitToken = `role-submit-${stamp}`;

test("role filter keeps the anonymity floor for each role", async (t) => {
  const tokens = [mainToken, foldToken, prevToken, submitToken];
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
    await redis.quit();
  });

  const configured = await getAnonymityFloor();
  const floor =
    Number.isInteger(configured) && configured >= MIN_TEAM_RESPONSES
      ? configured
      : MIN_TEAM_RESPONSES;

  const large = await insertTeam(`Role Large ${stamp}`, `role-large-${stamp}`);
  const wide = await insertTeam(`Role Wide ${stamp}`, `role-wide-${stamp}`);
  const small = await insertTeam(`Role Small ${stamp}`, `role-small-${stamp}`);
  const directors = await insertTeam(
    `Role Directors ${stamp}`,
    `role-directors-${stamp}`,
  );
  const foldA = await insertTeam(`Role Fold A ${stamp}`, `role-fold-a-${stamp}`);
  const foldB = await insertTeam(`Role Fold B ${stamp}`, `role-fold-b-${stamp}`);
  teamIds.push(large, wide, small, directors, foldA, foldB);

  employeeIds.push(
    ...(await insertPeople(large, [
      ["Large Engineer", `eng-large-${stamp}@cadence.test`, engineerRole],
      ["Large Designer", `des-large-${stamp}@cadence.test`, designerRole],
    ])),
    ...(await insertPeople(wide, [
      ["Wide Engineer", `eng-wide-${stamp}@cadence.test`, engineerRole],
      ["Wide Designer", `des-wide-${stamp}@cadence.test`, designerRole],
    ])),
    ...(await insertPeople(directors, [
      ["Director One", `dir-a-${stamp}@cadence.test`, directorRole],
      ["Director Two", `dir-b-${stamp}@cadence.test`, directorRole],
    ])),
  );

  const mainId = await insertSurvey(mainToken, "open");
  const mainScale = await insertQuestion(mainId, "scale", "How was the week?", 1);
  const mainText = await insertQuestion(mainId, "text", "What should we know?", 2);

  await addResponses({
    surveyId: mainId,
    teamId: large,
    role: engineerRole,
    count: floor + 2,
    score: 5,
    comment: "eng-large",
    scaleQuestionId: mainScale,
    textQuestionId: mainText,
  });
  await addResponses({
    surveyId: mainId,
    teamId: large,
    role: designerRole,
    count: floor,
    score: 1,
    comment: "designer-large",
    scaleQuestionId: mainScale,
    textQuestionId: mainText,
  });
  await addResponses({
    surveyId: mainId,
    teamId: large,
    role: null,
    count: 1,
    score: 1,
    comment: "no-role",
    scaleQuestionId: mainScale,
    textQuestionId: mainText,
  });
  await addResponses({
    surveyId: mainId,
    teamId: wide,
    role: engineerRole,
    count: floor - 1,
    score: 1,
    comment: "eng-wide",
    scaleQuestionId: mainScale,
    textQuestionId: mainText,
  });
  await addResponses({
    surveyId: mainId,
    teamId: wide,
    role: designerRole,
    count: floor,
    score: 1,
    scaleQuestionId: mainScale,
    textQuestionId: mainText,
  });
  await addResponses({
    surveyId: mainId,
    teamId: small,
    role: engineerRole,
    count: 1,
    score: 1,
    comment: "eng-small",
    scaleQuestionId: mainScale,
    textQuestionId: mainText,
  });
  await addResponses({
    surveyId: mainId,
    teamId: small,
    role: oldRole,
    count: 1,
    score: 2,
    comment: "old-role-secret",
    scaleQuestionId: mainScale,
    textQuestionId: mainText,
  });
  await addResponses({
    surveyId: mainId,
    teamId: directors,
    role: directorRole,
    count: floor - 1,
    score: 2,
    comment: "director-secret",
    scaleQuestionId: mainScale,
    textQuestionId: mainText,
  });

  const everyone = await getSurveyResults(mainToken);
  assert.ok(everyone);
  assert.equal(everyone.role, null);
  assert.equal(everyone.roleVisibility, "all");
  const largeAll = everyone.teams.find((team) => team.teamName === `Role Large ${stamp}`);
  const wideAll = everyone.teams.find((team) => team.teamName === `Role Wide ${stamp}`);
  assert.ok(largeAll);
  assert.ok(wideAll);
  assert.notEqual(largeAll.averageScore, 5);
  assert.equal(
    everyone.teams.some((team) => team.teamName === `Role Small ${stamp}`),
    false,
  );
  assert.equal(
    everyone.teams.some((team) => team.teamName === `Role Directors ${stamp}`),
    false,
  );

  const unfilteredComments = await getPublishedComments(mainToken);
  assert.ok(unfilteredComments);
  const unfilteredText = unfilteredComments.map((comment) => comment.text);
  assert.ok(unfilteredText.includes("eng-large"));
  assert.ok(unfilteredText.includes("designer-large"));
  assert.ok(unfilteredText.includes("eng-wide"));
  assert.equal(unfilteredText.includes("eng-small"), false);
  assert.equal(unfilteredText.includes("director-secret"), false);
  assert.equal(unfilteredText.includes("old-role-secret"), false);

  const engineers = await getSurveyResults(mainToken, { role: engineerRole });
  assert.ok(engineers);
  assert.equal(engineers.roleVisibility, "shown");
  assert.equal(engineers.role, engineerRole);
  const largeEngineers = engineers.teams.find(
    (team) => team.teamName === `Role Large ${stamp}`,
  );
  assert.ok(largeEngineers);
  assert.equal(largeEngineers.responseCount, floor + 2);
  assert.equal(largeEngineers.averageScore, 5);
  assert.equal(
    engineers.teams.some((team) => team.teamName === `Role Wide ${stamp}`),
    false,
  );
  assert.equal(
    engineers.teams.some((team) => team.teamName === `Role Small ${stamp}`),
    false,
  );
  const engineerComments = await getPublishedComments(mainToken, {
    role: engineerRole,
  });
  assert.ok(engineerComments);
  const engineerText = engineerComments.map((comment) => comment.text);
  assert.deepEqual(engineerText, ["eng-large"]);

  const designers = await getSurveyResults(mainToken, { role: `  ${designerRole}  ` });
  assert.ok(designers);
  assert.equal(designers.role, designerRole);
  assert.equal(designers.roleVisibility, "shown");
  assert.equal(
    designers.teams.find((team) => team.teamName === `Role Large ${stamp}`)
      ?.averageScore,
    1,
  );
  assert.equal(
    designers.teams.find((team) => team.teamName === `Role Large ${stamp}`)
      ?.responseCount,
    floor,
  );

  const directorsOnly = await getSurveyResults(mainToken, { role: directorRole });
  assert.ok(directorsOnly);
  assert.equal(directorsOnly.roleVisibility, "hidden");
  assert.equal(directorsOnly.survey.responseCount, 0);
  assert.equal(directorsOnly.survey.averageScore, null);
  assert.equal(directorsOnly.teams.length, 0);
  for (const question of directorsOnly.questions) {
    assert.equal(question.scale?.average ?? null, null);
    assert.equal(question.scale?.count ?? 0, 0);
    assert.equal(question.text?.count ?? 0, 0);
  }
  assert.deepEqual(await getPublishedComments(mainToken, { role: directorRole }), []);

  const missing = await getSurveyResults(mainToken, { role: "Nope" });
  assert.ok(missing);
  assert.equal(missing.roleVisibility, "empty");
  assert.equal(missing.survey.responseCount, 0);
  assert.equal(missing.survey.averageScore, null);
  assert.equal(missing.teams.length, 0);

  const foldId = await insertSurvey(foldToken, "open");
  const foldScale = await insertQuestion(foldId, "scale", "Folded week?", 1);
  const foldText = await insertQuestion(foldId, "text", "Folded note?", 2);
  await addResponses({
    surveyId: foldId,
    teamId: foldA,
    role: engineerRole,
    count: floor,
    score: 5,
    comment: "fold-named",
    scaleQuestionId: foldScale,
    textQuestionId: foldText,
  });
  await addResponses({
    surveyId: foldId,
    teamId: foldB,
    role: engineerRole,
    count: 1,
    score: 1,
    comment: "fold-secret",
    scaleQuestionId: foldScale,
    textQuestionId: foldText,
  });
  const folded = await getSurveyResults(foldToken, { role: engineerRole });
  assert.ok(folded);
  assert.equal(folded.roleVisibility, "shown");
  assert.equal(folded.survey.responseCount, floor + 1);
  assert.notEqual(folded.survey.averageScore, 5);
  assert.equal(
    folded.teams.every((team) => team.teamName === SUPPRESSED_TEAM_NAME),
    true,
  );
  assert.equal(
    folded.teams.some((team) => team.responseCount === floor),
    false,
  );
  const foldComments = await getPublishedComments(foldToken, { role: engineerRole });
  assert.ok(foldComments);
  assert.equal(
    foldComments.some((comment) => comment.text === "fold-named"),
    false,
  );
  assert.equal(
    foldComments.some((comment) => comment.text === "fold-secret"),
    false,
  );

  const prevId = await insertSurvey(prevToken, "closed");
  const prevScale = await insertQuestion(prevId, "scale", "Previous week?", 1);
  await addResponses({
    surveyId: prevId,
    teamId: small,
    role: engineerRole,
    count: 1,
    score: 4,
    scaleQuestionId: prevScale,
    textQuestionId: prevScale,
  });

  const hiddenDetail = await getSurveyReportDetail(mainToken, directorRole);
  assert.ok(hiddenDetail);
  assert.equal(hiddenDetail.results.roleVisibility, "hidden");
  assert.equal(hiddenDetail.employeeCount, 2);
  const hiddenCycle = hiddenDetail.cycles.find(
    (cycle) => cycle.publicToken === mainToken,
  );
  assert.equal(hiddenCycle?.averageScore, null);
  assert.equal(hiddenCycle?.participation, null);
  assert.equal(hiddenCycle?.responseCount, 0);

  const engineerDetail = await getSurveyReportDetail(mainToken, ` ${engineerRole} `);
  assert.ok(engineerDetail);
  assert.equal(engineerDetail.role, engineerRole);
  const previousEngineers = engineerDetail.cycles.find(
    (cycle) => cycle.publicToken === prevToken,
  );
  assert.equal(previousEngineers?.averageScore, null);
  assert.equal(previousEngineers?.participation, null);
  assert.notEqual(previousEngineers?.responseCount, 1);

  const roles = await listSegmentRoles();
  assert.ok(roles.includes(engineerRole));
  assert.ok(roles.includes(oldRole));
  assert.equal(roles.includes("eng-large"), false);

  const submitId = await insertSurvey(submitToken, "open");
  const submitQuestion = await insertQuestion(submitId, "scale", "Submit week?", 1);
  const stamped = await submitSurveyResponse(
    submitToken,
    [{ questionId: submitQuestion, value: 4 }],
    `role-submit-${stamp}`,
    large,
    `  ${engineerRole}  `,
  );
  assert.equal(stamped.ok, true);
  if (stamped.ok) {
    const [row] = await db
      .select({ role: responses.role, teamId: responses.teamId })
      .from(responses)
      .where(eq(responses.id, stamped.responseId))
      .limit(1);
    assert.equal(row?.role, engineerRole);
    assert.equal(row?.teamId, large);
  }

  const wrongTeam = await submitSurveyResponse(
    submitToken,
    [{ questionId: submitQuestion, value: 4 }],
    `role-submit-${stamp}`,
    large,
    directorRole,
  );
  assert.equal(wrongTeam.ok, false);
  if (!wrongTeam.ok) {
    assert.match(wrongTeam.error, /role/i);
  }

  const skipped = await submitSurveyResponse(
    submitToken,
    [{ questionId: submitQuestion, value: 3 }],
    `role-submit-${stamp}-blank`,
    large,
    "   ",
  );
  assert.equal(skipped.ok, true);
  if (skipped.ok) {
    const [row] = await db
      .select({ role: responses.role })
      .from(responses)
      .where(eq(responses.id, skipped.responseId))
      .limit(1);
    assert.equal(row?.role, null);
  }

  const tooLong = await submitSurveyResponse(
    submitToken,
    [{ questionId: submitQuestion, value: 3 }],
    `role-submit-${stamp}-long`,
    large,
    "x".repeat(81),
  );
  assert.equal(tooLong.ok, false);
});

async function insertTeam(name: string, slug: string) {
  const [team] = await db
    .insert(teams)
    .values({ name, slug })
    .returning({ id: teams.id });
  assert.ok(team);
  return team.id;
}

async function insertPeople(
  teamId: string,
  people: Array<[string, string, string]>,
) {
  const ids: string[] = [];
  for (const [name, email, role] of people) {
    const [person] = await db
      .insert(employees)
      .values({ name, email, teamId, role })
      .returning({ id: employees.id });
    assert.ok(person);
    ids.push(person.id);
  }
  return ids;
}

async function insertSurvey(token: string, status: "open" | "closed") {
  const [survey] = await db
    .insert(surveys)
    .values({ title: `Role report ${token}`, publicToken: token, status })
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
