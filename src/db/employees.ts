import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, teams } from "@/db/schema";
import {
  matchTeamId,
  parseEmployeeCsv,
  type EmployeeCsvError,
} from "@/lib/employee-csv";

export type EmployeeListItem = {
  id: string;
  name: string;
  email: string;
  teamId: string;
  teamName: string;
};

export type EmployeeImportResult = {
  created: number;
  updated: number;
  errors: EmployeeCsvError[];
};

export async function listEmployees(): Promise<EmployeeListItem[]> {
  return db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      teamId: employees.teamId,
      teamName: teams.name,
    })
    .from(employees)
    .innerJoin(teams, eq(employees.teamId, teams.id))
    .orderBy(asc(employees.name));
}

export async function importEmployeesFromCsv(
  csvText: string,
): Promise<EmployeeImportResult> {
  const parsed = parseEmployeeCsv(csvText);
  const errors = [...parsed.errors];

  if (parsed.rows.length === 0) {
    return { created: 0, updated: 0, errors };
  }

  const teamRows = await db
    .select({ id: teams.id, name: teams.name, slug: teams.slug })
    .from(teams);

  const ready: {
    line: number;
    name: string;
    email: string;
    teamId: string;
  }[] = [];

  for (const row of parsed.rows) {
    const teamId = matchTeamId(row.team, teamRows);
    if (!teamId) {
      errors.push({
        line: row.line,
        message: `Unknown team: ${row.team}`,
      });
      continue;
    }
    ready.push({
      line: row.line,
      name: row.name,
      email: row.email,
      teamId,
    });
  }

  if (ready.length === 0) {
    return { created: 0, updated: 0, errors };
  }

  const emails = ready.map((row) => row.email);
  const existing = await db
    .select({ email: employees.email })
    .from(employees)
    .where(inArray(employees.email, emails));
  const existingEmails = new Set(existing.map((row) => row.email));

  const toCreate = ready.filter((row) => !existingEmails.has(row.email));
  const toUpdate = ready.filter((row) => existingEmails.has(row.email));

  if (toCreate.length > 0) {
    await db.insert(employees).values(
      toCreate.map((row) => ({
        name: row.name,
        email: row.email,
        teamId: row.teamId,
      })),
    );
  }

  for (const row of toUpdate) {
    await db
      .update(employees)
      .set({ name: row.name, teamId: row.teamId })
      .where(eq(employees.email, row.email));
  }

  return {
    created: toCreate.length,
    updated: toUpdate.length,
    errors,
  };
}
