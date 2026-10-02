import { and, asc, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { employees, managerAccounts, teamManagers, teams } from "@/db/schema";
import { destroySessionsForManager } from "@/lib/session";

export class ManagerNotFoundError extends Error {}
export class ManagerValidationError extends Error {}

export type ManagerAssignment = {
  teamId: string;
  teamName: string;
  employeeId: string | null;
  employeeName: string | null;
  employeeEmail: string | null;
  homeTeamName: string | null;
  hasPortal: boolean;
};

export async function listManagerAssignments(): Promise<ManagerAssignment[]> {
  const manager = alias(employees, "manager");
  const homeTeam = alias(teams, "home_team");
  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      employeeId: manager.id,
      employeeName: manager.name,
      employeeEmail: manager.email,
      homeTeamName: homeTeam.name,
      portalEmployeeId: managerAccounts.employeeId,
    })
    .from(teams)
    .leftJoin(teamManagers, eq(teamManagers.teamId, teams.id))
    .leftJoin(manager, eq(manager.id, teamManagers.employeeId))
    .leftJoin(homeTeam, eq(homeTeam.id, manager.teamId))
    .leftJoin(managerAccounts, eq(managerAccounts.employeeId, manager.id))
    .orderBy(asc(teams.name));
  return rows.map(({ portalEmployeeId, ...row }) => ({
    ...row,
    hasPortal: portalEmployeeId !== null,
  }));
}

export type ManagedTeamPerson = {
  id: string;
  name: string;
  email: string;
};

export type ManagedTeam = {
  id: string;
  name: string;
  people: ManagedTeamPerson[];
};

export async function listManagedTeams(employeeId: string): Promise<ManagedTeam[]> {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      personId: employees.id,
      personName: employees.name,
      personEmail: employees.email,
    })
    .from(teamManagers)
    .innerJoin(teams, eq(teams.id, teamManagers.teamId))
    .leftJoin(
      employees,
      and(eq(employees.teamId, teams.id), ne(employees.id, employeeId)),
    )
    .where(eq(teamManagers.employeeId, employeeId))
    .orderBy(asc(teams.name), asc(employees.name), asc(employees.email));

  const grouped = new Map<string, ManagedTeam>();
  for (const row of rows) {
    const team = grouped.get(row.id) ?? { id: row.id, name: row.name, people: [] };
    grouped.set(row.id, team);
    if (!row.personId || !row.personName || !row.personEmail) {
      continue;
    }
    if (team.people.some((person) => person.id === row.personId)) {
      continue;
    }
    team.people.push({
      id: row.personId,
      name: row.personName,
      email: row.personEmail,
    });
  }
  return [...grouped.values()];
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

  const previousId = await db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ employeeId: teamManagers.employeeId })
      .from(teamManagers)
      .where(eq(teamManagers.teamId, input.teamId))
      .for("update")
      .limit(1);
    await tx
      .insert(teamManagers)
      .values({ teamId: input.teamId, employeeId: input.employeeId })
      .onConflictDoUpdate({
        target: teamManagers.teamId,
        set: { employeeId: input.employeeId, assignedAt: new Date() },
      });
    return previous?.employeeId ?? null;
  });

  if (previousId && previousId !== input.employeeId) {
    await endManagerSessionsIfUnassigned(previousId);
  }
}

export async function unassignManager(teamId: string): Promise<void> {
  const removed = await db
    .delete(teamManagers)
    .where(eq(teamManagers.teamId, teamId))
    .returning({ employeeId: teamManagers.employeeId });
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
  const employeeId = removed[0]?.employeeId;
  if (employeeId) {
    await endManagerSessionsIfUnassigned(employeeId);
  }
}

async function endManagerSessionsIfUnassigned(employeeId: string): Promise<void> {
  const [still] = await db
    .select({ teamId: teamManagers.teamId })
    .from(teamManagers)
    .where(eq(teamManagers.employeeId, employeeId))
    .limit(1);
  if (still) {
    return;
  }
  try {
    await destroySessionsForManager(employeeId);
  } catch {
    // The assignment is already gone, so the next request cannot stay signed in.
  }
}
