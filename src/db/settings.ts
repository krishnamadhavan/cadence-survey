import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { recordAudit } from "@/db/audit-log";
import { db } from "@/db/client";
import { workspaceSettings } from "@/db/schema";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";
import {
  newWebhookSecret,
  parseWebhookUrl,
  WebhookUrlError,
} from "@/lib/webhook-url";
import {
  detectWorkspaceLogo,
  isWorkspaceLogoContentType,
  workspaceLogoValidationMessage,
  type WorkspaceLogoContentType,
} from "@/lib/workspace-logo";

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

export type WorkspaceLogoFile = {
  bytes: Uint8Array;
  contentType: WorkspaceLogoContentType;
};

export async function getWorkspaceLogoStamp(): Promise<number | null> {
  const [row] = await db
    .select({
      contentType: workspaceSettings.logoContentType,
      updatedAt: workspaceSettings.logoUpdatedAt,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.id, SETTINGS_ID))
    .limit(1);
  if (!row?.updatedAt || !row.contentType || !isWorkspaceLogoContentType(row.contentType)) {
    return null;
  }
  return row.updatedAt.getTime();
}

export async function getWorkspaceLogo(): Promise<WorkspaceLogoFile | null> {
  const [row] = await db
    .select({
      logo: workspaceSettings.logo,
      contentType: workspaceSettings.logoContentType,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.id, SETTINGS_ID))
    .limit(1);
  if (!row?.logo || row.logo.byteLength === 0 || !row.contentType) {
    return null;
  }
  if (!isWorkspaceLogoContentType(row.contentType)) {
    return null;
  }
  return { bytes: row.logo, contentType: row.contentType };
}

export async function setWorkspaceLogo(input: {
  bytes: Uint8Array;
  contentType: string;
  actor: { id: string; email: string };
}): Promise<void> {
  const invalid = workspaceLogoValidationMessage(input.bytes);
  if (invalid) {
    throw new SettingsValidationError(invalid);
  }
  const detected = detectWorkspaceLogo(input.bytes);
  if (!detected || input.contentType !== detected) {
    throw new SettingsValidationError("Use a PNG, JPEG, or WebP image.");
  }
  const now = new Date();
  const logo = Uint8Array.from(input.bytes);
  await db.transaction(async (tx) => {
    await tx
      .insert(workspaceSettings)
      .values({
        id: SETTINGS_ID,
        logo,
        logoContentType: detected,
        logoUpdatedAt: now,
      })
      .onConflictDoUpdate({
        target: workspaceSettings.id,
        set: {
          logo,
          logoContentType: detected,
          logoUpdatedAt: now,
        },
      });
    await recordAudit(
      {
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        action: "workspace_logo.changed",
        summary: "Uploaded a workspace logo",
      },
      tx,
    );
  });
}

export async function clearWorkspaceLogo(input: {
  actor: { id: string; email: string };
}): Promise<void> {
  await db.transaction(async (tx) => {
    const cleared = await tx
      .update(workspaceSettings)
      .set({
        logo: null,
        logoContentType: null,
        logoUpdatedAt: null,
      })
      .where(
        and(
          eq(workspaceSettings.id, SETTINGS_ID),
          or(
            isNotNull(workspaceSettings.logo),
            isNotNull(workspaceSettings.logoContentType),
            isNotNull(workspaceSettings.logoUpdatedAt),
          ),
        ),
      )
      .returning({ id: workspaceSettings.id });
    if (cleared.length === 0) {
      return;
    }
    await recordAudit(
      {
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        action: "workspace_logo.changed",
        summary: "Removed the workspace logo",
      },
      tx,
    );
  });
}
