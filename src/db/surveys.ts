import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, exists, gt, isNotNull, isNull, lte, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  questions,
  surveys,
  type QuestionOptions,
  type QuestionType,
  type SurveyStatus,
} from "@/db/schema";
import {
  parseQuestionOptions,
  parseQuestionPrompt,
  parseQuestionType,
  parseTemplateName,
} from "@/lib/template-question";
import { ensurePulseLinks } from "@/db/pulse-links";
import { nextSurveyWindow, type SurveyCadence } from "@/lib/survey-cadence";
import { surveyTransitionError } from "@/lib/survey-status";

export class SurveyNotFoundError extends Error {}
export class SurveyStatusError extends Error {}
export class SurveyValidationError extends Error {}
export class SurveyQuestionNotFoundError extends Error {}

export type SurveyQuestionItem = {
  id: string;
  prompt: string;
  type: QuestionType;
  options: QuestionOptions;
  position: number;
  required: boolean;
};

const questionColumns = {
  id: questions.id,
  prompt: questions.prompt,
  type: questions.type,
  options: questions.options,
  position: questions.position,
  required: questions.required,
};

export async function setSurveyStatus(input: {
  token: string;
  status: SurveyStatus;
}): Promise<{
  publicToken: string;
  status: SurveyStatus;
  revokedResultsToken: string | null;
}> {
  return db.transaction(async (tx) => {
    const [survey] = await tx
      .select({
        id: surveys.id,
        publicToken: surveys.publicToken,
        status: surveys.status,
        resultsToken: surveys.resultsToken,
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
    const reopening = input.status === "open" && survey.status === "closed";
    const [row] = await tx
      .update(surveys)
      .set({
        status: input.status,
        ...(reopening ? { closesAt: null, resultsToken: null } : {}),
      })
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
      if (row.status === "open") {
        await ensurePulseLinks(survey.id, tx);
      }
      if (input.status === "closed") {
        await spawnNextPulses(tx, new Date());
      }
      return {
        publicToken: row.publicToken,
        status: row.status,
        revokedResultsToken: reopening ? survey.resultsToken : null,
      };
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

export async function duplicateSurvey(id: string): Promise<{
  id: string;
  publicToken: string;
  title: string;
}> {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        id: surveys.id,
        title: surveys.title,
        description: surveys.description,
      })
      .from(surveys)
      .where(eq(surveys.id, id))
      .limit(1);
    if (!source) {
      throw new SurveyNotFoundError("That pulse is gone.");
    }
    const copiedQuestions = await tx
      .select({
        prompt: questions.prompt,
        type: questions.type,
        options: questions.options,
        position: questions.position,
        required: questions.required,
      })
      .from(questions)
      .where(eq(questions.surveyId, source.id))
      .orderBy(asc(questions.position));

    const [created] = await tx
      .insert(surveys)
      .values({
        title: copyTitle(source.title),
        description: source.description,
        publicToken: randomBytes(16).toString("hex"),
        status: "draft",
      })
      .returning({
        id: surveys.id,
        publicToken: surveys.publicToken,
        title: surveys.title,
      });
    if (!created) {
      throw new SurveyValidationError("Could not duplicate that pulse.");
    }
    if (copiedQuestions.length > 0) {
      await tx.insert(questions).values(
        copiedQuestions.map((question) => ({
          surveyId: created.id,
          prompt: question.prompt,
          type: question.type,
          options: question.options,
          position: question.position,
          required: question.required,
        })),
      );
    }
    return created;
  });
}

async function spawnNextPulses(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  now: Date,
) {
  const due = await tx
    .select({
      id: surveys.id,
      title: surveys.title,
      description: surveys.description,
      opensAt: surveys.opensAt,
      closesAt: surveys.closesAt,
      cadence: surveys.cadence,
      seriesId: surveys.seriesId,
    })
    .from(surveys)
    .where(
      and(
        eq(surveys.status, "closed"),
        isNotNull(surveys.cadence),
        isNull(surveys.nextSurveyId),
        isNotNull(surveys.opensAt),
        isNotNull(surveys.closesAt),
      ),
    )
    .orderBy(asc(surveys.id))
    .for("update");
  for (const source of due) {
    if (!source.opensAt || !source.closesAt || !source.cadence) {
      continue;
    }
    const window = nextSurveyWindow(source.opensAt, source.closesAt, source.cadence, now);
    if (!window || window.closesAt <= now) {
      continue;
    }
    const [created] = await tx
      .insert(surveys)
      .values({
        title: source.title,
        description: source.description,
        publicToken: randomBytes(16).toString("hex"),
        status: "draft",
        opensAt: window.opensAt,
        closesAt: window.closesAt,
        cadence: source.cadence,
        seriesId: source.seriesId ?? source.id,
      })
      .returning({ id: surveys.id });
    if (!created) {
      continue;
    }
    const copied = await tx
      .select({
        prompt: questions.prompt,
        type: questions.type,
        options: questions.options,
        position: questions.position,
        required: questions.required,
      })
      .from(questions)
      .where(eq(questions.surveyId, source.id))
      .orderBy(asc(questions.position));
    if (copied.length > 0) {
      await tx.insert(questions).values(
        copied.map((question) => ({
          surveyId: created.id,
          prompt: question.prompt,
          type: question.type,
          options: question.options,
          position: question.position,
          required: question.required,
        })),
      );
    }
    const [linked] = await tx
      .update(surveys)
      .set({
        nextSurveyId: created.id,
        seriesId: source.seriesId ?? source.id,
      })
      .where(and(eq(surveys.id, source.id), isNull(surveys.nextSurveyId)))
      .returning({ id: surveys.id });
    if (!linked) {
      await tx.delete(surveys).where(eq(surveys.id, created.id));
    }
  }
}

function copyTitle(title: string) {
  const prefix = "Copy of ";
  return `${prefix}${title}`.slice(0, 80).trim();
}

export async function applyDueSurveySchedules(now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const opened = await tx
      .update(surveys)
      .set({ status: "open" })
      .where(
        and(
          eq(surveys.status, "draft"),
          isNotNull(surveys.opensAt),
          lte(surveys.opensAt, now),
          exists(
            tx
              .select({ id: questions.id })
              .from(questions)
              .where(eq(questions.surveyId, surveys.id)),
          ),
        ),
      )
      .returning({ id: surveys.id });
    for (const survey of opened) {
      await ensurePulseLinks(survey.id, tx);
    }
    await tx
      .update(surveys)
      .set({ status: "closed" })
      .where(
        and(
          eq(surveys.status, "open"),
          isNotNull(surveys.closesAt),
          lte(surveys.closesAt, now),
        ),
      );
    await spawnNextPulses(tx, now);
    // An ended draft was opened above so this tick can close it. Do not open
    // the follow-up draft when that next window has already ended.
    const openedFollowUps = await tx
      .update(surveys)
      .set({ status: "open" })
      .where(
        and(
          eq(surveys.status, "draft"),
          isNotNull(surveys.opensAt),
          lte(surveys.opensAt, now),
          or(isNull(surveys.closesAt), gt(surveys.closesAt, now)),
          exists(
            tx
              .select({ id: questions.id })
              .from(questions)
              .where(eq(questions.surveyId, surveys.id)),
          ),
        ),
      )
      .returning({ id: surveys.id });
    for (const survey of openedFollowUps) {
      await ensurePulseLinks(survey.id, tx);
    }
  });
}

export async function setSurveySchedule(input: {
  token: string;
  opensAt: Date | null;
  closesAt: Date | null;
  cadence: SurveyCadence | null;
}): Promise<void> {
  if ((input.opensAt === null) !== (input.closesAt === null)) {
    throw new SurveyValidationError("Set both an open date and a close date.");
  }
  if (input.opensAt && input.closesAt && input.opensAt >= input.closesAt) {
    throw new SurveyValidationError("The open date has to be before the close date.");
  }
  await db.transaction(async (tx) => {
    const survey = await lockDraft(tx, input.token);
    const [current] = await tx
      .select({ seriesId: surveys.seriesId })
      .from(surveys)
      .where(eq(surveys.id, survey.id))
      .limit(1);
    const [row] = await tx
      .update(surveys)
      .set({
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        cadence: input.opensAt ? input.cadence : null,
        seriesId: input.opensAt ? (current?.seriesId ?? survey.id) : current?.seriesId,
      })
      .where(and(eq(surveys.id, survey.id), eq(surveys.status, "draft")))
      .returning({ id: surveys.id });
    if (!row) {
      throw new SurveyStatusError("Only a draft can be scheduled.");
    }
  });
}

export async function listSurveyQuestions(
  token: string,
): Promise<SurveyQuestionItem[]> {
  const [survey] = await db
    .select({ id: surveys.id })
    .from(surveys)
    .where(eq(surveys.publicToken, token))
    .limit(1);
  if (!survey) {
    return [];
  }
  return db
    .select(questionColumns)
    .from(questions)
    .where(eq(questions.surveyId, survey.id))
    .orderBy(asc(questions.position));
}

export async function renameSurvey(input: {
  token: string;
  title: string;
}): Promise<{ publicToken: string; title: string }> {
  const title = parseTemplateName(input.title);
  if (!title) {
    throw new SurveyValidationError("Title must be 1–80 characters.");
  }

  return db.transaction(async (tx) => {
    const survey = await lockDraft(tx, input.token);
    const [row] = await tx
      .update(surveys)
      .set({ title })
      .where(and(eq(surveys.id, survey.id), eq(surveys.status, "draft")))
      .returning({
        publicToken: surveys.publicToken,
        title: surveys.title,
      });
    if (!row) {
      throw new SurveyStatusError("Only a draft can be edited.");
    }
    return row;
  });
}

export async function addSurveyQuestion(input: {
  token: string;
  prompt: string;
  type: string;
  required: boolean;
  min: string;
  max: string;
  minLabel: string;
  maxLabel: string;
  choices: string;
}): Promise<SurveyQuestionItem> {
  const fields = parseQuestionFields(input);
  return db.transaction(async (tx) => {
    const survey = await lockDraft(tx, input.token);
    const [last] = await tx
      .select({ position: questions.position })
      .from(questions)
      .where(eq(questions.surveyId, survey.id))
      .orderBy(desc(questions.position))
      .limit(1);
    const [row] = await tx
      .insert(questions)
      .values({
        surveyId: survey.id,
        prompt: fields.prompt,
        type: fields.type,
        options: fields.options,
        required: input.required,
        position: (last?.position ?? 0) + 1,
      })
      .returning(questionColumns);
    if (!row) {
      throw new SurveyValidationError("Could not add the question.");
    }
    return row;
  });
}

export async function updateSurveyQuestion(input: {
  token: string;
  id: string;
  prompt: string;
  type: string;
  required: boolean;
  min: string;
  max: string;
  minLabel: string;
  maxLabel: string;
  choices: string;
}): Promise<SurveyQuestionItem> {
  const fields = parseQuestionFields(input);
  return db.transaction(async (tx) => {
    const survey = await lockDraft(tx, input.token);
    const [row] = await tx
      .update(questions)
      .set({
        prompt: fields.prompt,
        type: fields.type,
        options: fields.options,
        required: input.required,
      })
      .where(and(eq(questions.id, input.id), eq(questions.surveyId, survey.id)))
      .returning(questionColumns);
    if (!row) {
      throw new SurveyQuestionNotFoundError("That question is gone.");
    }
    return row;
  });
}

export async function deleteSurveyQuestion(input: {
  token: string;
  id: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const survey = await lockDraft(tx, input.token);
    const deleted = await tx
      .delete(questions)
      .where(and(eq(questions.id, input.id), eq(questions.surveyId, survey.id)))
      .returning({ id: questions.id });
    if (deleted.length === 0) {
      throw new SurveyQuestionNotFoundError("That question is gone.");
    }
  });
}

export async function moveSurveyQuestion(input: {
  token: string;
  id: string;
  direction: "up" | "down";
}): Promise<void> {
  await db.transaction(async (tx) => {
    const survey = await lockDraft(tx, input.token);
    const [current] = await tx
      .select({ id: questions.id, position: questions.position })
      .from(questions)
      .where(and(eq(questions.id, input.id), eq(questions.surveyId, survey.id)))
      .limit(1);
    if (!current) {
      throw new SurveyQuestionNotFoundError("That question is gone.");
    }

    const neighborQuery =
      input.direction === "up"
        ? and(
            eq(questions.surveyId, survey.id),
            lt(questions.position, current.position),
          )
        : and(
            eq(questions.surveyId, survey.id),
            gt(questions.position, current.position),
          );
    const [neighbor] = await tx
      .select({ id: questions.id, position: questions.position })
      .from(questions)
      .where(neighborQuery)
      .orderBy(
        input.direction === "up"
          ? desc(questions.position)
          : asc(questions.position),
      )
      .limit(1);
    if (!neighbor) {
      return;
    }

    await tx
      .update(questions)
      .set({ position: neighbor.position })
      .where(eq(questions.id, current.id));
    await tx
      .update(questions)
      .set({ position: current.position })
      .where(eq(questions.id, neighbor.id));
  });
}

type SurveyTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockDraft(tx: SurveyTx, token: string) {
  const [survey] = await tx
    .select({
      id: surveys.id,
      status: surveys.status,
    })
    .from(surveys)
    .where(eq(surveys.publicToken, token))
    .for("update")
    .limit(1);
  if (!survey) {
    throw new SurveyNotFoundError("That pulse is gone.");
  }
  if (survey.status !== "draft") {
    throw new SurveyStatusError("Only a draft can be edited.");
  }
  return survey;
}

function parseQuestionFields(input: {
  prompt: string;
  type: string;
  min: string;
  max: string;
  minLabel: string;
  maxLabel: string;
  choices: string;
}) {
  const prompt = parseQuestionPrompt(input.prompt);
  if (!prompt) {
    throw new SurveyValidationError("Prompt must be 1–280 characters.");
  }
  const type = parseQuestionType(input.type);
  if (!type) {
    throw new SurveyValidationError("Pick scale, choice, or text.");
  }
  const parsed = parseQuestionOptions(type, {
    min: input.min,
    max: input.max,
    minLabel: input.minLabel,
    maxLabel: input.maxLabel,
    choices: input.choices,
  });
  if (!parsed.ok) {
    if (type === "scale") {
      throw new SurveyValidationError(
        "Scale needs a min lower than max, between 0 and 10.",
      );
    }
    throw new SurveyValidationError(
      "Choice questions need 2–20 unique options.",
    );
  }
  return { prompt, type, options: parsed.options };
}
