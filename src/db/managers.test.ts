import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { employees, teams } from "@/db/schema";
import { redis } from "@/lib/redis";
import {
  ManagerNotFoundError,
  ManagerValidationError,
  assignManager,
  listManagedTeams,
  listManagerAssignments,
  unassignManager,
} from "./managers";

const stamp = Date.now();
const slugA = `qa-mgr-a-${stamp}`;
const slugB = `qa-mgr-b-${stamp}`;
const emailA = `mgr-a-${stamp}@cadence.test`;
const emailB = `mgr-b-${stamp}@cadence.test`;
const emailC = `mgr-c-${stamp}@cadence.test`;

test("assign, replace, and unassign a team manager", async (t) => {
  const teamIds: string[] = [];
  t.after(async () => {
    await db.delete(employees).where(inArray(employees.email, [emailA, emailB, emailC]));
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await pg.end({ timeout: 2 });
    await redis.quit();
  });

  const teamA = await insertTeam("QA Managers A", slugA);
  const teamB = await insertTeam("QA Managers B", slugB);
  teamIds.push(teamA, teamB);
  const personA = await insertPerson("Avery Manager", emailA, teamA);
  const personB = await insertPerson("Blair Manager", emailB, teamB);

  await assignManager({ teamId: teamA, employeeId: personA });
  await assignManager({ teamId: teamB, employeeId: personA });
  await insertPerson("Casey Report", emailC, teamA);

  const led = await listManagedTeams(personA);
  assert.deepEqual(
    led.map((team) => team.name),
    ["QA Managers A", "QA Managers B"],
  );
  assert.deepEqual(
    led[0]?.people.map((person) => person.email),
    [emailC],
  );
  assert.deepEqual(
    led[1]?.people.map((person) => person.email),
    [emailB],
  );
  assert.equal(
    led.some((team) => team.people.some((person) => person.id === personA)),
    false,
  );

  let rows = await listManagerAssignments();
  const listedA = rows.find((row) => row.teamId === teamA);
  const listedB = rows.find((row) => row.teamId === teamB);
  assert.equal(listedA?.employeeName, "Avery Manager");
  assert.equal(listedA?.employeeEmail, emailA);
  assert.equal(listedA?.homeTeamName, "QA Managers A");
  assert.equal(listedB?.employeeId, personA);

  await assignManager({ teamId: teamA, employeeId: personB });
  rows = await listManagerAssignments();
  assert.equal(rows.find((row) => row.teamId === teamA)?.employeeId, personB);
  assert.equal(rows.find((row) => row.teamId === teamB)?.employeeId, personA);

  await unassignManager(teamA);
  rows = await listManagerAssignments();
  assert.equal(rows.find((row) => row.teamId === teamA)?.employeeId, null);

  await assert.rejects(() => unassignManager(teamA), ManagerValidationError);
  await assert.rejects(
    () => assignManager({ teamId: teamA, employeeId: "00000000-0000-4000-8000-000000000000" }),
    ManagerValidationError,
  );
  await assert.rejects(
    () =>
      assignManager({
        teamId: "00000000-0000-4000-8000-000000000000",
        employeeId: personA,
      }),
    ManagerNotFoundError,
  );
});

async function insertTeam(name: string, slug: string) {
  const [team] = await db.insert(teams).values({ name, slug }).returning({ id: teams.id });
  assert.ok(team);
  return team.id;
}

async function insertPerson(name: string, email: string, teamId: string) {
  const [person] = await db
    .insert(employees)
    .values({ name, email, teamId })
    .returning({ id: employees.id });
  assert.ok(person);
  return person.id;
}
