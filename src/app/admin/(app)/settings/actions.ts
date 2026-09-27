"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAudit } from "@/db/audit-log";
import { getAnonymityFloor, setAnonymityFloor, SettingsValidationError } from "@/db/settings";
import { getAdminSessionUser } from "@/lib/admin";

export type SettingsActionState = {
  ok: boolean;
  error: string | null;
} | null;

function fail(error: string): SettingsActionState {
  return { ok: false, error };
}

export async function setAnonymityFloorAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const actor = await getAdminSessionUser();
  if (!actor) {
    redirect("/admin/login?next=/admin/settings");
  }
  const raw = String(formData.get("anonymityFloor") ?? "").trim();
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(value)) {
    return fail("The anonymity floor must be a whole number from 3 to 50.");
  }
  try {
    const previous = await getAnonymityFloor();
    await setAnonymityFloor(value);
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "anonymity_floor.changed",
      summary: `Changed the anonymity floor from ${previous} to ${value}`,
    });
    revalidatePath("/admin", "layout");
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      return fail(error.message);
    }
    return fail("Could not save settings. Is Postgres running?");
  }
}
