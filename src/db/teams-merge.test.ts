import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { listAuditEvents } from "@/db/audit-log";
import { db, pg } from "@/db/client";
import {
  actionPlans,
  admins,
  answers,
  auditEvents,
  employees,
  questions,
  responses,
  surveys,
  teams,
} from "@/db/schema";
import { TeamValidationError, mergeTeams } from "@/db/teams";

const stamp = Date.now();
const emails = [`merge-a-${stamp}@cadence.test`, `merge-b-${stamp}@cadence.test`];
const actorEmail = `merger-${stamp}@cadence.test`;

test("folds one team into another, moves its people and responses, and removes it", async (t) => {
  const teamIds: string[] = [];
  const surveyIds: string[] = [];
  t.after(async () => {
    await db.delete(auditEvents).where(eq(auditEvents.actorEmail, actorEmail));
    await db.delete(admins).where(eq(admins.email, actorEmail));
    await db.delete(employees).where(inArray(employees.email, emails));
    if (surveyIds.length > 0) {
      await db.delete(surveys).where(inArray(surveys.id, surveyIds));
    }
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await pg.end({ timeout: 2 });
  });

  const source = await insertTeam(`QA Merge From ${stamp}`);
  const target = await insertTeam(`QA Merge To ${stamp}`);
  teamIds.push(source, target);
  await insertPerson(emails[0]!, source);
  await insertPerson(emails[1]!, source);

  const [survey] = await db
    .insert(surveys)
    .values({
      title: `QA merge ${stamp}`,
      publicToken: `qa-merge-${stamp}`,
      status: "open",
    })
    .returning({ id: surveys.id });
  assert.ok(survey);
  surveyIds.push(survey.id);
  const [question] = await db
    .insert(questions)
    .values({
      surveyId: survey.id,
      prompt: "How was it?",
      type: "scale",
      options: { min: 1, max: 5 },
      position: 1,
      required: true,
    })
    .returning({ id: questions.id });
  assert.ok(question);
  const [response] = await db
    .insert(responses)
    .values({ surveyId: survey.id, teamId: source })
    .returning({ id: responses.id });
  assert.ok(response);
  await db.insert(answers).values({
    responseId: response.id,
    questionId: question.id,
    value: { value: 2 },
  });
  await db.insert(actionPlans).values({
    surveyId: survey.id,
    teamId: source,
    teamKey: source,
    teamName: `QA Merge From ${stamp}`,
    followUp: "Meet this week.",
    status: "open",
  });
  await db.insert(actionPlans).values({
    surveyId: survey.id,
    teamId: target,
    teamKey: target,
    teamName: `QA Merge To ${stamp}`,
    followUp: "Check in.",
    status: "open",
  });

  const [admin] = await db
    .insert(admins)
    .values({ email: actorEmail, passwordHash: "test-only-hash" })
    .returning({ id: admins.id });
  assert.ok(admin);
  const result = await mergeTeams({
    sourceId: source,
    targetId: target,
    actor: { id: admin.id, email: actorEmail },
  });
  assert.equal(result.moved, 2);

  const people = await db
    .select({ teamId: employees.teamId })
    .from(employees)
    .where(inArray(employees.email, emails));
  assert.ok(people.every((person) => person.teamId === target));

  const [keptResponse] = await db
    .select({ teamId: responses.teamId })
    .from(responses)
    .where(eq(responses.id, response.id))
    .limit(1);
  assert.equal(keptResponse?.teamId, target);

  const plans = await db
    .select({
      teamId: actionPlans.teamId,
      followUp: actionPlans.followUp,
      status: actionPlans.status,
      completedAt: actionPlans.completedAt,
    })
    .from(actionPlans)
    .where(eq(actionPlans.surveyId, survey.id));
  const keptOpen = plans.find((plan) => plan.followUp === "Check in.");
  const keptSource = plans.find((plan) => plan.followUp === "Meet this week.");
  assert.equal(plans.length, 2);
  assert.equal(keptOpen?.status, "open");
  assert.equal(keptOpen?.teamId, target);
  assert.equal(keptSource?.status, "done");
  assert.equal(keptSource?.teamId, target);
  assert.ok(keptSource?.completedAt);

  const leftover = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.id, source));
  assert.equal(leftover.length, 0);
  teamIds.splice(teamIds.indexOf(source), 1);

  assert.ok(
    (await listAuditEvents()).some((event) =>
      event.summary.startsWith(`Merged QA Merge From ${stamp} into QA Merge To ${stamp}`),
    ),
  );

  await assert.rejects(
    () => mergeTeams({ sourceId: target, targetId: target }),
    TeamValidationError,
  );
  const still = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, target));
  assert.equal(still.length, 1);
});

async function insertTeam(name: string) {
  const [team] = await db
    .insert(teams)
    .values({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") })
    .returning({ id: teams.id });
  assert.ok(team);
  return team.id;
}

async function insertPerson(email: string, teamId: string) {
  const [person] = await db
    .insert(employees)
    .values({ name: email, email, teamId })
    .returning({ id: employees.id });
  assert.ok(person);
  return person.id;
}
