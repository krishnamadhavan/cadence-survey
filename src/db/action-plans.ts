import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actionPlans,
  surveys,
  type ActionPlanStatus,
} from "@/db/schema";
import { SUPPRESSED_TEAM_NAME, getSurveyResults } from "@/db/results";
import { followUpFor } from "@/lib/recommendations";

export class ActionPlanError extends Error {}
export class ActionPlanNotFoundError extends Error {}

export type ActionPlanItem = {
  id: string;
  surveyToken: string;
  surveyTitle: string;
  teamKey: string;
  teamName: string;
  followUp: string;
  status: ActionPlanStatus;
  createdAt: string;
  completedAt: string | null;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listActionPlans(): Promise<ActionPlanItem[]> {
  const rows = await db
    .select({
      id: actionPlans.id,
      surveyToken: surveys.publicToken,
      surveyTitle: surveys.title,
      teamKey: actionPlans.teamKey,
      teamName: actionPlans.teamName,
      followUp: actionPlans.followUp,
      status: actionPlans.status,
      createdAt: actionPlans.createdAt,
      completedAt: actionPlans.completedAt,
    })
    .from(actionPlans)
    .innerJoin(surveys, eq(actionPlans.surveyId, surveys.id));

  return rows
    .map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }))
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "open" ? -1 : 1;
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
}

export async function listOpenPlanKeys(): Promise<string[]> {
  const rows = await db
    .select({
      token: surveys.publicToken,
      teamKey: actionPlans.teamKey,
    })
    .from(actionPlans)
    .innerJoin(surveys, eq(actionPlans.surveyId, surveys.id))
    .where(eq(actionPlans.status, "open"));
  return rows.map((row) => `${row.token}:${row.teamKey}`);
}

export async function createActionPlan(input: {
  token: string;
  teamKey: string;
}): Promise<ActionPlanItem> {
  const teamKey = input.teamKey.trim();
  if (teamKey !== "unassigned" && !UUID.test(teamKey)) {
    throw new ActionPlanError("That team is not a current recommendation.");
  }

  const results = await getSurveyResults(input.token);
  if (!results || (results.survey.status !== "open" && results.survey.status !== "closed")) {
    throw new ActionPlanError("That pulse is not open for a follow-up.");
  }

  const team = results.teams.find(
    (row) =>
      (row.teamId ?? "unassigned") === teamKey &&
      row.teamName !== SUPPRESSED_TEAM_NAME,
  );
  const followUp = team ? followUpFor(team.health) : null;
  if (!team || !followUp || team.averageScore === null) {
    throw new ActionPlanError("That team is not a current recommendation.");
  }

  try {
    const [row] = await db
      .insert(actionPlans)
      .values({
        surveyId: results.survey.id,
        teamId: team.teamId,
        teamKey,
        teamName: team.teamName,
        followUp,
        status: "open",
      })
      .returning({ id: actionPlans.id });
    if (!row) {
      throw new ActionPlanError("Could not add that follow-up.");
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ActionPlanError("That follow-up is already on the plan.");
    }
    throw error;
  }

  const plans = await listActionPlans();
  const created = plans.find((plan) => plan.surveyToken === input.token && plan.teamKey === teamKey && plan.status === "open");
  if (!created) {
    throw new ActionPlanError("Could not add that follow-up.");
  }
  return created;
}

export async function setActionPlanStatus(input: {
  id: string;
  status: ActionPlanStatus;
}): Promise<void> {
  const completedAt = input.status === "done" ? new Date() : null;
  const [row] = await db
    .update(actionPlans)
    .set({ status: input.status, completedAt })
    .where(eq(actionPlans.id, input.id))
    .returning({ id: actionPlans.id });
  if (!row) {
    throw new ActionPlanNotFoundError("That plan is gone.");
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