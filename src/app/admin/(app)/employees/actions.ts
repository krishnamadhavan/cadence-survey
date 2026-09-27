"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { EmployeeMoveError, importEmployeesFromCsv, reassignEmployees } from "@/db/employees";
import { getAdminSessionUser, hasAdminSession } from "@/lib/admin";

export type ImportState = {
  created: number;
  updated: number;
  errors: { line: number; message: string }[];
} | null;

const MAX_BYTES = 1024 * 1024;
const idSchema = z.string().uuid();

export type MoveState = {
  ok: boolean;
  error: string | null;
  moved: number;
  teamName: string | null;
} | null;

export async function reassignEmployeesAction(
  _prev: MoveState,
  formData: FormData,
): Promise<MoveState> {
  const actor = await getAdminSessionUser();
  if (!actor) {
    redirect("/admin/login?next=/admin/employees");
  }
  const teamId = idSchema.safeParse(String(formData.get("teamId") ?? ""));
  const employeeIds = formData
    .getAll("employeeId")
    .map((value) => String(value))
    .filter((value) => idSchema.safeParse(value).success);
  if (!teamId.success) {
    return { ok: false, error: "Pick a team.", moved: 0, teamName: null };
  }
  if (employeeIds.length === 0) {
    return { ok: false, error: "Select at least one person.", moved: 0, teamName: null };
  }
  try {
    const result = await reassignEmployees({
      employeeIds,
      teamId: teamId.data,
      actor: { id: actor.id, email: actor.email },
    });
    revalidatePath("/admin/employees");
    revalidatePath("/admin/org-chart");
    revalidatePath("/admin/managers");
    revalidatePath("/admin/audit-log");
    return { ok: true, error: null, moved: result.moved, teamName: result.teamName };
  } catch (error) {
    if (error instanceof EmployeeMoveError) {
      return { ok: false, error: error.message, moved: 0, teamName: null };
    }
    return {
      ok: false,
      error: "Could not move those people. Is Postgres running?",
      moved: 0,
      teamName: null,
    };
  }
}

export async function importEmployees(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/employees");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return {
      created: 0,
      updated: 0,
      errors: [{ line: 1, message: "Choose a CSV file to upload." }],
    };
  }

  if (file.size > MAX_BYTES) {
    return {
      created: 0,
      updated: 0,
      errors: [{ line: 1, message: "File is larger than 1 MB." }],
    };
  }

  try {
    const result = await importEmployeesFromCsv(await file.text());
    revalidatePath("/admin/employees");
    return result;
  } catch {
    return {
      created: 0,
      updated: 0,
      errors: [
        {
          line: 1,
          message: "Could not import employees. Is Postgres running?",
        },
      ],
    };
  }
}
