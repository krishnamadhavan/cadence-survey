import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { questions, surveys, type SurveyStatus } from "@/db/schema";
import { surveyTransitionError } from "@/lib/survey-status";

export class SurveyNotFoundError extends Error {}
export class SurveyStatusError extends Error {}

export async function setSurveyStatus(input: {
  token: string;
  status: SurveyStatus;
}): Promise<{ publicToken: string; status: SurveyStatus }> {
  const [survey] = await db
    .select({
      id: surveys.id,
      publicToken: surveys.publicToken,
      status: surveys.status,
    })
    .from(surveys)
    .where(eq(surveys.publicToken, input.token))
    .limit(1);

  if (!survey) {
    throw new SurveyNotFoundError("That pulse is gone.");
  }

  const [countRow] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.surveyId, survey.id))
    .limit(1);
  const questionCount = countRow ? 1 : 0;

  const error = surveyTransitionError(
    survey.status,
    input.status,
    questionCount,
  );
  if (error) {
    throw new SurveyStatusError(error);
  }

  const [row] = await db
    .update(surveys)
    .set({ status: input.status })
    .where(eq(surveys.id, survey.id))
    .returning({
      publicToken: surveys.publicToken,
      status: surveys.status,
    });
  if (!row) {
    throw new SurveyNotFoundError("That pulse is gone.");
  }
  return row;
}
