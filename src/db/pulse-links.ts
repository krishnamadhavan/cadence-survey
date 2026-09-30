import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, pulseLinks, surveys } from "@/db/schema";

type LinkDb = Pick<typeof db, "insert" | "select" | "update">;

export type PulseLinkShare = {
  name: string;
  email: string;
  token: string;
};

export type PulseLinkList = {
  issued: boolean;
  links: PulseLinkShare[];
};

export class PulseLinkError extends Error {
  constructor(readonly reason: "missing" | "used") {
    super(reason);
  }
}

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
      token: pulseLinks.token,
    })
    .from(pulseLinks)
    .innerJoin(employees, eq(employees.id, pulseLinks.employeeId))
    .where(eq(pulseLinks.surveyId, survey.id))
    .orderBy(asc(employees.name), asc(employees.email));

  return { issued: true, links };
}

export async function readPulseLink(
  surveyToken: string,
  code: string,
): Promise<{ redeemed: boolean; status: "draft" | "open" | "closed"; title: string } | null> {
  const normalized = code.trim();
  if (!normalized || normalized.length > 64) {
    return null;
  }
  const [row] = await db
    .select({
      redeemed: pulseLinks.redeemed,
      status: surveys.status,
      title: surveys.title,
    })
    .from(pulseLinks)
    .innerJoin(surveys, eq(surveys.id, pulseLinks.surveyId))
    .where(and(eq(surveys.publicToken, surveyToken), eq(pulseLinks.token, normalized)))
    .limit(1);
  return row ?? null;
}

// Marks the link spent and returns the person's current team.
// Callers must insert the response in the same transaction. The team id is
// the only fact that leaves this function; the employee id does not.
export async function takePulseLink(
  tx: LinkDb,
  surveyId: string,
  code: string,
): Promise<{ teamId: string }> {
  const normalized = code.trim();
  if (!normalized || normalized.length > 64) {
    throw new PulseLinkError("missing");
  }

  const [link] = await tx
    .select({
      id: pulseLinks.id,
      redeemed: pulseLinks.redeemed,
      employeeId: pulseLinks.employeeId,
    })
    .from(pulseLinks)
    .where(and(eq(pulseLinks.surveyId, surveyId), eq(pulseLinks.token, normalized)))
    .for("update")
    .limit(1);
  if (!link) {
    throw new PulseLinkError("missing");
  }
  if (link.redeemed) {
    throw new PulseLinkError("used");
  }

  const [person] = await tx
    .select({ teamId: employees.teamId })
    .from(employees)
    .where(eq(employees.id, link.employeeId))
    .limit(1);
  if (!person) {
    throw new PulseLinkError("missing");
  }

  const [spent] = await tx
    .update(pulseLinks)
    .set({ redeemed: true })
    .where(and(eq(pulseLinks.id, link.id), eq(pulseLinks.redeemed, false)))
    .returning({ id: pulseLinks.id });
  if (!spent) {
    throw new PulseLinkError("used");
  }

  return { teamId: person.teamId };
}
