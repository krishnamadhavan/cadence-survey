import "./../lib/load-env";
import assert from "node:assert/strict";
import { test } from "node:test";
import { asc, eq, inArray } from "drizzle-orm";
import { db, pg } from "@/db/client";
import { listSegmentRoles } from "@/db/reports";
import { getSurveyResults } from "@/db/results";
import { admins, answers, auditEvents, questions, responses, surveys, teams } from "@/db/schema";
import {
  importSurveyResponses,
  responseImportTemplateForSurvey,
} from "@/db/response-import";

const stamp = Date.now();
const email = `import-${stamp}@cadence.test`;
const closedToken = `history-${stamp}`;
const openToken = `history-open-${stamp}`;
const draftToken = `history-draft-${stamp}`;
const sliceToken = `history-slice-${stamp}`;
const engineerRole = `Historian ${stamp}`;
const designerRole = `Archivist ${stamp}`;

test("imports one response per row onto a draft or closed pulse", async (t) => {
  const tokens = [closedToken, openToken, draftToken, sliceToken];
  const teamIds: string[] = [];

  t.after(async () => {
    try {
      await db.delete(surveys).where(inArray(surveys.publicToken, tokens));
      if (teamIds.length > 0) {
        await db.delete(teams).where(inArray(teams.id, teamIds));
      }
      await db.delete(auditEvents).where(eq(auditEvents.actorEmail, email));
      await db.delete(admins).where(eq(admins.email, email));
    } finally {
      await pg.end({ timeout: 2 });
    }
  });

  const [team] = await db
    .insert(teams)
    .values({ name: `History Eng ${stamp}`, slug: `history-eng-${stamp}` })
    .returning({ id: teams.id });
  assert.ok(team);
  teamIds.push(team.id);

  const [admin] = await db
    .insert(admins)
    .values({ email, passwordHash: "test-only-hash" })
    .returning({ id: admins.id });
  assert.ok(admin);
  const actor = { id: admin.id, email };

  const closedId = await insertSurvey(closedToken, `History ${stamp}`, "closed");
  await insertQuestion(closedId, "scale", "How was the week?", 1, { min: 1, max: 5 });
  await insertQuestion(closedId, "choice", "Pace", 2, { choices: ["Fast", "Slow"] });
  await insertQuestion(closedId, "text", "Notes", 3, null);

  const header = "Team,Role,Tenure,Submitted,How was the week?,Pace,Notes";
  const good = [
    header,
    `History Eng ${stamp},Engineer,1-3yr,2024-05-02,4,Fast,"shipped, today"`,
    `history-eng-${stamp},Designer,<1yr,2024-05-03T15:04:05Z,5,Slow,=1+1`,
    "Unassigned,,,2024-01-15,3,,",
  ].join("\n");

  const mixed = [
    "Team,How was the week?,Pace,Notes",
    `History Eng ${stamp},4,Fast,ok`,
    `History Eng ${stamp},9,Fast,no`,
  ].join("\n");
  const rejected = await importSurveyResponses({
    publicToken: closedToken,
    csvText: mixed,
    actor,
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.status, 400);
    assert.ok(rejected.errors?.some((error) => error.message.includes("whole number")));
  }
  assert.equal(await responseCount(closedId), 0);

  const imported = await importSurveyResponses({
    publicToken: closedToken,
    csvText: good,
    actor,
  });
  assert.deepEqual(imported, { ok: true, imported: 3 });
  assert.equal(await responseCount(closedId), 3);

  const stored = await db
    .select({
      teamId: responses.teamId,
      role: responses.role,
      tenureBand: responses.tenureBand,
      submittedAt: responses.submittedAt,
      question: questions.prompt,
      value: answers.value,
    })
    .from(responses)
    .leftJoin(answers, eq(answers.responseId, responses.id))
    .leftJoin(questions, eq(questions.id, answers.questionId))
    .where(eq(responses.surveyId, closedId))
    .orderBy(asc(responses.submittedAt), asc(questions.position));

  const engineering = stored.filter((row) => row.teamId === team.id && row.role === "Engineer");
  assert.equal(engineering[0]?.tenureBand, "y1_3");
  assert.equal(engineering[0]?.submittedAt.toISOString(), "2024-05-02T00:00:00.000Z");
  assert.deepEqual(
    engineering.map((row) => [row.question, row.value?.value]),
    [
      ["How was the week?", 4],
      ["Pace", "Fast"],
      ["Notes", "shipped, today"],
    ],
  );
  const designer = stored.filter((row) => row.role === "Designer");
  assert.equal(designer[0]?.tenureBand, "lt_1");
  assert.equal(designer.find((row) => row.question === "Notes")?.value?.value, "=1+1");
  const unassigned = stored.filter((row) => row.teamId === null);
  assert.equal(unassigned.length, 1);
  assert.equal(unassigned[0]?.role, null);
  assert.equal(unassigned[0]?.question, "How was the week?");

  const unknown = await importSurveyResponses({
    publicToken: closedToken,
    csvText: `Team,How was the week?,Pace,Notes\nMissing ${stamp},4,Fast,ok\n`,
    actor,
  });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.equal(unknown.errors?.[0]?.message, `Unknown team: Missing ${stamp}`);
  }
  assert.equal(await responseCount(closedId), 3);

  const again = await importSurveyResponses({
    publicToken: closedToken,
    csvText: good,
    actor,
  });
  assert.deepEqual(again, { ok: true, imported: 3 });
  assert.equal(await responseCount(closedId), 6);

  const openId = await insertSurvey(openToken, `Open ${stamp}`, "open");
  await insertQuestion(openId, "scale", "How was the week?", 1, { min: 1, max: 5 });
  const blocked = await importSurveyResponses({
    publicToken: openToken,
    csvText: `Team,How was the week?\nHistory Eng ${stamp},4\n`,
    actor,
  });
  assert.deepEqual(blocked, {
    ok: false,
    status: 409,
    error: "Close the pulse before importing past responses.",
  });
  assert.equal(await responseCount(openId), 0);

  const draftId = await insertSurvey(draftToken, `Draft ${stamp}`, "draft");
  await insertQuestion(draftId, "text", "Notes", 1, null);
  const draft = await importSurveyResponses({
    publicToken: draftToken,
    csvText: `Team,Notes\nHistory Eng ${stamp},hello\n`,
    actor,
  });
  assert.deepEqual(draft, { ok: true, imported: 1 });

  const sliceId = await insertSurvey(sliceToken, `Slice ${stamp}`, "closed");
  await insertQuestion(sliceId, "scale", "How was the week?", 1, { min: 1, max: 5 });
  const sliceRows = [
    "Team,Role,Tenure,How was the week?",
    ...Array.from(
      { length: 3 },
      () => `History Eng ${stamp},${engineerRole},1-3yr,5`,
    ),
    ...Array.from(
      { length: 3 },
      () => `History Eng ${stamp},${designerRole},<1yr,1`,
    ),
  ].join("\n");
  const sliced = await importSurveyResponses({
    publicToken: sliceToken,
    csvText: sliceRows,
    actor,
  });
  assert.deepEqual(sliced, { ok: true, imported: 6 });

  const roles = await listSegmentRoles();
  assert.ok(roles.includes(engineerRole));
  assert.ok(roles.includes(designerRole));

  const byRole = await getSurveyResults(sliceToken, {
    role: engineerRole,
    floor: 3,
    skipSchedule: true,
  });
  assert.equal(byRole?.roleVisibility, "shown");
  assert.equal(byRole?.survey.responseCount, 3);
  assert.equal(byRole?.survey.averageScore, 5);

  const byTenure = await getSurveyResults(sliceToken, {
    tenure: "lt_1",
    floor: 3,
    skipSchedule: true,
  });
  assert.equal(byTenure?.roleVisibility, "shown");
  assert.equal(byTenure?.survey.responseCount, 3);
  assert.equal(byTenure?.survey.averageScore, 1);

  const byTeam = await getSurveyResults(sliceToken, {
    teamId: team.id,
    floor: 3,
    skipSchedule: true,
  });
  assert.equal(byTeam?.roleVisibility, "shown");
  assert.equal(byTeam?.survey.responseCount, 6);
  assert.equal(byTeam?.survey.averageScore, 3);

  const byRoleAndTenure = await getSurveyResults(sliceToken, {
    role: engineerRole,
    tenure: "y1_3",
    floor: 3,
    skipSchedule: true,
  });
  assert.equal(byRoleAndTenure?.survey.responseCount, 3);
  assert.equal(byRoleAndTenure?.survey.averageScore, 5);

  const mismatch = await getSurveyResults(sliceToken, {
    role: engineerRole,
    tenure: "lt_1",
    floor: 3,
    skipSchedule: true,
  });
  assert.equal(mismatch?.roleVisibility, "empty");
  assert.equal(mismatch?.survey.responseCount, 0);

  const template = await responseImportTemplateForSurvey(closedToken);
  assert.equal(template.state, "ready");
  if (template.state === "ready") {
    assert.match(template.csv, /How was the week\?/);
    assert.match(template.filename, /response-template\.csv$/);
  }

  const audits = await db
    .select({ summary: auditEvents.summary, action: auditEvents.action })
    .from(auditEvents)
    .where(eq(auditEvents.actorEmail, email))
    .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id));
  assert.deepEqual(
    audits.map((row) => row.summary),
    [
      `Imported 3 responses into History ${stamp}`,
      `Imported 3 responses into History ${stamp}`,
      `Imported 1 response into Draft ${stamp}`,
      `Imported 6 responses into Slice ${stamp}`,
    ],
  );
  assert.ok(audits.every((row) => row.action === "responses.imported"));
  assert.ok(audits.every((row) => !row.summary.includes("shipped") && !row.summary.includes("=1+1")));
});

async function responseCount(surveyId: string): Promise<number> {
  const rows = await db
    .select({ id: responses.id })
    .from(responses)
    .where(eq(responses.surveyId, surveyId));
  return rows.length;
}

async function insertSurvey(token: string, title: string, status: "draft" | "open" | "closed") {
  const [survey] = await db
    .insert(surveys)
    .values({ title, publicToken: token, status })
    .returning({ id: surveys.id });
  assert.ok(survey);
  return survey.id;
}

async function insertQuestion(
  surveyId: string,
  type: "scale" | "text" | "choice",
  prompt: string,
  position: number,
  options: { min: number; max: number } | { choices: string[] } | null,
) {
  const [question] = await db
    .insert(questions)
    .values({ surveyId, prompt, type, options, position, required: true })
    .returning({ id: questions.id });
  assert.ok(question);
  return question.id;
}
