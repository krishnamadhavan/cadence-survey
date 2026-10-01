import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { employees } from "@/db/schema";
import {
  EmployeeAttributeError,
  importEmployeesFromCsv,
  updateEmployeeAttributes,
} from "./employees";

const stamp = Date.now();
const email = `import-${stamp}@cadence.test`;

test("importEmployeesFromCsv skips unknown teams and upserts by email", async (t) => {
  t.after(async () => {
    await db.delete(employees).where(eq(employees.email, email));
    await pg.end({ timeout: 2 });
  });

  const first = await importEmployeesFromCsv(
    [
      "name,email,team",
      `Ada Lovelace,${email},Engineering`,
      `Ghost,${stamp}-ghost@cadence.test,Sales`,
    ].join("\n"),
  );

  assert.equal(first.created, 1);
  assert.equal(first.updated, 0);
  assert.equal(first.errors.length, 1);
  assert.match(first.errors[0]?.message ?? "", /Unknown team: Sales/);

  const second = await importEmployeesFromCsv(
    `name,email,team\nAda Updated,${email},product\n`,
  );
  assert.equal(second.created, 0);
  assert.equal(second.updated, 1);

  const [renamed] = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.email, email))
    .limit(1);
  assert.equal(renamed?.name, "Ada Updated");
  assert.ok(renamed);

  const withAttrs = await importEmployeesFromCsv(
    `name,email,team,role,tenure\nAda Lovelace,${email},Engineering,  Engineer  ,<1yr\n`,
  );
  assert.equal(withAttrs.updated, 1);
  assert.equal(withAttrs.errors.length, 0);

  const kept = await importEmployeesFromCsv(
    `name,email,team\nAda Kept,${email},Engineering\n`,
  );
  assert.equal(kept.updated, 1);
  const [keptRow] = await db
    .select({ name: employees.name, role: employees.role, tenureBand: employees.tenureBand })
    .from(employees)
    .where(eq(employees.id, renamed.id))
    .limit(1);
  assert.equal(keptRow?.name, "Ada Kept");
  assert.equal(keptRow?.role, "Engineer");
  assert.equal(keptRow?.tenureBand, "lt_1");

  const cleared = await importEmployeesFromCsv(
    `name,email,team,role,tenure\nAda Kept,${email},Engineering,,\n`,
  );
  assert.equal(cleared.updated, 1);
  const [clearedRow] = await db
    .select({ role: employees.role, tenureBand: employees.tenureBand })
    .from(employees)
    .where(eq(employees.id, renamed.id))
    .limit(1);
  assert.equal(clearedRow?.role, null);
  assert.equal(clearedRow?.tenureBand, null);

  const rejected = await importEmployeesFromCsv(
    `name,email,team,role,tenure\nAda Rejected,${email},Engineering,Nope,forever\n`,
  );
  assert.equal(rejected.updated, 0);
  assert.match(rejected.errors[0]?.message ?? "", /Tenure must be/);
  const [unchanged] = await db
    .select({ name: employees.name, role: employees.role })
    .from(employees)
    .where(eq(employees.id, renamed.id))
    .limit(1);
  assert.equal(unchanged?.name, "Ada Kept");
  assert.equal(unchanged?.role, null);

  const set = await updateEmployeeAttributes({
    employeeId: renamed.id,
    role: "  Product designer  ",
    tenureBand: "3yr+",
  });
  assert.equal(set.role, "Product designer");
  assert.equal(set.tenureBand, "gte_3");

  await assert.rejects(
    () =>
      updateEmployeeAttributes({
        employeeId: renamed.id,
        role: "x".repeat(81),
        tenureBand: "",
      }),
    EmployeeAttributeError,
  );
  const [still] = await db
    .select({ role: employees.role, tenureBand: employees.tenureBand })
    .from(employees)
    .where(eq(employees.id, renamed.id))
    .limit(1);
  assert.equal(still?.role, "Product designer");
  assert.equal(still?.tenureBand, "gte_3");

  await assert.rejects(
    () =>
      updateEmployeeAttributes({
        employeeId: "00000000-0000-4000-8000-000000000000",
        role: "",
        tenureBand: "",
      }),
    EmployeeAttributeError,
  );
});
