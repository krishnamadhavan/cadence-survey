import { asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { recordAudit } from "@/db/audit-log";
import { db } from "@/db/client";
import { employees, teams } from "@/db/schema";
import {
  parseRole,
  parseTenureBand,
  tenureBandLabel,
  type TenureBand,
} from "@/lib/employee-attributes";
import {
  matchTeamId,
  parseEmployeeCsv,
  type EmployeeCsvColumns,
  type EmployeeCsvError,
} from "@/lib/employee-csv";

export type EmployeeListItem = {
  id: string;
  name: string;
  email: string;
  teamId: string;
  teamName: string;
  role: string | null;
  tenureBand: TenureBand | null;
};

export type EmployeeImportResult = {
  created: number;
  updated: number;
  errors: EmployeeCsvError[];
};

export class EmployeeMoveError extends Error {}
export class EmployeeAttributeError extends Error {}

const MOVE_LIMIT = 500;

export async function reassignEmployees(input: {
  employeeIds: string[];
  teamId: string;
  actor?: { id: string; email: string };
}): Promise<{ moved: number; teamName: string }> {
  const ids = [...new Set(input.employeeIds)];
  if (ids.length === 0) {
    throw new EmployeeMoveError("Select at least one person.");
  }
  if (ids.length > MOVE_LIMIT) {
    throw new EmployeeMoveError(`Move at most ${MOVE_LIMIT} people at once.`);
  }

  return db.transaction(async (tx) => {
    const [team] = await tx
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.id, input.teamId))
      .limit(1);
    if (!team) {
      throw new EmployeeMoveError("That team is gone.");
    }
    const found = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.id, ids));
    if (found.length !== ids.length) {
      throw new EmployeeMoveError("Some of those people are gone. Refresh and try again.");
    }
    await tx
      .update(employees)
      .set({ teamId: team.id })
      .where(inArray(employees.id, ids));
    if (input.actor) {
      await recordAudit(
        {
          actorId: input.actor.id,
          actorEmail: input.actor.email,
          action: "employees.reassigned",
          summary: `Moved ${ids.length} ${ids.length === 1 ? "person" : "people"} to ${team.name}`,
        },
        tx,
      );
    }
    return { moved: ids.length, teamName: team.name };
  });
}

export async function updateEmployeeAttributes(input: {
  employeeId: string;
  role: string;
  tenureBand: string;
  actor?: { id: string; email: string };
}): Promise<{ name: string; role: string | null; tenureBand: TenureBand | null }> {
  const parsedRole = parseRole(input.role);
  if (!parsedRole.ok) {
    throw new EmployeeAttributeError(parsedRole.error);
  }
  const parsedTenure = parseTenureBand(input.tenureBand);
  if (parsedTenure === "invalid") {
    throw new EmployeeAttributeError("Tenure must be <1yr, 1-3yr, or 3yr+.");
  }

  return db.transaction(async (tx) => {
    const [person] = await tx
      .update(employees)
      .set({ role: parsedRole.role, tenureBand: parsedTenure })
      .where(eq(employees.id, input.employeeId))
      .returning({ id: employees.id, name: employees.name });
    if (!person) {
      throw new EmployeeAttributeError("That person is gone.");
    }
    if (input.actor) {
      const roleLabel = parsedRole.role ?? "no role";
      const bandLabel = parsedTenure ? tenureBandLabel(parsedTenure) : "no tenure";
      await recordAudit(
        {
          actorId: input.actor.id,
          actorEmail: input.actor.email,
          action: "employees.attributes_set",
          summary: `Set ${person.name} to ${roleLabel}, ${bandLabel}`,
        },
        tx,
      );
    }
    return { name: person.name, role: parsedRole.role, tenureBand: parsedTenure };
  });
}

const INSERT_CHUNK = 500;

function conflictSet(columns: EmployeeCsvColumns): {
  name: SQL;
  teamId: SQL;
  role?: SQL;
  tenureBand?: SQL;
} {
  return {
    name: sql`excluded.name`,
    teamId: sql`excluded.team_id`,
    ...(columns.role ? { role: sql`excluded.role` } : {}),
    ...(columns.tenure ? { tenureBand: sql`excluded.tenure_band` } : {}),
  };
}

export async function listEmployees(): Promise<EmployeeListItem[]> {
  return db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      teamId: employees.teamId,
      teamName: teams.name,
      role: employees.role,
      tenureBand: employees.tenureBand,
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
    name: string;
    email: string;
    teamId: string;
    role?: string | null;
    tenureBand?: TenureBand | null;
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
      name: row.name,
      email: row.email,
      teamId,
      ...(parsed.columns.role ? { role: row.role } : {}),
      ...(parsed.columns.tenure ? { tenureBand: row.tenureBand } : {}),
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
          set: conflictSet(parsed.columns),
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
