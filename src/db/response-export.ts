import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import type { QuestionType } from "@/db/schema";
import { getAnonymityFloor } from "@/db/settings";
import { applyDueSurveySchedules } from "@/db/surveys";
import { teamPublishKey } from "@/lib/min-cell";
import {
  anonymityFloor,
  buildResponseCsv,
  selectResponseRows,
  type ExportCell,
  type ExportResponse,
} from "@/lib/response-export";

const UNASSIGNED = "Unassigned";

export type ClosedResponseExport =
  | { state: "missing" }
  | { state: "not_closed" }
  | { state: "empty" }
  | { state: "hidden" }
  | { state: "ready"; publicToken: string; csv: string };

export async function exportClosedResponses(
  publicToken: string,
  options?: { floor?: number },
): Promise<ClosedResponseExport> {
  await applyDueSurveySchedules();
  const floor = anonymityFloor(options?.floor, await configuredFloor(options?.floor));
  return db.transaction(async (tx) => {
    const [survey] = await tx
      .select({
        id: surveys.id,
        publicToken: surveys.publicToken,
        status: surveys.status,
      })
      .from(surveys)
      .where(eq(surveys.publicToken, publicToken))
      .for("share")
      .limit(1);
    if (!survey) {
      return { state: "missing" };
    }
    if (survey.status !== "closed") {
      return { state: "not_closed" };
    }

    const surveyQuestions = await tx
      .select({
        id: questions.id,
        prompt: questions.prompt,
        type: questions.type,
        position: questions.position,
      })
      .from(questions)
      .where(eq(questions.surveyId, survey.id))
      .orderBy(questions.position);

    const answerRows = await tx
      .select({
        responseId: responses.id,
        submittedAt: responses.submittedAt,
        teamId: responses.teamId,
        teamName: teams.name,
        questionId: answers.questionId,
        value: answers.value,
      })
      .from(responses)
      .leftJoin(teams, eq(responses.teamId, teams.id))
      .leftJoin(answers, eq(answers.responseId, responses.id))
      .where(eq(responses.surveyId, survey.id));

    const questionById = new Map(surveyQuestions.map((question) => [question.id, question]));
    const grouped = new Map<string, ExportResponse & { cells: Map<string, ExportCell> }>();
    for (const row of answerRows) {
      let response = grouped.get(row.responseId);
      if (!response) {
        response = {
          id: row.responseId,
          submittedAt: row.submittedAt.getTime(),
          teamKey: teamPublishKey(row.teamId),
          teamName: row.teamName ?? UNASSIGNED,
          values: [],
          cells: new Map(),
        };
        grouped.set(row.responseId, response);
      }
      if (!row.questionId || response.cells.has(row.questionId)) {
        continue;
      }
      const question = questionById.get(row.questionId);
      if (!question) {
        continue;
      }
      response.cells.set(row.questionId, encodeAnswer(question.type, row.value?.value));
    }

    const loaded: ExportResponse[] = [...grouped.values()].map((response) => ({
      id: response.id,
      submittedAt: response.submittedAt,
      teamKey: response.teamKey,
      teamName: response.teamName,
      values: surveyQuestions.map((question) => response.cells.get(question.id) ?? null),
    }));
    const selected = selectResponseRows(loaded, floor);
    if (selected.state !== "ready") {
      return { state: selected.state };
    }
    return {
      state: "ready",
      publicToken: survey.publicToken,
      csv: buildResponseCsv(surveyQuestions, selected.rows),
    };
  });
}

async function configuredFloor(floor: number | undefined): Promise<number> {
  if (typeof floor === "number") {
    return floor;
  }
  return getAnonymityFloor();
}

function encodeAnswer(type: QuestionType, raw: unknown): ExportCell {
  if (type === "scale") {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  return null;
}
