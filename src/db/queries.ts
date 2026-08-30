import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { questions, responses, surveys, teams } from "@/db/schema";
import type { QuestionType, SurveyStatus } from "@/db/schema";

export type SurveyQuestion = {
  id: string;
  prompt: string;
  type: QuestionType;
  options: unknown;
  position: number;
  required: boolean;
};

export type PublicSurvey = {
  id: string;
  title: string;
  description: string | null;
  publicToken: string;
  status: SurveyStatus;
  questions: SurveyQuestion[];
};

export async function getOpenSurveys() {
  return db
    .select({
      id: surveys.id,
      title: surveys.title,
      description: surveys.description,
      publicToken: surveys.publicToken,
    })
    .from(surveys)
    .where(eq(surveys.status, "open"))
    .orderBy(asc(surveys.createdAt));
}

export async function getSurveyByToken(
  token: string,
): Promise<PublicSurvey | null> {
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.publicToken, token))
    .limit(1);

  if (!survey) {
    return null;
  }

  const surveyQuestions = await db
    .select({
      id: questions.id,
      prompt: questions.prompt,
      type: questions.type,
      options: questions.options,
      position: questions.position,
      required: questions.required,
    })
    .from(questions)
    .where(eq(questions.surveyId, survey.id))
    .orderBy(asc(questions.position));

  return {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    publicToken: survey.publicToken,
    status: survey.status,
    questions: surveyQuestions,
  };
}

export async function listTeams() {
  return db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
    })
    .from(teams)
    .orderBy(asc(teams.name));
}

export async function listSurveysForAdmin() {
  const rows = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      description: surveys.description,
      publicToken: surveys.publicToken,
      status: surveys.status,
    })
    .from(surveys)
    .orderBy(asc(surveys.createdAt));

  const withCounts = await Promise.all(
    rows.map(async (survey) => ({
      ...survey,
      responseCount: await countResponses(survey.id),
    })),
  );

  return withCounts;
}

export async function countResponses(surveyId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(responses)
    .where(eq(responses.surveyId, surveyId));

  return row?.value ?? 0;
}
