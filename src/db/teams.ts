import { and, asc, count, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, responses, teams } from "@/db/schema";
import { parseTeamName, parseTeamSlug } from "@/lib/team-slug";

export type TeamListItem = {
  id: string;
  name: string;
  slug: string;
  employeeCount: number;
  responseCount: number;
};

export class TeamValidationError extends Error {}
export class TeamConflictError extends Error {}
export class TeamInUseError extends Error {}
export class TeamNotFoundError extends Error {}

export async function listTeamsForAdmin(): Promise<TeamListItem[]> {
  const [teamRows, employeeRows, responseRows] = await Promise.all([
    db
      .select({
        id: teams.id,
        name: teams.name,
        slug: teams.slug,
      })
      .from(teams)
      .orderBy(asc(teams.name)),
    db
      .select({
        teamId: employees.teamId,
        n: count(),
      })
      .from(employees)
      .groupBy(employees.teamId),
    db
      .select({
        teamId: responses.teamId,
        n: count(),
      })
      .from(responses)
      .where(isNotNull(responses.teamId))
      .groupBy(responses.teamId),
  ]);

  const employeesByTeam = new Map(
    employeeRows.map((row) => [row.teamId, Number(row.n)]),
  );
  const responsesByTeam = new Map(
    responseRows
      .filter((row) => row.teamId)
      .map((row) => [row.teamId as string, Number(row.n)]),
  );

  return teamRows.map((team) => ({
    ...team,
    employeeCount: employeesByTeam.get(team.id) ?? 0,
    responseCount: responsesByTeam.get(team.id) ?? 0,
  }));
}

export async function createTeam(input: {
  name: string;
  slug: string;
}): Promise<{ id: string; name: string; slug: string }> {
  const name = parseTeamName(input.name);
  const slug = parseTeamSlug(input.slug || input.name);
  if (!name) {
    throw new TeamValidationError("Name must be 1–80 characters.");
  }
  if (!slug) {
    throw new TeamValidationError("Slug needs letters or numbers.");
  }

  try {
    const [row] = await db.insert(teams).values({ name, slug }).returning({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
    });
    if (!row) {
      throw new Error("insert returned no team");
    }
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TeamConflictError("A team with that name or slug already exists.");
    }
    throw error;
  }
}

export async function updateTeam(input: {
  id: string;
  name: string;
  slug: string;
}): Promise<{ id: string; name: string; slug: string }> {
  const name = parseTeamName(input.name);
  const slug = parseTeamSlug(input.slug || input.name);
  if (!name) {
    throw new TeamValidationError("Name must be 1–80 characters.");
  }
  if (!slug) {
    throw new TeamValidationError("Slug needs letters or numbers.");
  }

  try {
    const [row] = await db
      .update(teams)
      .set({ name, slug })
      .where(eq(teams.id, input.id))
      .returning({
        id: teams.id,
        name: teams.name,
        slug: teams.slug,
      });
    if (!row) {
      throw new TeamNotFoundError("That team is gone.");
    }
    return row;
  } catch (error) {
    if (error instanceof TeamNotFoundError) {
      throw error;
    }
    if (isUniqueViolation(error)) {
      throw new TeamConflictError("A team with that name or slug already exists.");
    }
    throw error;
  }
}

export async function deleteTeam(id: string): Promise<void> {
  const [[employeeRow], [responseRow]] = await Promise.all([
    db
      .select({ n: count() })
      .from(employees)
      .where(eq(employees.teamId, id)),
    db
      .select({ n: count() })
      .from(responses)
      .where(and(eq(responses.teamId, id), isNotNull(responses.teamId))),
  ]);

  if (Number(employeeRow?.n ?? 0) > 0 || Number(responseRow?.n ?? 0) > 0) {
    throw new TeamInUseError(
      "Move people and wait out published responses before deleting this team.",
    );
  }

  const deleted = await db
    .delete(teams)
    .where(eq(teams.id, id))
    .returning({ id: teams.id });
  if (deleted.length === 0) {
    throw new TeamNotFoundError("That team is gone.");
  }
}

function isUniqueViolation(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      (current as { code: unknown }).code === "23505"
    ) {
      return true;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause: unknown }).cause
        : undefined;
  }
  return false;
}
