import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaceSettings } from "@/db/schema";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";

export const ANONYMITY_FLOOR_MIN = 2;
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
