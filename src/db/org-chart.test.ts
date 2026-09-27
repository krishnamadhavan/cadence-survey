import "./../lib/load-env";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { employees, teamManagers, teams } from "@/db/schema";
import { getOrgChart } from "./org-chart";

const stamp = Date.now();
const emailLead = `org-lead-${stamp}@cadence.test`;
const emailReport = `org-report-${stamp}@cadence.test`;
const emailOther = `org-other-${stamp}@cadence.test`;

test("groups each manager with the team they run and the people on it", async (t) => {
  const teamIds: string[] = [];
  t.after(async () => {
    await db.delete(employees).where(
      inArray(employees.email, [
        emailLead,
        emailReport,
        emailOther,
        `a-twin-${stamp}@cadence.test`,
        `z-twin-${stamp}@cadence.test`,
      ]),
    );
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await pg.end({ timeout: 2 });
  });

  const design = await insertTeam(`QA Org Design ${stamp}`);
  const ops = await insertTeam(`QA Org Ops ${stamp}`);
  teamIds.push(design, ops);
  const lead = await insertPerson("Casey Lead", emailLead, design);
  const report = await insertPerson("Devon Report", emailReport, design);
  const twinLater = await insertPerson("Devon Report", `z-twin-${stamp}@cadence.test`, design);
  const twinEarlier = await insertPerson("Devon Report", `a-twin-${stamp}@cadence.test`, design);
  await insertPerson("Eden Other", emailOther, ops);
  await db.insert(teamManagers).values({ teamId: design, employeeId: lead });

  const chart = await getOrgChart();
  const casey = chart.find((group) => group.managerId === lead);
  assert.ok(casey);
  assert.equal(casey?.managerEmail, emailLead);
  assert.deepEqual(
    casey?.teams.map((team) => team.teamName),
    [`QA Org Design ${stamp}`],
  );
  assert.deepEqual(
    casey?.teams[0]?.people.map((person) => person.id),
    [twinEarlier, report, twinLater],
  );

  const open = chart.find((group) => group.managerId === null);
  assert.ok(open?.teams.some((team) => team.teamId === ops));
  assert.equal(
    chart.findIndex((group) => group.managerId === null),
    chart.length - 1,
  );
});

async function insertTeam(name: string) {
  const [team] = await db
    .insert(teams)
    .values({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") })
    .returning({ id: teams.id });
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
