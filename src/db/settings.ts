import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaceSettings } from "@/db/schema";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";
import {
  newWebhookSecret,
  parseWebhookUrl,
  WebhookUrlError,
} from "@/lib/webhook-url";

export const ANONYMITY_FLOOR_MIN = 3;
export const ANONYMITY_FLOOR_MAX = 50;
const SETTINGS_ID = "default";

export class SettingsValidationError extends Error {}

export async function getAnonymityFloor(): Promise<number> {
  const [row] = await db
    .select({ anonymityFloor: workspaceSettings.anonymityFloor })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.id, SETTINGS_ID))
    .limit(1);
  const floor = row?.anonymityFloor;
  if (!Number.isInteger(floor) || floor < ANONYMITY_FLOOR_MIN) {
    return MIN_TEAM_RESPONSES;
  }
  return floor;
}

export async function setAnonymityFloor(value: number): Promise<number> {
  if (!Number.isInteger(value) || value < ANONYMITY_FLOOR_MIN || value > ANONYMITY_FLOOR_MAX) {
    throw new SettingsValidationError(
      `The anonymity floor must be a whole number from ${ANONYMITY_FLOOR_MIN} to ${ANONYMITY_FLOOR_MAX}.`,
    );
  }
  await db
    .insert(workspaceSettings)
    .values({ id: SETTINGS_ID, anonymityFloor: value })
    .onConflictDoUpdate({
      target: workspaceSettings.id,
      set: { anonymityFloor: value },
    });
  return value;
}

export type ResultsWebhook = {
  url: string;
  secret: string;
};

async function readResultsWebhook(): Promise<{
  url: string | null;
  secret: string | null;
}> {
  const [row] = await db
    .select({
      webhookUrl: workspaceSettings.webhookUrl,
      webhookSecret: workspaceSettings.webhookSecret,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.id, SETTINGS_ID))
    .limit(1);
  const url = row?.webhookUrl?.trim() ?? "";
  const secret = row?.webhookSecret?.trim() ?? "";
  return {
    url: url.length > 0 ? url : null,
    secret: secret.length > 0 ? secret : null,
  };
}

async function writeResultsWebhook(
  url: string | null,
  secret: string | null,
): Promise<void> {
  await db
    .insert(workspaceSettings)
    .values({ id: SETTINGS_ID, webhookUrl: url, webhookSecret: secret })
    .onConflictDoUpdate({
      target: workspaceSettings.id,
      set: { webhookUrl: url, webhookSecret: secret },
    });
}

export async function getResultsWebhookUrl(): Promise<string | null> {
  return (await getResultsWebhook())?.url ?? null;
}

export async function getResultsWebhook(): Promise<ResultsWebhook | null> {
  const current = await readResultsWebhook();
  if (!current.url) {
    return null;
  }
  if (current.secret) {
    return { url: current.url, secret: current.secret };
  }
  const secret = newWebhookSecret();
  const [minted] = await db
    .update(workspaceSettings)
    .set({ webhookSecret: secret })
    .where(
      and(eq(workspaceSettings.id, SETTINGS_ID), isNull(workspaceSettings.webhookSecret)),
    )
    .returning({ webhookSecret: workspaceSettings.webhookSecret });
  if (minted?.webhookSecret) {
    return { url: current.url, secret: minted.webhookSecret };
  }
  const again = await readResultsWebhook();
  if (!again.url || !again.secret) {
    return null;
  }
  return { url: again.url, secret: again.secret };
}

export async function setResultsWebhookUrl(raw: string): Promise<string | null> {
  let url: string | null;
  try {
    url = parseWebhookUrl(raw);
  } catch (error) {
    if (error instanceof WebhookUrlError) {
      throw new SettingsValidationError(error.message);
    }
    throw error;
  }
  const current = await readResultsWebhook();
  const secret = url ? (current.secret ?? newWebhookSecret()) : null;
  await writeResultsWebhook(url, secret);
  return url;
}

export async function rotateResultsWebhookSecret(): Promise<void> {
  const current = await readResultsWebhook();
  if (!current.url) {
    throw new SettingsValidationError(
      "Set a webhook URL before changing its secret.",
    );
  }
  await writeResultsWebhook(current.url, newWebhookSecret());
}

export async function restoreResultsWebhook(
  value: ResultsWebhook | null,
): Promise<void> {
  await writeResultsWebhook(value?.url ?? null, value?.secret ?? null);
}
