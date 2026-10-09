import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { PulseLinkError, takePulseLink } from "@/db/pulse-links";
import { getSurveyByToken } from "@/db/queries";
import { answers, employees, pulseLinks, responses } from "@/db/schema";
import type { ChoiceOptions, ScaleOptions } from "@/db/schema";
import { parseRole } from "@/lib/employee-attributes";
import { limitSurveySubmit } from "@/lib/rate-limit";

export type IncomingAnswer = {
  questionId: string;
  value: unknown;
};

export type SubmitResult =
  | { ok: true; responseId: string }
  | { ok: false; status: number; error: string };

class RoleSubmitError extends Error {}

export async function submitSurveyResponse(
  token: string,
  incoming: IncomingAnswer[],
  ip: string,
  code: string,
  roleInput?: string | null,
): Promise<SubmitResult> {
  const survey = await getSurveyByToken(token);
  if (!survey || survey.status !== "open") {
    return {
      ok: false,
      status: 404,
      error: "This survey is not accepting responses.",
    };
  }

  const linkCode = code.trim();
  if (!linkCode) {
    return { ok: false, status: 404, error: "This link is not valid." };
  }

  const parsedRole = parseRole(roleInput ?? "");
  if (!parsedRole.ok) {
    return { ok: false, status: 400, error: parsedRole.error };
  }
  const role = parsedRole.role;

  try {
    const limited = await limitSurveySubmit(token, linkCode, ip);
    if (!limited.ok) {
      return {
        ok: false,
        status: 429,
        error: `Too many submissions. Try again in ${limited.retryAfterSeconds}s.`,
      };
    }
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Could not reach Redis. Is Docker running?",
    };
  }

  const byId = new Map(incoming.map((item) => [item.questionId, item.value]));
  const parsed: { questionId: string; value: string | number }[] = [];

  for (const question of survey.questions) {
    const raw = byId.get(question.id);
    const present = raw !== undefined && raw !== null && String(raw).trim() !== "";

    if (!present) {
      if (question.required) {
        return {
          ok: false,
          status: 400,
          error: `Please answer: ${question.prompt}`,
        };
      }
      continue;
    }

    const text = String(raw).trim();

    if (question.type === "scale") {
      const options = question.options as ScaleOptions | null;
      const min = options?.min ?? 1;
      const max = options?.max ?? 5;
      const n = Number(text);
      if (!Number.isInteger(n) || n < min || n > max) {
        return {
          ok: false,
          status: 400,
          error: `Pick a number from ${min} to ${max}.`,
        };
      }
      parsed.push({ questionId: question.id, value: n });
      continue;
    }

    if (question.type === "choice") {
      const options = question.options as ChoiceOptions | null;
      const choices = options?.choices ?? [];
      if (!choices.includes(text)) {
        return {
          ok: false,
          status: 400,
          error: "Pick one of the listed options.",
        };
      }
      parsed.push({ questionId: question.id, value: text });
      continue;
    }

    parsed.push({ questionId: question.id, value: text });
  }

  try {
    const responseId = await db.transaction(async (tx) => {
      const taken = await takePulseLink(tx, survey.id, linkCode);
      // A repeat submit may keep the role already stored. A different role
      // still has to be one set on the team this response is counted with.
      const keepingStoredRole =
        taken.mode === "update" && role != null && role === taken.storedRole;
      if (role && !keepingStoredRole) {
        if (!taken.teamId) {
          throw new RoleSubmitError("Pick a role from your team.");
        }
        const [match] = await tx
          .select({ role: employees.role })
          .from(employees)
          .where(and(eq(employees.teamId, taken.teamId), eq(employees.role, role)))
          .limit(1);
        if (!match) {
          throw new RoleSubmitError("Pick a role from your team.");
        }
      }

      if (taken.mode === "update") {
        await tx
          .update(pulseLinks)
          .set({ redeemed: true })
          .where(eq(pulseLinks.id, taken.linkId));
        await tx
          .update(responses)
          .set({ role, submittedAt: new Date() })
          .where(eq(responses.id, taken.responseId));
        await tx.delete(answers).where(eq(answers.responseId, taken.responseId));
        if (parsed.length > 0) {
          await tx.insert(answers).values(
            parsed.map((answer) => ({
              responseId: taken.responseId,
              questionId: answer.questionId,
              value: { value: answer.value },
            })),
          );
        }
        return taken.responseId;
      }

      const [response] = await tx
        .insert(responses)
        .values({
          surveyId: survey.id,
          teamId: taken.teamId,
          role,
          tenureBand: taken.tenureBand,
        })
        .returning({ id: responses.id });

      if (!response) {
        throw new Error("response insert failed");
      }

      if (parsed.length > 0) {
        await tx.insert(answers).values(
          parsed.map((answer) => ({
            responseId: response.id,
            questionId: answer.questionId,
            value: { value: answer.value },
          })),
        );
      }

      const [spent] = await tx
        .update(pulseLinks)
        .set({ redeemed: true, responseId: response.id })
        .where(
          and(
            eq(pulseLinks.id, taken.linkId),
            eq(pulseLinks.redeemed, false),
            isNull(pulseLinks.responseId),
          ),
        )
        .returning({ id: pulseLinks.id });
      if (!spent) {
        throw new PulseLinkError("used");
      }

      return response.id;
    });

    return { ok: true, responseId };
  } catch (error) {
    if (error instanceof RoleSubmitError) {
      return { ok: false, status: 400, error: error.message };
    }
    if (error instanceof PulseLinkError) {
      if (error.reason === "used") {
        return {
          ok: false,
          status: 409,
          error: "This link was already used.",
        };
      }
      if (error.reason === "closed") {
        return {
          ok: false,
          status: 404,
          error: "This survey is not accepting responses.",
        };
      }
      return { ok: false, status: 404, error: "This link is not valid." };
    }
    return {
      ok: false,
      status: 503,
      error: "Could not save your response. Is Postgres running?",
    };
  }
}
