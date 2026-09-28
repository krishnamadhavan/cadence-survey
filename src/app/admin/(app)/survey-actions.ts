"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addSurveyQuestion,
  deleteSurveyQuestion,
  moveSurveyQuestion,
  renameSurvey,
  duplicateSurvey,
  setSurveySchedule,
  setSurveyStatus,
  SurveyNotFoundError,
  SurveyQuestionNotFoundError,
  SurveyStatusError,
  SurveyValidationError,
  updateSurveyQuestion,
} from "@/db/surveys";
import { hasAdminSession } from "@/lib/admin";
import { parseSurveyCadence } from "@/lib/survey-cadence";
import { parseRequired } from "@/lib/template-question";
import type { SurveyStatus } from "@/db/schema";

const questionIdSchema = z.string().uuid();

export type SurveyActionState = {
  ok: boolean;
  error: string | null;
} | null;

function fail(error: string): SurveyActionState {
  return { ok: false, error };
}

export async function setSurveyStatusAction(
  _prev: SurveyActionState,
  formData: FormData,
): Promise<SurveyActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin");
  }

  const token = String(formData.get("token") ?? "").trim();
  const status = String(formData.get("status") ?? "") as SurveyStatus;
  if (!token || (status !== "open" && status !== "closed")) {
    return fail("That status change is not valid.");
  }

  try {
    const updated = await setSurveyStatus({ token, status });
    revalidateSurveyPaths(updated.publicToken);
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof SurveyStatusError || error instanceof SurveyNotFoundError) {
      return fail(error.message);
    }
    return fail("Could not update the pulse. Is Postgres running?");
  }
}

export async function renameSurveyAction(
  _prev: SurveyActionState,
  formData: FormData,
): Promise<SurveyActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin");
  }
  const token = readToken(formData);
  if (!token) {
    return fail("That pulse is not valid.");
  }
  try {
    const updated = await renameSurvey({
      token,
      title: String(formData.get("title") ?? ""),
    });
    revalidateSurveyPaths(updated.publicToken);
    return { ok: true, error: null };
  } catch (error) {
    return fail(actionError(error, "Could not rename the pulse. Is Postgres running?"));
  }
}

export async function addSurveyQuestionAction(
  _prev: SurveyActionState,
  formData: FormData,
): Promise<SurveyActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin");
  }
  const token = readToken(formData);
  if (!token) {
    return fail("That pulse is not valid.");
  }
  try {
    await addSurveyQuestion({ token, ...questionInput(formData) });
    revalidateSurveyPaths(token);
    return { ok: true, error: null };
  } catch (error) {
    return fail(actionError(error, "Could not add the question. Is Postgres running?"));
  }
}

export async function updateSurveyQuestionAction(
  _prev: SurveyActionState,
  formData: FormData,
): Promise<SurveyActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin");
  }
  const token = readToken(formData);
  const id = questionIdSchema.safeParse(String(formData.get("id") ?? ""));
  if (!token || !id.success) {
    return fail("That question is not valid.");
  }
  try {
    await updateSurveyQuestion({ token, id: id.data, ...questionInput(formData) });
    revalidateSurveyPaths(token);
    return { ok: true, error: null };
  } catch (error) {
    return fail(actionError(error, "Could not update the question. Is Postgres running?"));
  }
}

export async function deleteSurveyQuestionAction(
  _prev: SurveyActionState,
  formData: FormData,
): Promise<SurveyActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin");
  }
  const token = readToken(formData);
  const id = questionIdSchema.safeParse(String(formData.get("id") ?? ""));
  if (!token || !id.success) {
    return fail("That question is not valid.");
  }
  try {
    await deleteSurveyQuestion({ token, id: id.data });
    revalidateSurveyPaths(token);
    return { ok: true, error: null };
  } catch (error) {
    return fail(actionError(error, "Could not delete the question. Is Postgres running?"));
  }
}

export async function moveSurveyQuestionAction(
  _prev: SurveyActionState,
  formData: FormData,
): Promise<SurveyActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin");
  }
  const token = readToken(formData);
  const id = questionIdSchema.safeParse(String(formData.get("id") ?? ""));
  const direction = String(formData.get("direction") ?? "");
  if (!token || !id.success || (direction !== "up" && direction !== "down")) {
    return fail("That move is not valid.");
  }
  try {
    await moveSurveyQuestion({ token, id: id.data, direction });
    revalidateSurveyPaths(token);
    return { ok: true, error: null };
  } catch (error) {
    return fail(actionError(error, "Could not reorder the question. Is Postgres running?"));
  }
}

function readToken(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!token || token.length > 80) {
    return null;
  }
  return token;
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
    error instanceof SurveyValidationError ||
    error instanceof SurveyStatusError ||
    error instanceof SurveyNotFoundError ||
    error instanceof SurveyQuestionNotFoundError
  ) {
    return error.message;
  }
  return fallback;
}

export async function duplicateSurveyAction(
  _prev: SurveyActionState,
  formData: FormData,
): Promise<SurveyActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin");
  }
  const id = z.string().uuid().safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    return fail("That pulse is not valid.");
  }
  try {
    const created = await duplicateSurvey(id.data);
    revalidatePath("/admin");
    revalidatePath(`/admin/s/${created.publicToken}`);
    redirect(`/admin/s/${created.publicToken}`);
  } catch (error) {
    if (error instanceof SurveyNotFoundError || error instanceof SurveyValidationError) {
      return fail(error.message);
    }
    if (isRedirectError(error)) {
      throw error;
    }
    return fail("Could not duplicate that pulse. Is Postgres running?");
  }
}

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

export async function setSurveyScheduleAction(
  _prev: SurveyActionState,
  formData: FormData,
): Promise<SurveyActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin");
  }
  const token = readToken(formData);
  if (!token) {
    return fail("That pulse is not valid.");
  }
  const clearing = String(formData.get("clear") ?? "") === "1";
  const opensRaw = String(formData.get("opensAt") ?? "").trim();
  const closesRaw = String(formData.get("closesAt") ?? "").trim();
  const opensAt = clearing || !opensRaw ? null : new Date(opensRaw);
  const closesAt = clearing || !closesRaw ? null : new Date(closesRaw);
  const cadence = clearing ? null : parseSurveyCadence(String(formData.get("cadence") ?? ""));
  if ((opensAt && Number.isNaN(opensAt.getTime())) || (closesAt && Number.isNaN(closesAt.getTime()))) {
    return fail("Those dates are not valid.");
  }
  try {
    await setSurveySchedule({ token, opensAt, closesAt, cadence });
    revalidateSurveyPaths(token);
    return { ok: true, error: null };
  } catch (error) {
    return fail(actionError(error, "Could not schedule this pulse. Is Postgres running?"));
  }
}

function revalidateSurveyPaths(token: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/reports");
  revalidatePath(`/admin/s/${token}`);
  revalidatePath(`/admin/reports/${token}`);
  revalidatePath(`/s/${token}`);
}
