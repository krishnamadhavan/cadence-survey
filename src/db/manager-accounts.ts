import { eq } from "drizzle-orm";
import { recordAudit } from "@/db/audit-log";
import { db } from "@/db/client";
import { ManagerNotFoundError, ManagerValidationError } from "@/db/managers";
import { employees, managerAccounts, teamManagers } from "@/db/schema";
import { hashAdminPassword } from "@/lib/password";
import { destroySessionsForManager } from "@/lib/session";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

export async function setManagerPortalPassword(input: {
  employeeId: string;
  password: string;
  actor: { id: string; email: string };
}): Promise<{ name: string; email: string }> {
  if (input.password.length < PASSWORD_MIN || input.password.length > PASSWORD_MAX) {
    throw new ManagerValidationError("Password must be 8–200 characters.");
  }
  const passwordHash = await hashAdminPassword(input.password);
  const person = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: employees.id,
        name: employees.name,
        email: employees.email,
      })
      .from(employees)
      .where(eq(employees.id, input.employeeId))
      .for("update")
      .limit(1);
    if (!row) {
      throw new ManagerNotFoundError("That person is gone.");
    }
    const assignments = await tx
      .select({ teamId: teamManagers.teamId })
      .from(teamManagers)
      .where(eq(teamManagers.employeeId, row.id))
      .for("update");
    if (assignments.length === 0) {
      throw new ManagerValidationError("That person is not a manager.");
    }
    await tx
      .insert(managerAccounts)
      .values({ employeeId: row.id, passwordHash })
      .onConflictDoUpdate({
        target: managerAccounts.employeeId,
        set: { passwordHash },
      });
    await recordAudit(
      {
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        action: "manager.portal_password_set",
        summary: `Set the manager portal password for ${row.name} (${row.email})`,
      },
      tx,
    );
    return row;
  });
  try {
    await destroySessionsForManager(person.id);
  } catch {
    throw new ManagerValidationError(
      "Password saved, but old sign-ins could not be ended. Is Redis running?",
    );
  }
  return { name: person.name, email: person.email };
}
