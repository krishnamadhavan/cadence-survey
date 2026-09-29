import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import { POST as managerLogin } from "@/app/api/manage/login/route";
import { createAdmin } from "@/db/admins";
import { db, pg } from "@/db/client";
import { setManagerPortalPassword } from "@/db/manager-accounts";
import {
  ManagerValidationError,
  assignManager,
  listManagerAssignments,
  unassignManager,
} from "@/db/managers";
import { admins, auditEvents, employees, managerAccounts, teams } from "@/db/schema";
import { verifyAdminCredentials } from "@/lib/auth";
import { verifyManagerCredentials } from "@/lib/manager-auth";
import { redis } from "@/lib/redis";
import {
  createManagerSession,
  destroySessionsForManager,
  readAdminSession,
  readManagerSession,
} from "@/lib/session";

const stamp = Date.now();
const email = `mgr-portal-${stamp}@cadence.test`;
const managerPassword = "manager-password-1";
const adminPassword = "admin-password-1";

test("a manager signs in with a portal password, and an admin password does not", async (t) => {
  const teamIds: string[] = [];
  let employeeId = "";
  t.after(async () => {
    if (employeeId) {
      await destroySessionsForManager(employeeId).catch(() => undefined);
    }
    await db.delete(auditEvents).where(eq(auditEvents.actorEmail, email));
    await db.delete(employees).where(eq(employees.email, email));
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await db.delete(admins).where(eq(admins.email, email));
    await pg.end({ timeout: 2 });
    await redis.quit();
  });

  const [team] = await db
    .insert(teams)
    .values({ name: `QA Portal ${stamp}`, slug: `qa-portal-${stamp}` })
    .returning({ id: teams.id });
  assert.ok(team);
  teamIds.push(team.id);
  const [person] = await db
    .insert(employees)
    .values({ name: "Portal Lead", email, teamId: team.id })
    .returning({ id: employees.id });
  assert.ok(person);
  employeeId = person.id;
  const actor = await createAdmin({ email, password: adminPassword });

  await assert.rejects(
    () =>
      setManagerPortalPassword({
        employeeId: person.id,
        password: managerPassword,
        actor,
      }),
    ManagerValidationError,
  );

  await assignManager({ teamId: team.id, employeeId: person.id });
  await assert.rejects(
    () =>
      setManagerPortalPassword({
        employeeId: person.id,
        password: "short",
        actor,
      }),
    ManagerValidationError,
  );

  await setManagerPortalPassword({
    employeeId: person.id,
    password: managerPassword,
    actor,
  });
  const listed = (await listManagerAssignments()).find((row) => row.teamId === team.id);
  assert.equal(listed?.hasPortal, true);
  const audits = await db
    .select({ action: auditEvents.action, summary: auditEvents.summary })
    .from(auditEvents)
    .where(eq(auditEvents.actorEmail, email));
  assert.ok(audits.some((row) => row.action === "manager.portal_password_set"));
  assert.ok(audits.every((row) => !row.summary.includes(managerPassword)));

  const manager = await verifyManagerCredentials(`  ${email.toUpperCase()} `, managerPassword);
  assert.equal(manager?.id, person.id);
  assert.equal(await verifyManagerCredentials(email, adminPassword), null);
  assert.equal((await verifyAdminCredentials(email, adminPassword))?.id, actor.id);
  assert.equal(await verifyAdminCredentials(email, managerPassword), null);

  const token = await createManagerSession(person.id);
  assert.equal((await readManagerSession(token))?.employeeId, person.id);
  assert.equal(await readAdminSession(token), null);

  await setManagerPortalPassword({
    employeeId: person.id,
    password: "manager-password-2",
    actor,
  });
  assert.equal(await readManagerSession(token), null);
  assert.equal(await verifyManagerCredentials(email, managerPassword), null);
  assert.equal((await verifyManagerCredentials(email, "manager-password-2"))?.id, person.id);

  const signedIn = await managerLogin(
    new Request("http://localhost/api/manage/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "manager-password-2" }),
    }),
  );
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.get("set-cookie") ?? "";
  assert.match(cookie, /cadence_manager=/);
  assert.equal(cookie.includes("cadence_session="), false);

  const adminAttempt = await adminLogin(
    new Request("http://localhost/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "manager-password-2" }),
    }),
  );
  assert.equal(adminAttempt.status, 401);

  const managerAttempt = await managerLogin(
    new Request("http://localhost/api/manage/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: adminPassword }),
    }),
  );
  assert.equal(managerAttempt.status, 401);

  const live = await createManagerSession(person.id);
  await unassignManager(team.id);
  assert.equal(await verifyManagerCredentials(email, "manager-password-2"), null);
  assert.equal(await readManagerSession(live), null);
  const [account] = await db
    .select({ employeeId: managerAccounts.employeeId })
    .from(managerAccounts)
    .where(eq(managerAccounts.employeeId, person.id))
    .limit(1);
  assert.equal(account?.employeeId, person.id);
  assert.equal(
    (await listManagerAssignments()).find((row) => row.teamId === team.id)?.employeeId,
    null,
  );
});
