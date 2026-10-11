"use server";

import { revalidatePath } from "next/cache";
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
import { readWorkspaceWriter, type AdminSessionUser } from "@/lib/admin";
import { VIEW_ONLY_MESSAGE } from "@/lib/admin-role";

export type IntegrationActionState = {
  ok: boolean;
  error: string | null;
  secret: string | null;
} | null;

const idSchema = z.string().uuid();

function fail(error: string): IntegrationActionState {
  return { ok: false, error, secret: null };
}

async function requireActor(): Promise<
  { actor: AdminSessionUser } | { error: IntegrationActionState }
> {
  const actor = await readWorkspaceWriter("/admin/integrations");
  if (!actor) {
    return { error: fail(VIEW_ONLY_MESSAGE) };
  }
  return { actor };
}

export async function createApiKeyAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const gate = await requireActor();
  if ("error" in gate) {
    return gate.error;
  }
  const actor = gate.actor;
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
  const gate = await requireActor();
  if ("error" in gate) {
    return gate.error;
  }
  const actor = gate.actor;
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
  const gate = await requireActor();
  if ("error" in gate) {
    return gate.error;
  }
  const actor = gate.actor;
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
