import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { listAuditEvents } from "@/db/audit-log";
import { db, pg } from "@/db/client";
import { EmployeeMoveError, reassignEmployees } from "@/db/employees";
import { admins, auditEvents, employees, teams } from "@/db/schema";

const stamp = Date.now();
const emails = [`move-a-${stamp}@cadence.test`, `move-b-${stamp}@cadence.test`];

test("moves several people to one team or moves none", async (t) => {
  const teamIds: string[] = [];
  t.after(async () => {
    await db.delete(auditEvents).where(eq(auditEvents.actorEmail, `mover-${stamp}@cadence.test`));
    await db.delete(employees).where(inArray(employees.email, emails));
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await pg.end({ timeout: 2 });
  });

  const from = await insertTeam(`QA Move From ${stamp}`);
  const to = await insertTeam(`QA Move To ${stamp}`);
  teamIds.push(from, to);
  const first = await insertPerson(emails[0]!, from);
  const second = await insertPerson(emails[1]!, from);
  const [admin] = await db.select({ id: admins.id }).from(admins).limit(1);
  assert.ok(admin);

  const moved = await reassignEmployees({
    employeeIds: [first, second, first],
    teamId: to,
    actor: { id: admin.id, email: `mover-${stamp}@cadence.test` },
  });
  assert.equal(moved.moved, 2);
  assert.equal(moved.teamName, `QA Move To ${stamp}`);

  const rows = await db
    .select({ teamId: employees.teamId })
    .from(employees)
    .where(inArray(employees.email, emails));
  assert.ok(rows.every((row) => row.teamId === to));
  assert.ok(
    (await listAuditEvents()).some(
      (event) => event.summary === `Moved 2 people to QA Move To ${stamp}`,
    ),
  );

  await assert.rejects(
    () =>
      reassignEmployees({
        employeeIds: [first],
        teamId: "00000000-0000-4000-8000-000000000000",
      }),
    EmployeeMoveError,
  );
  await assert.rejects(
    () =>
      reassignEmployees({
        employeeIds: ["00000000-0000-4000-8000-000000000000", second],
        teamId: from,
      }),
    EmployeeMoveError,
  );
  const still = await db
    .select({ teamId: employees.teamId })
    .from(employees)
    .where(eq(employees.id, second));
  assert.equal(still[0]?.teamId, to);
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
