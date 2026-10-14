import { asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { recordAudit } from "@/db/audit-log";
import { db } from "@/db/client";
import { ensureLinksForOpenSurveys } from "@/db/pulse-links";
import { employees, teams } from "@/db/schema";
import { destroySessionsForManager } from "@/lib/session";
import {
  parseRole,
  parseTenureBand,
  tenureBandLabel,
  type TenureBand,
} from "@/lib/employee-attributes";
import { parseTeamOffice } from "@/lib/team-slug";
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
  office: string | null;
};

export type EmployeeImportResult = {
  created: number;
  updated: number;
  errors: EmployeeCsvError[];
};

export class EmployeeMoveError extends Error {}
export class EmployeeAttributeError extends Error {}
export class EmployeeRemoveError extends Error {}

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

export async function removeEmployee(input: {
  employeeId: string;
  actor?: { id: string; email: string };
}): Promise<{ name: string; email: string; teamName: string }> {
  const removed = await db.transaction(async (tx) => {
    const [person] = await tx
      .select({
        id: employees.id,
        name: employees.name,
        email: employees.email,
        teamName: teams.name,
      })
      .from(employees)
      .innerJoin(teams, eq(employees.teamId, teams.id))
      .where(eq(employees.id, input.employeeId))
      .limit(1)
      .for("update");
    if (!person) {
      throw new EmployeeRemoveError("That person is gone.");
    }
    await tx.delete(employees).where(eq(employees.id, person.id));
    if (input.actor) {
      await recordAudit(
        {
          actorId: input.actor.id,
          actorEmail: input.actor.email,
          action: "employees.removed",
          summary: `Removed ${person.name} (${person.email}) from ${person.teamName}.`,
        },
        tx,
      );
    }
    return person;
  });
  try {
    await destroySessionsForManager(removed.id);
  } catch {
    // The roster row is already gone, so the next request cannot stay signed in.
  }
  return { name: removed.name, email: removed.email, teamName: removed.teamName };
}

export async function updateEmployeeAttributes(input: {
  employeeId: string;
  role: string;
  tenureBand: string;
  office: string;
  actor?: { id: string; email: string };
}): Promise<{
  name: string;
  role: string | null;
  tenureBand: TenureBand | null;
  office: string | null;
}> {
  const parsedRole = parseRole(input.role);
  if (!parsedRole.ok) {
    throw new EmployeeAttributeError(parsedRole.error);
  }
  const parsedTenure = parseTenureBand(input.tenureBand);
  if (parsedTenure === "invalid") {
    throw new EmployeeAttributeError("Tenure must be <1yr, 1-3yr, or 3yr+.");
  }
  const parsedOffice = parseTeamOffice(input.office);
  if (!parsedOffice.ok) {
    throw new EmployeeAttributeError("Office must be 80 characters or fewer.");
  }

  return db.transaction(async (tx) => {
    const [person] = await tx
      .update(employees)
      .set({
        role: parsedRole.role,
        tenureBand: parsedTenure,
        office: parsedOffice.office,
      })
      .where(eq(employees.id, input.employeeId))
      .returning({ id: employees.id, name: employees.name });
    if (!person) {
      throw new EmployeeAttributeError("That person is gone.");
    }
    if (input.actor) {
      const roleLabel = parsedRole.role ?? "no role";
      const bandLabel = parsedTenure ? tenureBandLabel(parsedTenure) : "no tenure";
      const officeLabel = parsedOffice.office ?? "no office";
      await recordAudit(
        {
          actorId: input.actor.id,
          actorEmail: input.actor.email,
          action: "employees.attributes_set",
          summary: `Set ${person.name} to ${roleLabel}, ${bandLabel}, ${officeLabel}`,
        },
        tx,
      );
    }
    return {
      name: person.name,
      role: parsedRole.role,
      tenureBand: parsedTenure,
      office: parsedOffice.office,
    };
  });
}

const INSERT_CHUNK = 500;

function conflictSet(columns: EmployeeCsvColumns): {
  name: SQL;
  teamId: SQL;
  role?: SQL;
  tenureBand?: SQL;
  office?: SQL;
} {
  return {
    name: sql`excluded.name`,
    teamId: sql`excluded.team_id`,
    ...(columns.role ? { role: sql`excluded.role` } : {}),
    ...(columns.tenure ? { tenureBand: sql`excluded.tenure_band` } : {}),
    ...(columns.office ? { office: sql`excluded.office` } : {}),
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
      office: employees.office,
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
    office?: string | null;
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
      ...(parsed.columns.office ? { office: row.office } : {}),
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

  await ensureLinksForOpenSurveys();

  return { created, updated, errors };
}
