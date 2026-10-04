import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { listPulseLinks, readPulseLink } from "@/db/pulse-links";
import { answers, employees, pulseLinks, questions, responses, surveys, teams } from "@/db/schema";
import { addSurveyQuestion, setSurveyStatus } from "@/db/surveys";
import { redis } from "@/lib/redis";
import { submitSurveyResponse } from "@/lib/submit-response";

const stamp = Date.now();
const surveyIds: string[] = [];
const employeeIds: string[] = [];
const teamIds: string[] = [];

test("a personal link replaces one anonymous answer until the pulse closes", async (t) => {
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
    await redis.quit();
  });

  const alpha = await insertTeam(`Pulse Alpha ${stamp}`, `pulse-alpha-${stamp}`);
  const beta = await insertTeam(`Pulse Beta ${stamp}`, `pulse-beta-${stamp}`);
  const ada = await insertPerson(`Ada ${stamp}`, `ada-${stamp}@pulse.test`, alpha);
  const bea = await insertPerson(`Bea ${stamp}`, `bea-${stamp}@pulse.test`, beta);

  const draftToken = `qa-draft-${stamp}`;
  const draftId = await insertSurvey(draftToken, "draft");
  const draftLinks = await listPulseLinks(draftToken);
  assert.deepEqual(draftLinks, { issued: false, links: [] });
  const draftRows = await db
    .select({ id: pulseLinks.id })
    .from(pulseLinks)
    .where(eq(pulseLinks.surveyId, draftId));
  assert.equal(draftRows.length, 0);

  const token = `qa-links-${stamp}`;
  const surveyId = await insertSurvey(token, "draft");
  const question = await addSurveyQuestion({
    token,
    prompt: `Note ${stamp}`,
    type: "text",
    required: true,
    min: "1",
    max: "5",
    minLabel: "",
    maxLabel: "",
    choices: "",
  });
  const opened = await setSurveyStatus({ token, status: "open" });
  assert.equal(opened.status, "open");

  const listed = await listPulseLinks(token);
  assert.ok(listed);
  assert.equal(listed.issued, true);
  const adaLink = listed.links.find((link) => link.email === ada.email);
  const beaLink = listed.links.find((link) => link.email === bea.email);
  assert.ok(adaLink);
  assert.ok(beaLink);
  assert.notEqual(adaLink.token, beaLink.token);
  assert.match(adaLink.token, /^[0-9a-f]{32}$/);
  for (const link of listed.links) {
    assert.deepEqual(Object.keys(link).sort(), ["email", "name", "token"]);
  }

  await db
    .update(employees)
    .set({ teamId: beta, role: "Engineer" })
    .where(eq(employees.id, ada.id));

  const phrase = `private-note-${stamp}`;
  const first = await submitSurveyResponse(
    token,
    [{ questionId: question.id, value: phrase }],
    "direct",
    adaLink.token,
    "Engineer",
  );
  assert.equal(first.ok, true);
  if (!first.ok) {
    return;
  }

  const [response] = await db
    .select()
    .from(responses)
    .where(eq(responses.id, first.responseId));
  assert.ok(response);
  assert.equal(response.teamId, beta);
  assert.equal(response.role, "Engineer");
  assert.equal(Object.hasOwn(response, "employeeId"), false);

  const [spent] = await db.select().from(pulseLinks).where(eq(pulseLinks.token, adaLink.token));
  assert.equal(spent?.redeemed, true);
  assert.equal(spent?.employeeId, ada.id);
  assert.equal(spent?.responseId, first.responseId);
  assert.equal(Object.hasOwn(spent ?? {}, "redeemedAt"), false);

  const responseColumns = await pg<{ column_name: string }[]>`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'responses'
  `;
  assert.equal(
    responseColumns.some((column) => column.column_name === "employee_id"),
    false,
  );
  const linkColumns = await pg<{ column_name: string }[]>`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'pulse_links'
  `;
  assert.equal(
    linkColumns.some((column) => column.column_name === "response_id"),
    true,
  );
  assert.equal(
    linkColumns.some((column) => column.column_name === "redeemed_at"),
    false,
  );

  await db
    .update(employees)
    .set({ teamId: alpha, role: "Designer" })
    .where(eq(employees.id, ada.id));

  const kept = await submitSurveyResponse(
    token,
    [{ questionId: question.id, value: `kept-${stamp}` }],
    "direct",
    adaLink.token,
    "Engineer",
  );
  assert.equal(kept.ok, true);
  if (!kept.ok) {
    return;
  }
  assert.equal(kept.responseId, first.responseId);
  const [keptRow] = await db
    .select({ teamId: responses.teamId, role: responses.role })
    .from(responses)
    .where(eq(responses.id, first.responseId));
  assert.equal(keptRow?.teamId, beta);
  assert.equal(keptRow?.role, "Engineer");

  const rejected = await submitSurveyResponse(
    token,
    [{ questionId: question.id, value: `nope-${stamp}` }],
    "direct",
    adaLink.token,
    "Designer",
  );
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.status, 400);
  }
  const rejectedStored = await db
    .select({ value: answers.value })
    .from(answers)
    .where(eq(answers.responseId, first.responseId));
  assert.equal(rejectedStored.length, 1);
  assert.deepEqual(rejectedStored[0]?.value, { value: `kept-${stamp}` });

  const changed = `changed-${stamp}`;
  const second = await submitSurveyResponse(
    token,
    [{ questionId: question.id, value: changed }],
    "direct",
    adaLink.token,
    "",
  );
  assert.equal(second.ok, true);
  if (!second.ok) {
    return;
  }
  assert.equal(second.responseId, first.responseId);
  const [replaced] = await db
    .select({ teamId: responses.teamId, role: responses.role })
    .from(responses)
    .where(eq(responses.id, first.responseId));
  assert.equal(replaced?.teamId, beta);
  assert.equal(replaced?.role, null);
  const stored = await db
    .select({ value: answers.value })
    .from(answers)
    .where(eq(answers.responseId, first.responseId));
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0]?.value, { value: changed });
  const surveyResponses = await db
    .select({ id: responses.id })
    .from(responses)
    .where(eq(responses.surveyId, surveyId));
  assert.equal(surveyResponses.length, 1);

  const view = await readPulseLink(token, adaLink.token);
  assert.equal(view?.editable, true);
  assert.equal(view?.redeemed, true);
  assert.equal(view?.teamId, beta);
  assert.equal(view?.role, null);
  assert.deepEqual(view?.answers, [{ questionId: question.id, value: changed }]);

  const beaSubmit = await submitSurveyResponse(
    token,
    [{ questionId: question.id, value: `bea-note-${stamp}` }],
    "direct",
    beaLink.token,
  );
  assert.equal(beaSubmit.ok, true);

  const otherToken = `qa-other-${stamp}`;
  const otherId = await insertSurvey(otherToken, "draft");
  await addSurveyQuestion({
    token: otherToken,
    prompt: `Other ${stamp}`,
    type: "text",
    required: true,
    min: "1",
    max: "5",
    minLabel: "",
    maxLabel: "",
    choices: "",
  });
  await setSurveyStatus({ token: otherToken, status: "open" });
  const otherListed = await listPulseLinks(otherToken);
  const adaOnOther = otherListed?.links.find((link) => link.email === ada.email);
  assert.ok(adaOnOther);
  assert.notEqual(adaOnOther.token, adaLink.token);
  const crossed = await submitSurveyResponse(
    token,
    [{ questionId: question.id, value: `crossed-${stamp}` }],
    "direct",
    adaOnOther.token,
  );
  assert.equal(crossed.ok, false);
  if (!crossed.ok) {
    assert.equal(crossed.status, 404);
  }
  const [otherLink] = await db
    .select({ redeemed: pulseLinks.redeemed })
    .from(pulseLinks)
    .where(eq(pulseLinks.token, adaOnOther.token));
  assert.equal(otherLink?.redeemed, false);
  const crossedAnswers = await db
    .select({ id: answers.id })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .where(eq(responses.surveyId, otherId));
  assert.equal(crossedAnswers.length, 0);

  const cam = await insertPerson(`Cam ${stamp}`, `cam-${stamp}@pulse.test`, alpha);
  const withCam = await listPulseLinks(token);
  const camLink = withCam?.links.find((link) => link.email === cam.email);
  assert.ok(camLink);
  assert.equal(JSON.stringify(withCam).includes(phrase), false);
  assert.equal(JSON.stringify(withCam).includes(changed), false);
  assert.equal(JSON.stringify(withCam).includes(first.responseId), false);
  assert.equal(JSON.stringify(withCam).includes("redeemed"), false);
  assert.equal(JSON.stringify(withCam).includes("responseId"), false);

  const [raceA, raceB] = await Promise.all([
    submitSurveyResponse(
      token,
      [{ questionId: question.id, value: `race-a-${stamp}` }],
      "direct",
      camLink.token,
    ),
    submitSurveyResponse(
      token,
      [{ questionId: question.id, value: `race-b-${stamp}` }],
      "direct",
      camLink.token,
    ),
  ]);
  const raceStatuses = [raceA, raceB]
    .map((result) => (result.ok ? 201 : result.status))
    .sort((a, b) => a - b);
  assert.deepEqual(raceStatuses, [201, 201]);
  assert.equal(raceA.ok, true);
  assert.equal(raceB.ok, true);
  if (!raceA.ok || !raceB.ok) {
    return;
  }
  assert.equal(raceA.responseId, raceB.responseId);
  const camResponseId = raceA.responseId;
  const raceAnswers = await db
    .select({ value: answers.value, responseId: answers.responseId })
    .from(answers)
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .where(eq(questions.surveyId, surveyId));
  const raceValues = raceAnswers.filter(
    (row) =>
      row.responseId === camResponseId &&
      (row.value.value === `race-a-${stamp}` || row.value.value === `race-b-${stamp}`),
  );
  assert.equal(raceValues.length, 1);
  const camRows = await db
    .select({ id: responses.id })
    .from(responses)
    .innerJoin(pulseLinks, eq(pulseLinks.responseId, responses.id))
    .where(eq(pulseLinks.token, camLink.token));
  assert.equal(camRows.length, 1);

  await setSurveyStatus({ token, status: "closed" });
  const whileClosed = await submitSurveyResponse(
    token,
    [{ questionId: question.id, value: `closed-${stamp}` }],
    "direct",
    camLink.token,
  );
  assert.equal(whileClosed.ok, false);
  if (!whileClosed.ok) {
    assert.equal(whileClosed.status, 404);
  }
  const closedStored = await db
    .select({ value: answers.value })
    .from(answers)
    .where(eq(answers.responseId, camResponseId));
  assert.equal(closedStored.length, 1);
  assert.equal(closedStored[0]?.value.value === `closed-${stamp}`, false);

  await setSurveyStatus({ token, status: "open" });
  const camLinks = await db
    .select({
      redeemed: pulseLinks.redeemed,
      surveyId: pulseLinks.surveyId,
      token: pulseLinks.token,
    })
    .from(pulseLinks)
    .where(eq(pulseLinks.employeeId, cam.id));
  const camOnFirst = camLinks.find((link) => link.surveyId === surveyId);
  assert.equal(camOnFirst?.redeemed, true);
  assert.equal(camOnFirst?.token, camLink.token);
  const afterReopen = await submitSurveyResponse(
    token,
    [{ questionId: question.id, value: `reopen-${stamp}` }],
    "direct",
    camLink.token,
  );
  assert.equal(afterReopen.ok, true);
  if (!afterReopen.ok) {
    return;
  }
  assert.equal(afterReopen.responseId, camResponseId);
  const reopened = await db
    .select({ value: answers.value })
    .from(answers)
    .where(eq(answers.responseId, camResponseId));
  assert.equal(reopened.length, 1);
  assert.deepEqual(reopened[0]?.value, { value: `reopen-${stamp}` });

  await db.update(pulseLinks).set({ responseId: null }).where(eq(pulseLinks.token, adaLink.token));
  const legacyView = await readPulseLink(token, adaLink.token);
  assert.equal(legacyView?.redeemed, true);
  assert.equal(legacyView?.editable, false);
  assert.deepEqual(legacyView?.answers, []);
  const legacy = await submitSurveyResponse(
    token,
    [{ questionId: question.id, value: `legacy-${stamp}` }],
    "direct",
    adaLink.token,
  );
  assert.equal(legacy.ok, false);
  if (!legacy.ok) {
    assert.equal(legacy.status, 409);
  }
  const legacyStored = await db
    .select({ value: answers.value })
    .from(answers)
    .where(eq(answers.responseId, first.responseId));
  assert.deepEqual(legacyStored[0]?.value, { value: changed });
  const afterLegacy = await db
    .select({ id: responses.id })
    .from(responses)
    .where(eq(responses.surveyId, surveyId));
  assert.equal(afterLegacy.length, 3);
});

async function insertTeam(name: string, slug: string): Promise<string> {
  const [team] = await db.insert(teams).values({ name, slug }).returning({ id: teams.id });
  assert.ok(team);
  teamIds.push(team.id);
  return team.id;
}

async function insertPerson(name: string, email: string, teamId: string): Promise<{ id: string; email: string }> {
  const [person] = await db
    .insert(employees)
    .values({ name, email, teamId })
    .returning({ id: employees.id });
  assert.ok(person);
  employeeIds.push(person.id);
  return { id: person.id, email };
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
