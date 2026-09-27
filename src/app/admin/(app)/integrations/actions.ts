"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ApiKeyNotFoundError,
  ApiKeyValidationError,
  createApiKey,
  revokeApiKey,
} from "@/db/api-keys";
import { hasAdminSession } from "@/lib/admin";

export type IntegrationActionState = {
  ok: boolean;
  error: string | null;
  secret: string | null;
} | null;

const idSchema = z.string().uuid();

function fail(error: string): IntegrationActionState {
  return { ok: false, error, secret: null };
}

async function requireSession() {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin/integrations");
  }
}

export async function createApiKeyAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  await requireSession();
  try {
    const created = await createApiKey(String(formData.get("name") ?? ""));
    revalidatePath("/admin/integrations");
    return { ok: true, error: null, secret: created.secret };
  } catch (error) {
    if (error instanceof ApiKeyValidationError) {
      return fail(error.message);
    }
    return fail("Could not create that key. Is Postgres running?");
  }
}

export async function revokeApiKeyAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  await requireSession();
  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    return fail("That key is not valid.");
  }
  try {
    await revokeApiKey(id.data);
    revalidatePath("/admin/integrations");
    return { ok: true, error: null, secret: null };
  } catch (error) {
    if (error instanceof ApiKeyNotFoundError || error instanceof ApiKeyValidationError) {
      return fail(error.message);
    }
    return fail("Could not revoke that key. Is Postgres running?");
  }
}
