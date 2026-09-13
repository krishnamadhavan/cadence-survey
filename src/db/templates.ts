import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, lt, gt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  questions,
  surveys,
  surveyTemplates,
  templateQuestions,
  type QuestionOptions,
  type QuestionType,
} from "@/db/schema";
import {
  parseQuestionOptions,
  parseQuestionPrompt,
  parseQuestionType,
  parseTemplateDescription,
  parseTemplateName,
} from "@/lib/template-question";

export type TemplateQuestionItem = {
  id: string;
  prompt: string;
  type: QuestionType;
  options: QuestionOptions;
  position: number;
  required: boolean;
};

export type TemplateListItem = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  questionCount: number;
  questions: TemplateQuestionItem[];
};

export type TemplateDetail = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  questions: TemplateQuestionItem[];
};

export class TemplateValidationError extends Error {}
export class TemplateConflictError extends Error {}
export class TemplateNotFoundError extends Error {}
export class TemplateEmptyError extends Error {}
export class TemplateQuestionNotFoundError extends Error {}

export async function listTemplatesForAdmin(): Promise<TemplateListItem[]> {
  const [templateRows, questionRows] = await Promise.all([
    db
      .select({
        id: surveyTemplates.id,
        name: surveyTemplates.name,
        description: surveyTemplates.description,
        createdAt: surveyTemplates.createdAt,
      })
      .from(surveyTemplates)
      .orderBy(asc(surveyTemplates.name)),
    db
      .select({
        id: templateQuestions.id,
        templateId: templateQuestions.templateId,
        prompt: templateQuestions.prompt,
        type: templateQuestions.type,
        options: templateQuestions.options,
        position: templateQuestions.position,
        required: templateQuestions.required,
      })
      .from(templateQuestions)
      .orderBy(asc(templateQuestions.position), asc(templateQuestions.id)),
  ]);

  const questionsByTemplate = new Map<string, TemplateQuestionItem[]>();
  for (const row of questionRows) {
    const current = questionsByTemplate.get(row.templateId) ?? [];
    current.push({
      id: row.id,
      prompt: row.prompt,
      type: row.type,
      options: row.options,
      position: row.position,
      required: row.required,
    });
    questionsByTemplate.set(row.templateId, current);
  }

  return templateRows.map((template) => {
    const questions = questionsByTemplate.get(template.id) ?? [];
    return {
      ...template,
      createdAt: template.createdAt.toISOString(),
      questionCount: questions.length,
      questions,
    };
  });
}

export async function getTemplateById(
  id: string,
): Promise<TemplateDetail | null> {
  const [template] = await db
    .select({
      id: surveyTemplates.id,
      name: surveyTemplates.name,
      description: surveyTemplates.description,
      createdAt: surveyTemplates.createdAt,
    })
    .from(surveyTemplates)
    .where(eq(surveyTemplates.id, id))
    .limit(1);

  if (!template) {
    return null;
  }

  const rows = await db
    .select({
      id: templateQuestions.id,
      prompt: templateQuestions.prompt,
      type: templateQuestions.type,
      options: templateQuestions.options,
      position: templateQuestions.position,
      required: templateQuestions.required,
    })
    .from(templateQuestions)
    .where(eq(templateQuestions.templateId, id))
    .orderBy(asc(templateQuestions.position), asc(templateQuestions.id));

  return {
    ...template,
    createdAt: template.createdAt.toISOString(),
    questions: rows,
  };
}

export async function createTemplate(input: {
  name: string;
  description: string;
}): Promise<{ id: string; name: string; description: string | null }> {
  const name = parseTemplateName(input.name);
  if (!name) {
    throw new TemplateValidationError("Name must be 1–80 characters.");
  }
  const description = parseTemplateDescription(input.description ?? "");
  if (input.description.trim() && description === null) {
    throw new TemplateValidationError("Description must be at most 280 characters.");
  }

  try {
    const [row] = await db
      .insert(surveyTemplates)
      .values({ name, description })
      .returning({
        id: surveyTemplates.id,
        name: surveyTemplates.name,
        description: surveyTemplates.description,
      });
    if (!row) {
      throw new Error("insert returned no template");
    }
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TemplateConflictError("A template with that name already exists.");
    }
    throw error;
  }
}

export async function updateTemplate(input: {
  id: string;
  name: string;
  description: string;
}): Promise<{ id: string; name: string; description: string | null }> {
  const name = parseTemplateName(input.name);
  if (!name) {
    throw new TemplateValidationError("Name must be 1–80 characters.");
  }
  const description = parseTemplateDescription(input.description ?? "");
  if (input.description.trim() && description === null) {
    throw new TemplateValidationError("Description must be at most 280 characters.");
  }

  try {
    const [row] = await db
      .update(surveyTemplates)
      .set({ name, description })
      .where(eq(surveyTemplates.id, input.id))
      .returning({
        id: surveyTemplates.id,
        name: surveyTemplates.name,
        description: surveyTemplates.description,
      });
    if (!row) {
      throw new TemplateNotFoundError("That template is gone.");
    }
    return row;
  } catch (error) {
    if (error instanceof TemplateNotFoundError) {
      throw error;
    }
    if (isUniqueViolation(error)) {
      throw new TemplateConflictError("A template with that name already exists.");
    }
    throw error;
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const deleted = await db
    .delete(surveyTemplates)
    .where(eq(surveyTemplates.id, id))
    .returning({ id: surveyTemplates.id });
  if (deleted.length === 0) {
    throw new TemplateNotFoundError("That template is gone.");
  }
}

export async function addTemplateQuestion(input: {
  templateId: string;
  prompt: string;
  type: string;
  required: boolean;
  min: string;
  max: string;
  minLabel: string;
  maxLabel: string;
  choices: string;
}): Promise<TemplateQuestionItem> {
  const fields = parseQuestionFields(input);

  return db.transaction(async (tx) => {
    const [template] = await tx
      .select({ id: surveyTemplates.id })
      .from(surveyTemplates)
      .where(eq(surveyTemplates.id, input.templateId))
      .for("update")
      .limit(1);
    if (!template) {
      throw new TemplateNotFoundError("That template is gone.");
    }

    const [last] = await tx
      .select({ position: templateQuestions.position })
      .from(templateQuestions)
      .where(eq(templateQuestions.templateId, input.templateId))
      .orderBy(desc(templateQuestions.position))
      .limit(1);

    const [row] = await tx
      .insert(templateQuestions)
      .values({
        templateId: input.templateId,
        prompt: fields.prompt,
        type: fields.type,
        options: fields.options,
        required: input.required,
        position: (last?.position ?? 0) + 1,
      })
      .returning({
        id: templateQuestions.id,
        prompt: templateQuestions.prompt,
        type: templateQuestions.type,
        options: templateQuestions.options,
        position: templateQuestions.position,
        required: templateQuestions.required,
      });
    if (!row) {
      throw new Error("insert returned no question");
    }
    return row;
  });
}

export async function updateTemplateQuestion(input: {
  id: string;
  prompt: string;
  type: string;
  required: boolean;
  min: string;
  max: string;
  minLabel: string;
  maxLabel: string;
  choices: string;
}): Promise<TemplateQuestionItem> {
  const fields = parseQuestionFields(input);
  const [row] = await db
    .update(templateQuestions)
    .set({
      prompt: fields.prompt,
      type: fields.type,
      options: fields.options,
      required: input.required,
    })
    .where(eq(templateQuestions.id, input.id))
    .returning({
      id: templateQuestions.id,
      prompt: templateQuestions.prompt,
      type: templateQuestions.type,
      options: templateQuestions.options,
      position: templateQuestions.position,
      required: templateQuestions.required,
    });
  if (!row) {
    throw new TemplateQuestionNotFoundError("That question is gone.");
  }
  return row;
}

export async function deleteTemplateQuestion(id: string): Promise<void> {
  const deleted = await db
    .delete(templateQuestions)
    .where(eq(templateQuestions.id, id))
    .returning({ id: templateQuestions.id });
  if (deleted.length === 0) {
    throw new TemplateQuestionNotFoundError("That question is gone.");
  }
}

export async function moveTemplateQuestion(input: {
  id: string;
  direction: "up" | "down";
}): Promise<void> {
  const [current] = await db
    .select({
      id: templateQuestions.id,
      templateId: templateQuestions.templateId,
      position: templateQuestions.position,
    })
    .from(templateQuestions)
    .where(eq(templateQuestions.id, input.id))
    .limit(1);

  if (!current) {
    throw new TemplateQuestionNotFoundError("That question is gone.");
  }

  const neighborQuery =
    input.direction === "up"
      ? and(
          eq(templateQuestions.templateId, current.templateId),
          lt(templateQuestions.position, current.position),
        )
      : and(
          eq(templateQuestions.templateId, current.templateId),
          gt(templateQuestions.position, current.position),
        );

  const [neighbor] = await db
    .select({
      id: templateQuestions.id,
      position: templateQuestions.position,
    })
    .from(templateQuestions)
    .where(neighborQuery)
    .orderBy(
      input.direction === "up"
        ? desc(templateQuestions.position)
        : asc(templateQuestions.position),
    )
    .limit(1);

  if (!neighbor) {
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(templateQuestions)
      .set({ position: neighbor.position })
      .where(eq(templateQuestions.id, current.id));
    await tx
      .update(templateQuestions)
      .set({ position: current.position })
      .where(eq(templateQuestions.id, neighbor.id));
  });
}

export async function createDraftFromTemplate(id: string): Promise<{
  id: string;
  publicToken: string;
  title: string;
}> {
  const template = await getTemplateById(id);
  if (!template) {
    throw new TemplateNotFoundError("That template is gone.");
  }
  if (template.questions.length === 0) {
    throw new TemplateEmptyError("Add a question before starting a pulse.");
  }

  return db.transaction(async (tx) => {
    const publicToken = newPublicToken();
    const [survey] = await tx
      .insert(surveys)
      .values({
        title: template.name,
        description: template.description,
        publicToken,
        status: "draft",
      })
      .returning({
        id: surveys.id,
        publicToken: surveys.publicToken,
        title: surveys.title,
      });
    if (!survey) {
      throw new Error("insert returned no survey");
    }

    await tx.insert(questions).values(
      template.questions.map((question) => ({
        surveyId: survey.id,
        prompt: question.prompt,
        type: question.type,
        options: question.options,
        position: question.position,
        required: question.required,
      })),
    );

    return survey;
  });
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
    throw new TemplateValidationError("Prompt must be 1–280 characters.");
  }
  const type = parseQuestionType(input.type);
  if (!type) {
    throw new TemplateValidationError("Pick scale, choice, or text.");
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
      throw new TemplateValidationError(
        "Scale needs a min lower than max, between 0 and 10.",
      );
    }
    throw new TemplateValidationError(
      "Choice questions need 2–20 unique options.",
    );
  }
  return { prompt, type, options: parsed.options };
}

function newPublicToken() {
  return randomBytes(16).toString("hex");
}

function isUniqueViolation(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      (current as { code: unknown }).code === "23505"
    ) {
      return true;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause: unknown }).cause
        : undefined;
  }
  return false;
}
