"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/db/audit-log";
import {
  ApiKeyNotFoundError,
  ApiKeyValidationError,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "@/db/api-keys";
import { getAdminSessionUser } from "@/lib/admin";

export type IntegrationActionState = {
  ok: boolean;
  error: string | null;
  secret: string | null;
} | null;

const idSchema = z.string().uuid();

function fail(error: string): IntegrationActionState {
  return { ok: false, error, secret: null };
}

async function requireActor() {
  const actor = await getAdminSessionUser();
  if (!actor) {
    redirect("/admin/login?next=/admin/integrations");
  }
  return actor;
}

export async function createApiKeyAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const actor = await requireActor();
  try {
    const created = await createApiKey(String(formData.get("name") ?? ""));
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "api_key.created",
      summary: `Created API key ${created.name}`,
    });
    revalidatePath("/admin/integrations");
    revalidatePath("/admin/audit-log");
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
  const actor = await requireActor();
  const id = idSchema.safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    return fail("That key is not valid.");
  }
  try {
    const existing = (await listApiKeys()).find((key) => key.id === id.data);
    await revokeApiKey(id.data);
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "api_key.revoked",
      summary: `Revoked API key ${existing?.name ?? id.data}`,
    });
    revalidatePath("/admin/integrations");
    revalidatePath("/admin/audit-log");
    return { ok: true, error: null, secret: null };
  } catch (error) {
    if (error instanceof ApiKeyNotFoundError || error instanceof ApiKeyValidationError) {
      return fail(error.message);
    }
    return fail("Could not revoke that key. Is Postgres running?");
  }
}
