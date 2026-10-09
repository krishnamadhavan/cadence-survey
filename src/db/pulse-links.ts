import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  answers,
  employees,
  pulseLinks,
  responses,
  surveys,
  type AnswerValue,
} from "@/db/schema";
import type { TenureBand } from "@/lib/employee-attributes";

type LinkDb = Pick<typeof db, "insert" | "select" | "update">;

export type PulseLinkShare = {
  name: string;
  email: string;
  // Null once the link has been used, so the admin list cannot open that answer.
  token: string | null;
};

export type PulseLinkList = {
  issued: boolean;
  links: PulseLinkShare[];
};

export class PulseLinkError extends Error {
  constructor(readonly reason: "missing" | "used" | "closed") {
    super(reason);
  }
}

export type ClaimedPulseLink =
  | { mode: "create"; linkId: string; teamId: string; tenureBand: TenureBand | null }
  | {
      mode: "update";
      linkId: string;
      teamId: string | null;
      responseId: string;
      storedRole: string | null;
    };

const INSERT_CHUNK = 500;

// Share-locks the roster so a person cannot disappear between the read and the
// insert. Callers that already have a transaction pass it through.
export async function ensurePulseLinks(surveyId: string, tx?: LinkDb): Promise<void> {
  if (tx) {
    await insertMissingLinks(surveyId, tx);
    return;
  }
  await db.transaction(async (inner) => {
    await insertMissingLinks(surveyId, inner);
  });
}

async function insertMissingLinks(surveyId: string, tx: LinkDb): Promise<void> {
  const people = await tx.select({ id: employees.id }).from(employees).for("share");
  const existing = await tx
    .select({ employeeId: pulseLinks.employeeId })
    .from(pulseLinks)
    .where(eq(pulseLinks.surveyId, surveyId));
  const have = new Set(existing.map((row) => row.employeeId));
  const missing = people.filter((person) => !have.has(person.id));
  if (missing.length === 0) {
    return;
  }

  for (let i = 0; i < missing.length; i += INSERT_CHUNK) {
    const chunk = missing.slice(i, i + INSERT_CHUNK);
    await tx
      .insert(pulseLinks)
      .values(
        chunk.map((person) => ({
          surveyId,
          employeeId: person.id,
          token: randomBytes(16).toString("hex"),
        })),
      )
      .onConflictDoNothing({
        target: [pulseLinks.surveyId, pulseLinks.employeeId],
      });
  }
}

export async function ensureLinksForOpenSurveys(): Promise<void> {
  const open = await db
    .select({ id: surveys.id })
    .from(surveys)
    .where(eq(surveys.status, "open"));
  for (const survey of open) {
    await ensurePulseLinks(survey.id);
  }
}

export async function listPulseLinks(surveyToken: string): Promise<PulseLinkList | null> {
  const [survey] = await db
    .select({ id: surveys.id, status: surveys.status })
    .from(surveys)
    .where(eq(surveys.publicToken, surveyToken))
    .limit(1);
  if (!survey) {
    return null;
  }
  if (survey.status === "draft") {
    return { issued: false, links: [] };
  }
  if (survey.status === "open") {
    await ensurePulseLinks(survey.id);
  }

  const links = await db
    .select({
      name: employees.name,
      email: employees.email,
      token: sql<string | null>`case when ${pulseLinks.redeemed} or ${pulseLinks.responseId} is not null then null else ${pulseLinks.token} end`,
    })
    .from(pulseLinks)
    .innerJoin(employees, eq(employees.id, pulseLinks.employeeId))
    .where(eq(pulseLinks.surveyId, survey.id))
    .orderBy(asc(employees.name), asc(employees.email));

  return { issued: true, links };
}

export type PulseLinkView = {
  redeemed: boolean;
  editable: boolean;
  status: "draft" | "open" | "closed";
  title: string;
  teamId: string;
  role: string | null;
  answers: { questionId: string; value: string }[];
};

export async function readPulseLink(
  surveyToken: string,
  code: string,
): Promise<PulseLinkView | null> {
  const normalized = code.trim();
  if (!normalized || normalized.length > 64) {
    return null;
  }
  const [row] = await db
    .select({
      redeemed: pulseLinks.redeemed,
      responseRowId: responses.id,
      responseSurveyId: responses.surveyId,
      responseTeamId: responses.teamId,
      role: responses.role,
      surveyId: surveys.id,
      status: surveys.status,
      title: surveys.title,
      employeeTeamId: employees.teamId,
    })
    .from(pulseLinks)
    .innerJoin(surveys, eq(surveys.id, pulseLinks.surveyId))
    .innerJoin(employees, eq(employees.id, pulseLinks.employeeId))
    .leftJoin(responses, eq(responses.id, pulseLinks.responseId))
    .where(and(eq(surveys.publicToken, surveyToken), eq(pulseLinks.token, normalized)))
    .limit(1);
  if (!row) {
    return null;
  }

  const responseId =
    row.responseRowId != null && row.responseSurveyId === row.surveyId
      ? row.responseRowId
      : null;
  const answersForLink = responseId
    ? await db
        .select({ questionId: answers.questionId, value: answers.value })
        .from(answers)
        .where(eq(answers.responseId, responseId))
    : [];

  return {
    redeemed: row.redeemed,
    editable: !row.redeemed || responseId != null,
    status: row.status,
    title: row.title,
    teamId: responseId ? (row.responseTeamId ?? row.employeeTeamId) : row.employeeTeamId,
    role: responseId ? row.role : null,
    answers: answersForLink.flatMap((answer) => {
      const value = answerText(answer.value);
      return value == null ? [] : [{ questionId: answer.questionId, value }];
    }),
  };
}

function answerText(value: AnswerValue): string | null {
  if (typeof value.value === "number" && Number.isFinite(value.value)) {
    return String(value.value);
  }
  if (typeof value.value === "string") {
    return value.value;
  }
  return null;
}

// Locks the pulse, then the link. A first submit uses the person's current
// team and tenure band. A later submit keeps the team and tenure already
// stored on the response. The employee id does not leave this function.
export async function takePulseLink(
  tx: LinkDb,
  surveyId: string,
  code: string,
): Promise<ClaimedPulseLink> {
  const normalized = code.trim();
  if (!normalized || normalized.length > 64) {
    throw new PulseLinkError("missing");
  }

  const [survey] = await tx
    .select({ id: surveys.id, status: surveys.status })
    .from(surveys)
    .where(eq(surveys.id, surveyId))
    .for("update")
    .limit(1);
  if (!survey || survey.status !== "open") {
    throw new PulseLinkError("closed");
  }

  const [link] = await tx
    .select({
      id: pulseLinks.id,
      redeemed: pulseLinks.redeemed,
      employeeId: pulseLinks.employeeId,
      responseId: pulseLinks.responseId,
    })
    .from(pulseLinks)
    .where(and(eq(pulseLinks.surveyId, surveyId), eq(pulseLinks.token, normalized)))
    .for("update")
    .limit(1);
  if (!link) {
    throw new PulseLinkError("missing");
  }

  if (link.responseId) {
    const [existing] = await tx
      .select({
        teamId: responses.teamId,
        role: responses.role,
        surveyId: responses.surveyId,
      })
      .from(responses)
      .where(eq(responses.id, link.responseId))
      .limit(1);
    if (!existing || existing.surveyId !== surveyId) {
      throw new PulseLinkError("used");
    }
    return {
      mode: "update",
      linkId: link.id,
      teamId: existing.teamId,
      responseId: link.responseId,
      storedRole: existing.role,
    };
  }

  if (link.redeemed) {
    throw new PulseLinkError("used");
  }

  const [person] = await tx
    .select({ teamId: employees.teamId, tenureBand: employees.tenureBand })
    .from(employees)
    .where(eq(employees.id, link.employeeId))
    .limit(1);
  if (!person) {
    throw new PulseLinkError("missing");
  }

  return {
    mode: "create",
    linkId: link.id,
    teamId: person.teamId,
    tenureBand: person.tenureBand,
  };
}
