import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { listManagedTeams, type ManagedTeam } from "@/db/managers";
import { employees, managerAccounts } from "@/db/schema";
import {
  MANAGER_SESSION_COOKIE,
  SessionStoreUnavailable,
  readManagerSession,
} from "@/lib/session";

export type ManagerSessionUser = {
  id: string;
  email: string;
  name: string;
  teams: ManagedTeam[];
};

export async function getManagerSessionUser(): Promise<ManagerSessionUser | null> {
  try {
    const jar = await cookies();
    const session = await readManagerSession(jar.get(MANAGER_SESSION_COOKIE)?.value);
    if (!session) {
      return null;
    }
    const [manager] = await db
      .select({
        id: employees.id,
        email: employees.email,
        name: employees.name,
      })
      .from(employees)
      .innerJoin(managerAccounts, eq(managerAccounts.employeeId, employees.id))
      .where(eq(employees.id, session.employeeId))
      .limit(1);
    if (!manager) {
      return null;
    }
    const teams = await listManagedTeams(manager.id);
    if (teams.length === 0) {
      return null;
    }
    return { ...manager, teams };
  } catch (error) {
    if (error instanceof SessionStoreUnavailable) {
      return null;
    }
    throw error;
  }
}

export async function hasManagerSession(): Promise<boolean> {
  return (await getManagerSessionUser()) !== null;
}
