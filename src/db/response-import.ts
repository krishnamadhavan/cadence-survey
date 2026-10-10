import { asc, eq } from "drizzle-orm";
import { recordAudit } from "@/db/audit-log";
import { db } from "@/db/client";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import type { ChoiceOptions, QuestionOptions, ScaleOptions } from "@/db/schema";
import { matchTeamId } from "@/lib/employee-csv";
import { sanitizeFilenameToken } from "@/lib/spreadsheet";
import {
  parseResponseImport,
  responseImportTemplate,
  type ResponseImportIssue,
  type ResponseImportQuestion,
} from "@/lib/response-import";

const UNASSIGNED_LABEL = "unassigned";

export type ResponseImportOutcome =
  | { ok: true; imported: number }
  | { ok: false; status: 400 | 404 | 409; error?: string; errors?: ResponseImportIssue[] };

export async function importSurveyResponses(input: {
  publicToken: string;
  csvText: string;
  actor: { id: string | null; email: string };
}): Promise<ResponseImportOutcome> {
  return db.transaction(async (tx) => {
    const [survey] = await tx
      .select({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
      })
      .from(surveys)
      .where(eq(surveys.publicToken, input.publicToken))
      .for("update")
      .limit(1);
    if (!survey) {
      return { ok: false, status: 404, error: "Survey not found." };
    }
    if (survey.status !== "draft" && survey.status !== "closed") {
      return {
        ok: false,
        status: 409,
        error: "Close the pulse before importing past responses.",
      };
    }

    const surveyQuestions = await tx
      .select({
        id: questions.id,
        prompt: questions.prompt,
        type: questions.type,
        options: questions.options,
        position: questions.position,
      })
      .from(questions)
      .where(eq(questions.surveyId, survey.id))
      .orderBy(asc(questions.position));
    if (surveyQuestions.length === 0) {
      return {
        ok: false,
        status: 409,
        error: "Add a question before importing responses.",
      };
    }

    const parsed = parseResponseImport(
      input.csvText,
      surveyQuestions.map(toImportQuestion),
    );
    if (!parsed.ok) {
      return { ok: false, status: 400, errors: parsed.errors };
    }

    const teamRows = await tx
      .select({ id: teams.id, name: teams.name, slug: teams.slug })
      .from(teams);
    const errors: ResponseImportIssue[] = [];
    const ready: {
      teamId: string | null;
      role: string | null;
      tenureBand: (typeof parsed.rows)[number]["tenureBand"];
      submittedAt: Date | null;
      answers: (typeof parsed.rows)[number]["answers"];
    }[] = [];
    for (const row of parsed.rows) {
      const teamId = matchTeamId(row.team, teamRows);
      if (teamId) {
        ready.push({ ...row, teamId });
        continue;
      }
      if (row.team.trim().toLowerCase() === UNASSIGNED_LABEL) {
        ready.push({ ...row, teamId: null });
        continue;
      }
      errors.push({ line: row.line, message: `Unknown team: ${row.team}` });
    }
    if (errors.length > 0) {
      return { ok: false, status: 400, errors };
    }

    const importedAt = new Date();
    for (const row of ready) {
      const [response] = await tx
        .insert(responses)
        .values({
          surveyId: survey.id,
          teamId: row.teamId,
          role: row.role,
          tenureBand: row.tenureBand,
          submittedAt: row.submittedAt ?? importedAt,
        })
        .returning({ id: responses.id });
      if (!response) {
        throw new Error("response insert failed");
      }
      if (row.answers.length > 0) {
        await tx.insert(answers).values(
          row.answers.map((answer) => ({
            responseId: response.id,
            questionId: answer.questionId,
            value: { value: answer.value },
          })),
        );
      }
    }

    const countLabel = ready.length === 1 ? "response" : "responses";
    await recordAudit(
      {
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        action: "responses.imported",
        summary: `Imported ${ready.length} ${countLabel} into ${survey.title}`,
      },
      tx,
    );
    return { ok: true, imported: ready.length };
  });
}

export async function responseImportTemplateForSurvey(publicToken: string): Promise<
  | { state: "missing" }
  | { state: "empty" }
  | { state: "ready"; filename: string; csv: string }
> {
  const [survey] = await db
    .select({ id: surveys.id, publicToken: surveys.publicToken })
    .from(surveys)
    .where(eq(surveys.publicToken, publicToken))
    .limit(1);
  if (!survey) {
    return { state: "missing" };
  }
  const surveyQuestions = await db
    .select({ prompt: questions.prompt, position: questions.position })
    .from(questions)
    .where(eq(questions.surveyId, survey.id))
    .orderBy(asc(questions.position));
  if (surveyQuestions.length === 0) {
    return { state: "empty" };
  }
  return {
    state: "ready",
    filename: `${sanitizeFilenameToken(survey.publicToken)}-response-template.csv`,
    csv: responseImportTemplate(surveyQuestions),
  };
}

function toImportQuestion(question: {
  id: string;
  prompt: string;
  type: string;
  options: QuestionOptions;
  position: number;
}): ResponseImportQuestion {
  const scale = question.options as ScaleOptions | null;
  const choice = question.options as ChoiceOptions | null;
  return {
    id: question.id,
    prompt: question.prompt,
    position: question.position,
    type:
      question.type === "scale" || question.type === "choice" || question.type === "text"
        ? question.type
        : "text",
    min: scale && "min" in scale ? scale.min : undefined,
    max: scale && "max" in scale ? scale.max : undefined,
    choices: choice && "choices" in choice ? choice.choices : undefined,
  };
}
