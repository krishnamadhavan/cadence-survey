"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  TeamConflictError,
  TeamInUseError,
  TeamNotFoundError,
  TeamValidationError,
  createTeam,
  deleteTeam,
  mergeTeams,
  updateTeam,
} from "@/db/teams";
import { getAdminSessionUser, hasAdminSession } from "@/lib/admin";

export type TeamActionState = {
  ok: boolean;
  error: string | null;
} | null;

const teamIdSchema = z.string().uuid();

function fail(error: string): TeamActionState {
  return { ok: false, error };
}

function revalidateTeamPages() {
  revalidatePath("/admin/teams");
  revalidatePath("/admin/employees");
  revalidatePath("/admin/org-chart");
  revalidatePath("/admin/managers");
  revalidatePath("/admin/action-plans");
  revalidatePath("/admin/audit-log");
}

export async function mergeTeamAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const actor = await getAdminSessionUser();
  if (!actor) {
    redirect("/admin/login?next=/admin/teams");
  }
  const sourceId = teamIdSchema.safeParse(String(formData.get("sourceId") ?? ""));
  const targetId = teamIdSchema.safeParse(String(formData.get("targetId") ?? ""));
  if (!sourceId.success || !targetId.success) {
    return fail("Pick the team to merge into.");
  }
  try {
    await mergeTeams({
      sourceId: sourceId.data,
      targetId: targetId.data,
      actor: { id: actor.id, email: actor.email },
    });
    revalidateTeamPages();
    return { ok: true, error: null };
  } catch (error) {
    if (
      error instanceof TeamValidationError ||
      error instanceof TeamNotFoundError ||
      error instanceof TeamInUseError
    ) {
      return fail(error.message);
    }
    return fail("Could not merge those teams. Is Postgres running?");
  }
}

export async function createTeamAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/teams");
  }

  try {
    await createTeam({
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
    });
    revalidateTeamPages();
    return { ok: true, error: null };
  } catch (error) {
    return fail(actionError(error, "Could not create the team. Is Postgres running?"));
  }
}

export async function updateTeamAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/teams");
  }

  const id = teamIdSchema.safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    return fail("That team is not valid.");
  }

  try {
    await updateTeam({
      id: id.data,
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
    });
    revalidateTeamPages();
    return { ok: true, error: null };
  } catch (error) {
    return fail(actionError(error, "Could not update the team. Is Postgres running?"));
  }
}

export async function deleteTeamAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/teams");
  }

  const id = teamIdSchema.safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    return fail("That team is not valid.");
  }

  try {
    await deleteTeam(id.data);
    revalidateTeamPages();
    return { ok: true, error: null };
  } catch (error) {
    return fail(actionError(error, "Could not delete the team. Is Postgres running?"));
  }
}

function actionError(error: unknown, fallback: string) {
  if (
    error instanceof TeamValidationError ||
    error instanceof TeamConflictError ||
    error instanceof TeamInUseError ||
    error instanceof TeamNotFoundError
  ) {
    return error.message;
  }
  return fallback;
}
