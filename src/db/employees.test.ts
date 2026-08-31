import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { employees } from "@/db/schema";
import { importEmployeesFromCsv } from "./employees";

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

  const [row] = await db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.email, email))
    .limit(1);
  assert.equal(row?.name, "Ada Updated");
});
