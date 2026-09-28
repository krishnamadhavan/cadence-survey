import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm";
import { recordAudit } from "@/db/audit-log";
import { db } from "@/db/client";
import { actionPlans, employees, responses, teams } from "@/db/schema";
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

export async function mergeTeams(input: {
  sourceId: string;
  targetId: string;
  actor?: { id: string; email: string };
}): Promise<{ moved: number; sourceName: string; targetName: string }> {
  if (input.sourceId === input.targetId) {
    throw new TeamValidationError("Pick a different team to merge into.");
  }

  return db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(inArray(teams.id, [input.sourceId, input.targetId]))
      .for("update");
    const source = locked.find((team) => team.id === input.sourceId);
    const target = locked.find((team) => team.id === input.targetId);
    if (!source || !target) {
      throw new TeamNotFoundError("That team is gone.");
    }

    const moved = await tx
      .update(employees)
      .set({ teamId: target.id })
      .where(eq(employees.teamId, source.id))
      .returning({ id: employees.id });
    await tx
      .update(responses)
      .set({ teamId: target.id })
      .where(eq(responses.teamId, source.id));

    const plans = await tx
      .select({
        id: actionPlans.id,
        surveyId: actionPlans.surveyId,
        status: actionPlans.status,
      })
      .from(actionPlans)
      .where(eq(actionPlans.teamId, source.id));
    for (const plan of plans) {
      if (plan.status === "open") {
        const [clash] = await tx
          .select({ id: actionPlans.id })
          .from(actionPlans)
          .where(
            and(
              eq(actionPlans.surveyId, plan.surveyId),
              eq(actionPlans.teamKey, target.id),
              eq(actionPlans.status, "open"),
            ),
          )
          .limit(1);
        if (clash) {
          await tx.delete(actionPlans).where(eq(actionPlans.id, plan.id));
          continue;
        }
      }
      await tx
        .update(actionPlans)
        .set({ teamId: target.id, teamKey: target.id, teamName: target.name })
        .where(eq(actionPlans.id, plan.id));
    }

    const deleted = await tx
      .delete(teams)
      .where(eq(teams.id, source.id))
      .returning({ id: teams.id });
    if (deleted.length === 0) {
      throw new TeamNotFoundError("That team is gone.");
    }

    if (input.actor) {
      await recordAudit(
        {
          actorId: input.actor.id,
          actorEmail: input.actor.email,
          action: "team.merged",
          summary: `Merged ${source.name} into ${target.name}. Moved ${moved.length} ${moved.length === 1 ? "person" : "people"}.`,
        },
        tx,
      );
    }

    return { moved: moved.length, sourceName: source.name, targetName: target.name };
  });
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
