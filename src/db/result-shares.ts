import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { getSurveyResults, type SurveyResults, type TeamHealth } from "@/db/results";
import { surveys } from "@/db/schema";
import type { QuestionType } from "@/db/schema";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";
import { getAnonymityFloor } from "@/db/settings";

export class ResultShareError extends Error {
  constructor(readonly reason: "missing" | "not_closed") {
    super(reason);
  }
}

export type PublicTeamScore = {
  teamName: string;
  responseCount: number;
  averageScore: number | null;
  health: TeamHealth;
};

export type PublicQuestionScore = {
  position: number;
  prompt: string;
  type: QuestionType;
  scale: {
    min: number;
    max: number;
    average: number | null;
    count: number;
    byTeam: { teamName: string; average: number | null; count: number }[];
  } | null;
  choice: {
    options: string[];
    byTeam: { teamName: string; count: number; counts: Record<string, number> }[];
  } | null;
  writtenCount: number | null;
};

export type PublicPulseReport = {
  title: string;
  responseCount: number;
  averageScore: number | null;
  anonymityFloor: number;
  teams: PublicTeamScore[];
  questions: PublicQuestionScore[];
};

export type SharedPulseReport =
  | { state: "missing" }
  | { state: "unavailable" }
  | { state: "ready"; report: PublicPulseReport };

// One link per pulse. A first call stores a new token; a later call returns it.
// The survey row is locked so two admins cannot mint two links. A token
// collision retries in a new transaction; Postgres aborts the failed one.
export async function ensureResultShare(publicToken: string): Promise<{ token: string }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await mintResultShare(publicToken);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 2) {
        throw error;
      }
    }
  }
  throw new ResultShareError("not_closed");
}

async function mintResultShare(publicToken: string): Promise<{ token: string }> {
  return db.transaction(async (tx) => {
    const [survey] = await tx
      .select({
        id: surveys.id,
        publicToken: surveys.publicToken,
        status: surveys.status,
        resultsToken: surveys.resultsToken,
      })
      .from(surveys)
      .where(eq(surveys.publicToken, publicToken))
      .for("update")
      .limit(1);
    if (!survey) {
      throw new ResultShareError("missing");
    }
    if (survey.status !== "closed") {
      throw new ResultShareError("not_closed");
    }
    if (survey.resultsToken) {
      return { token: survey.resultsToken };
    }

    let token = randomBytes(16).toString("hex");
    if (token === survey.publicToken) {
      token = randomBytes(16).toString("hex");
    }
    const [row] = await tx
      .update(surveys)
      .set({ resultsToken: token })
      .where(
        and(
          eq(surveys.id, survey.id),
          eq(surveys.status, "closed"),
          isNull(surveys.resultsToken),
        ),
      )
      .returning({ token: surveys.resultsToken });
    if (row?.token) {
      return { token: row.token };
    }

    const [again] = await tx
      .select({
        status: surveys.status,
        resultsToken: surveys.resultsToken,
      })
      .from(surveys)
      .where(eq(surveys.id, survey.id))
      .limit(1);
    if (again?.status === "closed" && again.resultsToken) {
      return { token: again.resultsToken };
    }
    throw new ResultShareError("not_closed");
  });
}

// Clears the current link. The old address stops opening the report. A later
// create stores a different token. Already off is a no-op.
export async function revokeResultShare(publicToken: string): Promise<{ token: string | null }> {
  return db.transaction(async (tx) => {
    const [survey] = await tx
      .select({
        id: surveys.id,
        resultsToken: surveys.resultsToken,
      })
      .from(surveys)
      .where(eq(surveys.publicToken, publicToken))
      .for("update")
      .limit(1);
    if (!survey) {
      throw new ResultShareError("missing");
    }
    if (!survey.resultsToken) {
      return { token: null };
    }
    const [row] = await tx
      .update(surveys)
      .set({ resultsToken: null })
      .where(and(eq(surveys.id, survey.id), eq(surveys.resultsToken, survey.resultsToken)))
      .returning({ id: surveys.id });
    if (!row) {
      return { token: null };
    }
    return { token: survey.resultsToken };
  });
}

export async function getResultShareToken(publicToken: string): Promise<string | null> {
  const [survey] = await db
    .select({ resultsToken: surveys.resultsToken })
    .from(surveys)
    .where(eq(surveys.publicToken, publicToken))
    .limit(1);
  return survey?.resultsToken ?? null;
}

// The survey address is not a results link. A token only publishes while the
// pulse is closed, and the report is the unfiltered published view.
export async function readSharedResults(
  shareToken: string,
  options?: { floor?: number },
): Promise<SharedPulseReport> {
  const token = shareToken.trim();
  if (!token || token.length > 80) {
    return { state: "missing" };
  }
  const [survey] = await db
    .select({
      publicToken: surveys.publicToken,
      status: surveys.status,
    })
    .from(surveys)
    .where(eq(surveys.resultsToken, token))
    .limit(1);
  if (!survey) {
    return { state: "missing" };
  }
  if (survey.status !== "closed") {
    return { state: "unavailable" };
  }

  const floor = await anonymityFloor(options?.floor);
  const results = await getSurveyResults(survey.publicToken, { floor });
  if (!results || results.survey.status !== "closed") {
    return { state: "unavailable" };
  }
  return { state: "ready", report: toPublicReport(results, floor) };
}

async function anonymityFloor(floor: number | undefined): Promise<number> {
  if (typeof floor === "number" && Number.isInteger(floor) && floor >= MIN_TEAM_RESPONSES) {
    return floor;
  }
  const configured = await getAnonymityFloor();
  return Number.isInteger(configured) && configured >= MIN_TEAM_RESPONSES
    ? configured
    : MIN_TEAM_RESPONSES;
}

function toPublicReport(results: SurveyResults, floor: number): PublicPulseReport {
  return {
    title: results.survey.title,
    responseCount: results.survey.responseCount,
    averageScore: results.survey.averageScore,
    anonymityFloor: floor,
    teams: results.teams.map((team) => ({
      teamName: team.teamName,
      responseCount: team.responseCount,
      averageScore: team.averageScore,
      health: team.health,
    })),
    questions: results.questions.map((question) => ({
      position: question.position,
      prompt: question.prompt,
      type: question.type,
      scale: question.scale
        ? {
            min: question.scale.min,
            max: question.scale.max,
            average: question.scale.average,
            count: question.scale.count,
            byTeam: question.scale.byTeam.map((team) => ({
              teamName: team.teamName,
              average: team.average,
              count: team.count,
            })),
          }
        : null,
      choice: question.choice
        ? {
            options: question.choice.options,
            byTeam: question.choice.byTeam.map((team) => ({
              teamName: team.teamName,
              count: team.count,
              counts: team.counts,
            })),
          }
        : null,
      writtenCount: question.text?.count ?? null,
    })),
  };
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
