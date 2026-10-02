import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, managerAccounts, teamManagers } from "@/db/schema";
import { normalizeEmail } from "@/lib/email";
import { matchAdminPassword } from "@/lib/password";

export async function verifyManagerCredentials(
  email: string,
  password: string,
): Promise<{ id: string; email: string; name: string } | null> {
  const normalized = normalizeEmail(email);
  if (!normalized || !password) {
    await matchAdminPassword(password, undefined);
    return null;
  }

  const [manager] = await db
    .select({
      id: employees.id,
      email: employees.email,
      name: employees.name,
      passwordHash: managerAccounts.passwordHash,
    })
    .from(employees)
    .innerJoin(managerAccounts, eq(managerAccounts.employeeId, employees.id))
    .innerJoin(teamManagers, eq(teamManagers.employeeId, employees.id))
    .where(sql`lower(${employees.email}) = ${normalized}`)
    .limit(1);

  const ok = await matchAdminPassword(password, manager?.passwordHash);
  if (!manager || !ok) {
    return null;
  }

  return { id: manager.id, email: manager.email, name: manager.name };
}
