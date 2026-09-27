import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { employees, teamManagers, teams } from "@/db/schema";

export type OrgPerson = {
  id: string;
  name: string;
  email: string;
};

export type OrgTeam = {
  teamId: string;
  teamName: string;
  people: OrgPerson[];
};

export type OrgGroup = {
  managerId: string | null;
  managerName: string;
  managerEmail: string | null;
  teams: OrgTeam[];
};

export async function getOrgChart(): Promise<OrgGroup[]> {
  const manager = alias(employees, "manager");
  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      managerId: manager.id,
      managerName: manager.name,
      managerEmail: manager.email,
      personId: employees.id,
      personName: employees.name,
      personEmail: employees.email,
    })
    .from(teams)
    .leftJoin(teamManagers, eq(teamManagers.teamId, teams.id))
    .leftJoin(manager, eq(manager.id, teamManagers.employeeId))
    .leftJoin(employees, eq(employees.teamId, teams.id))
    .orderBy(asc(teams.name), asc(employees.name), asc(employees.email));

  const groups = new Map<string, OrgGroup>();
  for (const row of rows) {
    const key = row.managerId ?? "unassigned";
    const group = groups.get(key) ?? {
      managerId: row.managerId,
      managerName: row.managerName ?? "No manager",
      managerEmail: row.managerEmail,
      teams: [],
    };
    groups.set(key, group);

    let team = group.teams.find((item) => item.teamId === row.teamId);
    if (!team) {
      team = { teamId: row.teamId, teamName: row.teamName, people: [] };
      group.teams.push(team);
    }
    if (!row.personId || !row.personName || !row.personEmail) {
      continue;
    }
    if (row.personId === row.managerId) {
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

  return [...groups.values()].sort((left, right) => {
    if (left.managerId === null) {
      return 1;
    }
    if (right.managerId === null) {
      return -1;
    }
    return left.managerName.localeCompare(right.managerName);
  });
}
