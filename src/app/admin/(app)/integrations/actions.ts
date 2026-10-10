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
import { recordAudit } from "@/db/audit-log";
import {
  getResultsWebhookUrl,
  rotateResultsWebhookSecret,
  setResultsWebhookUrl,
  SettingsValidationError,
} from "@/db/settings";
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
    const created = await createApiKey(String(formData.get("name") ?? ""), {
      actorId: actor.id,
      actorEmail: actor.email,
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
    await revokeApiKey(id.data, {
      actorId: actor.id,
      actorEmail: actor.email,
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

export async function setResultsWebhookAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const actor = await requireActor();
  const intent = String(formData.get("intent") ?? "save");
  if (intent === "rotate") {
    try {
      await rotateResultsWebhookSecret();
      await recordAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        action: "results_webhook.changed",
        summary: "Rotated the results webhook secret",
      });
      revalidatePath("/admin/integrations");
      revalidatePath("/admin/audit-log");
      return { ok: true, error: null, secret: null };
    } catch (error) {
      if (error instanceof SettingsValidationError) {
        return fail(error.message);
      }
      return fail("Could not save the webhook. Is Postgres running?");
    }
  }
  const raw = intent === "clear" ? "" : String(formData.get("webhookUrl") ?? "");
  try {
    const previous = await getResultsWebhookUrl();
    const next = await setResultsWebhookUrl(raw);
    if (previous !== next) {
      await recordAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        action: "results_webhook.changed",
        summary: next
          ? previous
            ? "Updated the results webhook"
            : "Set the results webhook"
          : "Cleared the results webhook",
      });
    }
    revalidatePath("/admin/integrations");
    revalidatePath("/admin/audit-log");
    return { ok: true, error: null, secret: null };
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      return fail(error.message);
    }
    return fail("Could not save the webhook. Is Postgres running?");
  }
}
