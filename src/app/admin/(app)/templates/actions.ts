"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  TemplateConflictError,
  TemplateEmptyError,
  TemplateNotFoundError,
  TemplateQuestionNotFoundError,
  TemplateValidationError,
  addTemplateQuestion,
  createTemplate,
  deleteTemplate,
  deleteTemplateQuestion,
  moveTemplateQuestion,
  updateTemplate,
  updateTemplateQuestion,
  createDraftFromTemplate,
} from "@/db/templates";
import { parseRequired } from "@/lib/template-question";
import { hasAdminSession } from "@/lib/admin";

export type TemplateActionState = {
  ok: boolean;
  error: string | null;
} | null;

const idSchema = z.string().uuid();

function fail(error: string): TemplateActionState {
  return { ok: false, error };
}

function revalidateTemplatePages(templateId?: string) {
  revalidatePath("/admin/templates");
  if (templateId) {
    revalidatePath(`/admin/templates/${templateId}`);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
}

export async function createTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/templates");
  }

  let created: { id: string };
  try {
    created = await createTemplate({
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
    });
  } catch (error) {
    return fail(
      actionError(error, "Could not create the template. Is Postgres running?"),
    );
  }
  revalidateTemplatePages(created.id);
  redirect(`/admin/templates/${created.id}`);
}

export async function updateTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/templates");
  }

  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    return fail("That template is not valid.");
  }

  try {
    await updateTemplate({
      id: id.data,
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
    });
    revalidateTemplatePages(id.data);
    return { ok: true, error: null };
  } catch (error) {
    return fail(
      actionError(error, "Could not update the template. Is Postgres running?"),
    );
  }
}

export async function deleteTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/templates");
  }

  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    return fail("That template is not valid.");
  }

  try {
    await deleteTemplate(id.data);
  } catch (error) {
    return fail(
      actionError(error, "Could not delete the template. Is Postgres running?"),
    );
  }
  revalidateTemplatePages();
  if (String(formData.get("next") ?? "") === "list") {
    redirect("/admin/templates");
  }
  return { ok: true, error: null };
}

export async function useTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/templates");
  }

  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    return fail("That template is not valid.");
  }

  let survey: { publicToken: string };
  try {
    survey = await createDraftFromTemplate(id.data);
  } catch (error) {
    return fail(
      actionError(error, "Could not start a pulse from this template."),
    );
  }
  revalidateTemplatePages(id.data);
  revalidatePath(`/admin/s/${survey.publicToken}`);
  redirect(`/admin/s/${survey.publicToken}`);
}

export async function addTemplateQuestionAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/templates");
  }

  const templateId = idSchema.safeParse(String(formData.get("templateId") ?? ""));
  if (!templateId.success) {
    return fail("That template is not valid.");
  }

  try {
    await addTemplateQuestion(questionFields(formData, templateId.data));
    revalidateTemplatePages(templateId.data);
    return { ok: true, error: null };
  } catch (error) {
    return fail(
      actionError(error, "Could not add the question. Is Postgres running?"),
    );
  }
}

export async function updateTemplateQuestionAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/templates");
  }

  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  const templateId = idSchema.safeParse(String(formData.get("templateId") ?? ""));
  if (!id.success || !templateId.success) {
    return fail("That question is not valid.");
  }

  try {
    await updateTemplateQuestion({
      id: id.data,
      ...questionInput(formData),
    });
    revalidateTemplatePages(templateId.data);
    return { ok: true, error: null };
  } catch (error) {
    return fail(
      actionError(error, "Could not update the question. Is Postgres running?"),
    );
  }
}

export async function deleteTemplateQuestionAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/templates");
  }

  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  const templateId = idSchema.safeParse(String(formData.get("templateId") ?? ""));
  if (!id.success) {
    return fail("That question is not valid.");
  }

  try {
    await deleteTemplateQuestion(id.data);
    revalidateTemplatePages(templateId.success ? templateId.data : undefined);
    return { ok: true, error: null };
  } catch (error) {
    return fail(
      actionError(error, "Could not delete the question. Is Postgres running?"),
    );
  }
}

export async function moveTemplateQuestionAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/templates");
  }

  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  const templateId = idSchema.safeParse(String(formData.get("templateId") ?? ""));
  const direction = String(formData.get("direction") ?? "");
  if (!id.success || (direction !== "up" && direction !== "down")) {
    return fail("That move is not valid.");
  }

  try {
    await moveTemplateQuestion({ id: id.data, direction });
    revalidateTemplatePages(templateId.success ? templateId.data : undefined);
    return { ok: true, error: null };
  } catch (error) {
    return fail(
      actionError(error, "Could not reorder the question. Is Postgres running?"),
    );
  }
}

function questionFields(formData: FormData, templateId: string) {
  return {
    templateId,
    ...questionInput(formData),
  };
}

function questionInput(formData: FormData) {
  return {
    prompt: String(formData.get("prompt") ?? ""),
    type: String(formData.get("type") ?? ""),
    required: parseRequired(formData.get("required")),
    min: String(formData.get("min") ?? "1"),
    max: String(formData.get("max") ?? "5"),
    minLabel: String(formData.get("minLabel") ?? ""),
    maxLabel: String(formData.get("maxLabel") ?? ""),
    choices: String(formData.get("choices") ?? ""),
  };
}

function actionError(error: unknown, fallback: string) {
  if (
    error instanceof TemplateValidationError ||
    error instanceof TemplateConflictError ||
    error instanceof TemplateEmptyError ||
    error instanceof TemplateNotFoundError ||
    error instanceof TemplateQuestionNotFoundError
  ) {
    return error.message;
  }
  return fallback;
}
