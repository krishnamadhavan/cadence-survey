"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { importEmployeesFromCsv } from "@/db/employees";
import { hasAdminSession } from "@/lib/admin";

export type ImportState = {
  created: number;
  updated: number;
  errors: { line: number; message: string }[];
} | null;

const MAX_BYTES = 1024 * 1024;

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
