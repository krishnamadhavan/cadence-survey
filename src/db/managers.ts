import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { employees, teamManagers, teams } from "@/db/schema";

export class ManagerNotFoundError extends Error {}
export class ManagerValidationError extends Error {}

export type ManagerAssignment = {
  teamId: string;
  teamName: string;
  employeeId: string | null;
  employeeName: string | null;
  employeeEmail: string | null;
  homeTeamName: string | null;
};

export async function listManagerAssignments(): Promise<ManagerAssignment[]> {
  const manager = alias(employees, "manager");
  const homeTeam = alias(teams, "home_team");
  return db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      employeeId: manager.id,
      employeeName: manager.name,
      employeeEmail: manager.email,
      homeTeamName: homeTeam.name,
    })
    .from(teams)
    .leftJoin(teamManagers, eq(teamManagers.teamId, teams.id))
    .leftJoin(manager, eq(manager.id, teamManagers.employeeId))
    .leftJoin(homeTeam, eq(homeTeam.id, manager.teamId))
    .orderBy(asc(teams.name));
}

export async function assignManager(input: {
  teamId: string;
  employeeId: string;
}): Promise<void> {
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.id, input.teamId))
    .limit(1);
  if (!team) {
    throw new ManagerNotFoundError("That team is gone.");
  }
  const [person] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);
  if (!person) {
    throw new ManagerValidationError("Pick someone from the roster.");
  }

  await db
    .insert(teamManagers)
    .values({ teamId: input.teamId, employeeId: input.employeeId })
    .onConflictDoUpdate({
      target: teamManagers.teamId,
      set: { employeeId: input.employeeId, assignedAt: new Date() },
    });
}

export async function unassignManager(teamId: string): Promise<void> {
  const removed = await db
    .delete(teamManagers)
    .where(eq(teamManagers.teamId, teamId))
    .returning({ teamId: teamManagers.teamId });
  if (removed.length === 0) {
    const [team] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    if (!team) {
      throw new ManagerNotFoundError("That team is gone.");
    }
    throw new ManagerValidationError("That team has no manager.");
  }
}
