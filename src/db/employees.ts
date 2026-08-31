import { asc, eq, sql } from "drizzle-orm";
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

const INSERT_CHUNK = 500;

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

  const ready: { name: string; email: string; teamId: string }[] = [];

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
      name: row.name,
      email: row.email,
      teamId,
    });
  }

  if (ready.length === 0) {
    return { created: 0, updated: 0, errors };
  }

  let created = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (let i = 0; i < ready.length; i += INSERT_CHUNK) {
      const chunk = ready.slice(i, i + INSERT_CHUNK);
      const written = await tx
        .insert(employees)
        .values(chunk)
        .onConflictDoUpdate({
          target: employees.email,
          set: {
            name: sql`excluded.name`,
            teamId: sql`excluded.team_id`,
          },
        })
        .returning({
          inserted: sql<boolean>`xmax = 0`,
        });

      for (const row of written) {
        if (row.inserted) {
          created += 1;
        } else {
          updated += 1;
        }
      }
    }
  });

  return { created, updated, errors };
}
