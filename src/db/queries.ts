import { asc, count, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, questions, responses, surveys, teams } from "@/db/schema";
import type { QuestionType, SurveyStatus } from "@/db/schema";

export type AdminSurveyListItem = {
  id: string;
  title: string;
  description: string | null;
  publicToken: string;
  status: SurveyStatus;
  createdAt: string;
  responseCount: number;
  questionCount: number;
};

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

export type TeamRoleOptions = {
  teamId: string;
  roles: string[];
};

export async function listEmployeeRolesByTeam(): Promise<TeamRoleOptions[]> {
  const rows = await db
    .select({ teamId: employees.teamId, role: employees.role })
    .from(employees)
    .where(isNotNull(employees.role));
  const byTeam = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.role) {
      continue;
    }
    const set = byTeam.get(row.teamId) ?? new Set<string>();
    set.add(row.role);
    byTeam.set(row.teamId, set);
  }
  return [...byTeam.entries()].map(([teamId, roles]) => ({
    teamId,
    roles: [...roles].sort((a, b) => a.localeCompare(b)),
  }));
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

export async function listSurveysForAdmin(): Promise<AdminSurveyListItem[]> {
  const [rows, responseRows, questionRows] = await Promise.all([
    db
      .select({
        id: surveys.id,
        title: surveys.title,
        description: surveys.description,
        publicToken: surveys.publicToken,
        status: surveys.status,
        createdAt: surveys.createdAt,
      })
      .from(surveys)
      .orderBy(asc(surveys.createdAt)),
    db
      .select({
        surveyId: responses.surveyId,
        n: count(),
      })
      .from(responses)
      .groupBy(responses.surveyId),
    db
      .select({
        surveyId: questions.surveyId,
        n: count(),
      })
      .from(questions)
      .groupBy(questions.surveyId),
  ]);

  const responsesBySurvey = new Map(
    responseRows.map((row) => [row.surveyId, Number(row.n)]),
  );
  const questionsBySurvey = new Map(
    questionRows.map((row) => [row.surveyId, Number(row.n)]),
  );

  return rows.map((survey) => ({
    ...survey,
    createdAt: survey.createdAt.toISOString(),
    responseCount: responsesBySurvey.get(survey.id) ?? 0,
    questionCount: questionsBySurvey.get(survey.id) ?? 0,
  }));
}
