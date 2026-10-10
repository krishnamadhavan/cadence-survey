import { and, eq, isNotNull, or } from "drizzle-orm";
import { recordAudit } from "@/db/audit-log";
import { db } from "@/db/client";
import { workspaceSettings } from "@/db/schema";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";
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
