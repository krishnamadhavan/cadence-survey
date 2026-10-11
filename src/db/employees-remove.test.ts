import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "node:test";
import { listAuditEvents } from "@/db/audit-log";
import { db, pg } from "@/db/client";
import { EmployeeRemoveError, removeEmployee } from "@/db/employees";
import {
  admins,
  auditEvents,
  employees,
  managerAccounts,
  pulseLinks,
  responses,
  surveys,
  teamManagers,
  teams,
} from "@/db/schema";
import { redis } from "@/lib/redis";
import { listTeamsForAdmin } from "@/db/teams";

const stamp = Date.now();
const personEmail = `leave-${stamp}@cadence.test`;
const actorEmail = `remover-${stamp}@cadence.test`;
const token = `leave-${stamp}`;

test("removes someone who left without deleting their team's past responses", async (t) => {
  const ids: { teamId?: string; surveyId?: string; adminId?: string } = {};
  t.after(async () => {
    try {
      await db.delete(auditEvents).where(eq(auditEvents.actorEmail, actorEmail));
      if (ids.surveyId) {
        await db.delete(surveys).where(eq(surveys.id, ids.surveyId));
      }
      await db.delete(employees).where(eq(employees.email, personEmail));
      if (ids.teamId) {
        await db.delete(teams).where(eq(teams.id, ids.teamId));
      }
      if (ids.adminId) {
        await db.delete(admins).where(eq(admins.id, ids.adminId));
      }
    } finally {
      await pg.end({ timeout: 2 });
      await redis.quit();
    }
  });

  const [team] = await db
    .insert(teams)
    .values({ name: `QA Leave ${stamp}`, slug: `qa-leave-${stamp}` })
    .returning({ id: teams.id });
  assert.ok(team);
  ids.teamId = team.id;

  const [person] = await db
    .insert(employees)
    .values({ name: "Ada Leaving", email: personEmail, teamId: team.id })
    .returning({ id: employees.id });
  assert.ok(person);

  const [survey] = await db
    .insert(surveys)
    .values({ title: `Leave pulse ${stamp}`, publicToken: token })
    .returning({ id: surveys.id });
  assert.ok(survey);
  ids.surveyId = survey.id;

  const [response] = await db
    .insert(responses)
    .values({ surveyId: survey.id, teamId: team.id })
    .returning({ id: responses.id });
  assert.ok(response);

  await db.insert(pulseLinks).values({
    surveyId: survey.id,
    employeeId: person.id,
    token: `leave-link-${stamp}`,
  });
  await db.insert(teamManagers).values({ teamId: team.id, employeeId: person.id });
  await db.insert(managerAccounts).values({
    employeeId: person.id,
    passwordHash: "test-only-hash",
  });

  const [admin] = await db
    .insert(admins)
    .values({ email: actorEmail, passwordHash: "test-only-hash" })
    .returning({ id: admins.id });
  assert.ok(admin);
  ids.adminId = admin.id;

  const before = await listTeamsForAdmin();
  assert.equal(before.find((row) => row.id === team.id)?.employeeCount, 1);

  const removed = await removeEmployee({
    employeeId: person.id,
    actor: { id: admin.id, email: actorEmail },
  });
  assert.equal(removed.name, "Ada Leaving");
  assert.equal(removed.email, personEmail);
  assert.equal(removed.teamName, `QA Leave ${stamp}`);

  const [stillPerson] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, person.id));
  assert.equal(stillPerson, undefined);

  const [keptResponse] = await db
    .select({ teamId: responses.teamId })
    .from(responses)
    .where(eq(responses.id, response.id));
  assert.equal(keptResponse?.teamId, team.id);

  const [link] = await db
    .select({ id: pulseLinks.id })
    .from(pulseLinks)
    .where(eq(pulseLinks.employeeId, person.id));
  assert.equal(link, undefined);

  const [manager] = await db
    .select({ teamId: teamManagers.teamId })
    .from(teamManagers)
    .where(eq(teamManagers.teamId, team.id));
  assert.equal(manager, undefined);

  const [account] = await db
    .select({ employeeId: managerAccounts.employeeId })
    .from(managerAccounts)
    .where(eq(managerAccounts.employeeId, person.id));
  assert.equal(account, undefined);

  const after = await listTeamsForAdmin();
  assert.equal(after.find((row) => row.id === team.id)?.employeeCount, 0);
  assert.equal(after.find((row) => row.id === team.id)?.responseCount, 1);

  assert.ok(
    (await listAuditEvents()).some(
      (event) =>
        event.action === "employees.removed" &&
        event.actorEmail === actorEmail &&
        event.summary === `Removed Ada Leaving (${personEmail}) from QA Leave ${stamp}.`,
    ),
  );

  await assert.rejects(
    () => removeEmployee({ employeeId: person.id, actor: { id: admin.id, email: actorEmail } }),
    EmployeeRemoveError,
  );
});
