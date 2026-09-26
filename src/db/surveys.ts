import { and, eq, exists } from "drizzle-orm";
import { db } from "@/db/client";
import { questions, surveys, type SurveyStatus } from "@/db/schema";
import { surveyTransitionError } from "@/lib/survey-status";

export class SurveyNotFoundError extends Error {}
export class SurveyStatusError extends Error {}

export async function setSurveyStatus(input: {
  token: string;
  status: SurveyStatus;
}): Promise<{ publicToken: string; status: SurveyStatus }> {
  return db.transaction(async (tx) => {
    const [survey] = await tx
      .select({
        id: surveys.id,
        publicToken: surveys.publicToken,
        status: surveys.status,
      })
      .from(surveys)
      .where(eq(surveys.publicToken, input.token))
      .for("update")
      .limit(1);

    if (!survey) {
      throw new SurveyNotFoundError("That pulse is gone.");
    }

    const questionCount = await countQuestions(tx, survey.id);
    const error = surveyTransitionError(
      survey.status,
      input.status,
      questionCount,
    );
    if (error) {
      throw new SurveyStatusError(error);
    }

    const stillHasQuestion = exists(
      tx
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.surveyId, surveys.id)),
    );
    const openingDraft = input.status === "open" && survey.status === "draft";
    const [row] = await tx
      .update(surveys)
      .set({ status: input.status })
      .where(
        and(
          eq(surveys.id, survey.id),
          eq(surveys.status, survey.status),
          openingDraft ? stillHasQuestion : undefined,
        ),
      )
      .returning({
        publicToken: surveys.publicToken,
        status: surveys.status,
      });
    if (row) {
      return row;
    }

    const [fresh] = await tx
      .select({
        id: surveys.id,
        status: surveys.status,
      })
      .from(surveys)
      .where(eq(surveys.id, survey.id))
      .limit(1);
    if (!fresh) {
      throw new SurveyNotFoundError("That pulse is gone.");
    }
    const freshCount = await countQuestions(tx, fresh.id);
    throw new SurveyStatusError(
      surveyTransitionError(fresh.status, input.status, freshCount) ??
        "That pulse changed. Refresh and try again.",
    );
  });
}

async function countQuestions(
  tx: Pick<typeof db, "select">,
  surveyId: string,
): Promise<number> {
  const [countRow] = await tx
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.surveyId, surveyId))
    .limit(1);
  return countRow ? 1 : 0;
}
