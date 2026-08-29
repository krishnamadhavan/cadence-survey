import { db } from "@/db/client";
import { getSurveyByToken } from "@/db/queries";
import { answers, responses } from "@/db/schema";
import type { ChoiceOptions, ScaleOptions } from "@/db/schema";
import { limitSurveySubmit } from "@/lib/rate-limit";

export type IncomingAnswer = {
  questionId: string;
  value: unknown;
};

export type SubmitResult =
  | { ok: true; responseId: string }
  | { ok: false; status: number; error: string };

export async function submitSurveyResponse(
  token: string,
  incoming: IncomingAnswer[],
  ip: string,
): Promise<SubmitResult> {
  const survey = await getSurveyByToken(token);
  if (!survey || survey.status !== "open") {
    return {
      ok: false,
      status: 404,
      error: "This survey is not accepting responses.",
    };
  }

  try {
    const limited = await limitSurveySubmit(token, ip);
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
      const [response] = await tx
        .insert(responses)
        .values({ surveyId: survey.id })
        .returning({ id: responses.id });

      if (parsed.length > 0) {
        await tx.insert(answers).values(
          parsed.map((answer) => ({
            responseId: response.id,
            questionId: answer.questionId,
            value: { value: answer.value },
          })),
        );
      }

      return response.id;
    });

    return { ok: true, responseId };
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Could not save your response. Is Postgres running?",
    };
  }
}
