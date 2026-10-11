import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { listPulseParticipation } from "@/db/pulse-links";
import { employees, pulseLinks, surveys, teams } from "@/db/schema";

const stamp = Date.now();
const surveyIds: string[] = [];
const employeeIds: string[] = [];
const teamIds: string[] = [];

test("participation counts who has answered on each team", async (t) => {
  t.after(async () => {
    if (surveyIds.length > 0) {
      await db.delete(surveys).where(inArray(surveys.id, surveyIds));
    }
    if (employeeIds.length > 0) {
      await db.delete(employees).where(inArray(employees.id, employeeIds));
    }
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await pg.end({ timeout: 2 });
  });

  assert.equal(await listPulseParticipation(`missing-participation-${stamp}`), null);

  const draftToken = `part-draft-${stamp}`;
  const draftId = await insertSurvey(draftToken, "draft");
  const draftView = await listPulseParticipation(draftToken);
  assert.deepEqual(draftView, { issued: false, responded: 0, total: 0, teams: [] });
  const draftRows = await db
    .select({ id: pulseLinks.id })
    .from(pulseLinks)
    .where(eq(pulseLinks.surveyId, draftId));
  assert.equal(draftRows.length, 0);

  const design = await insertTeam(`Part Design ${stamp}`, `part-design-${stamp}`);
  const engineering = await insertTeam(`Part Eng ${stamp}`, `part-eng-${stamp}`);
  const ada = await insertPerson(`Ada ${stamp}`, `ada-${stamp}@part.test`, design);
  const bea = await insertPerson(`Bea ${stamp}`, `bea-${stamp}@part.test`, design);
  const cam = await insertPerson(`Cam ${stamp}`, `cam-${stamp}@part.test`, engineering);

  const token = `part-open-${stamp}`;
  const surveyId = await insertSurvey(token, "open");
  const openView = await listPulseParticipation(token);
  assert.ok(openView);
  assert.equal(openView.issued, true);
  const openDesign = teamById(openView.teams, design);
  const openEng = teamById(openView.teams, engineering);
  assert.deepEqual([openDesign.responded, openDesign.total], [0, 2]);
  assert.deepEqual([openEng.responded, openEng.total], [0, 1]);
  assert.ok(openView.teams.indexOf(openDesign) < openView.teams.indexOf(openEng));
  assert.deepEqual(
    openDesign.waiting.map((person) => person.email),
    [ada.email, bea.email],
  );
  const adaToken = openDesign.waiting.find((person) => person.email === ada.email)?.token;
  const beaToken = openDesign.waiting.find((person) => person.email === bea.email)?.token;
  const camToken = openEng.waiting.find((person) => person.email === cam.email)?.token;
  assert.match(adaToken ?? "", /^[0-9a-f]{32}$/);
  assert.match(beaToken ?? "", /^[0-9a-f]{32}$/);
  assert.match(camToken ?? "", /^[0-9a-f]{32}$/);

  await db.update(pulseLinks).set({ redeemed: true }).where(eq(pulseLinks.token, camToken ?? ""));
  await db.update(pulseLinks).set({ redeemed: true }).where(eq(pulseLinks.token, adaToken ?? ""));

  const after = await listPulseParticipation(token);
  assert.ok(after);
  const designAfter = teamById(after.teams, design);
  const engAfter = teamById(after.teams, engineering);
  assert.deepEqual([designAfter.responded, designAfter.total], [1, 2]);
  assert.deepEqual([engAfter.responded, engAfter.total], [1, 1]);
  assert.deepEqual(engAfter.waiting, []);
  assert.deepEqual(
    designAfter.waiting.map((person) => person.email),
    [bea.email],
  );
  assert.equal(designAfter.waiting[0]?.token, beaToken);
  assert.equal(waitingTokens(after).includes(adaToken ?? "missing"), false);
  assert.equal(waitingTokens(after).includes(camToken ?? "missing"), false);
  assert.ok(after.teams.indexOf(designAfter) < after.teams.indexOf(engAfter));

  await db.update(surveys).set({ status: "closed" }).where(eq(surveys.id, surveyId));
  const lateTeam = await insertTeam(`Part Late ${stamp}`, `part-late-${stamp}`);
  const late = await insertPerson(`Late ${stamp}`, `late-${stamp}@part.test`, lateTeam);
  const closedView = await listPulseParticipation(token);
  assert.ok(closedView);
  assert.equal(
    closedView.teams.some((team) => team.teamId === lateTeam),
    false,
  );
  assert.equal(
    closedView.teams.some((team) =>
      team.waiting.some((person) => person.email === late.email),
    ),
    false,
  );
  assert.deepEqual(
    teamById(closedView.teams, design).waiting.map((person) => person.email),
    [bea.email],
  );
});

function teamById<T extends { teamId: string }>(teamsView: T[], teamId: string): T {
  const team = teamsView.find((item) => item.teamId === teamId);
  assert.ok(team);
  return team;
}

function waitingTokens(view: { teams: { waiting: { token: string | null }[] }[] }): string[] {
  return view.teams.flatMap((team) =>
    team.waiting.flatMap((person) => (person.token ? [person.token] : [])),
  );
}

async function insertTeam(name: string, slug: string): Promise<string> {
  const [team] = await db
    .insert(teams)
    .values({ name, slug })
    .returning({ id: teams.id });
  assert.ok(team);
  teamIds.push(team.id);
  return team.id;
}

async function insertPerson(name: string, email: string, teamId: string): Promise<{ email: string }> {
  const [person] = await db
    .insert(employees)
    .values({ name, email, teamId })
    .returning({ id: employees.id });
  assert.ok(person);
  employeeIds.push(person.id);
  return { email };
}

async function insertSurvey(token: string, status: "draft" | "open" | "closed"): Promise<string> {
  const [survey] = await db
    .insert(surveys)
    .values({ title: token, publicToken: token, status })
    .returning({ id: surveys.id });
  assert.ok(survey);
  surveyIds.push(survey.id);
  return survey.id;
}
