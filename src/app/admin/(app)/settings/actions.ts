"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/db/audit-log";
import {
  clearWorkspaceLogo,
  getAnonymityFloor,
  setAnonymityFloor,
  setWorkspaceLogo,
  SettingsValidationError,
} from "@/db/settings";
import { readWorkspaceWriter } from "@/lib/admin";
import { VIEW_ONLY_MESSAGE } from "@/lib/admin-role";
import {
  detectWorkspaceLogo,
  workspaceLogoValidationMessage,
} from "@/lib/workspace-logo";

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
  const actor = await readWorkspaceWriter("/admin/settings");
  if (!actor) {
    return fail(VIEW_ONLY_MESSAGE);
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

export async function workspaceLogoAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const actor = await readWorkspaceWriter("/admin/settings");
  if (!actor) {
    return fail(VIEW_ONLY_MESSAGE);
  }
  const intent = String(formData.get("intent") ?? "upload");
  try {
    if (intent === "remove") {
      await clearWorkspaceLogo({ actor: { id: actor.id, email: actor.email } });
    } else {
      const file = formData.get("logo");
      if (!(file instanceof File) || file.size === 0) {
        return fail("Use a PNG, JPEG, or WebP image.");
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const detected = detectWorkspaceLogo(bytes);
      if (!detected) {
        return fail(
          workspaceLogoValidationMessage(bytes) ?? "Use a PNG, JPEG, or WebP image.",
        );
      }
      await setWorkspaceLogo({
        bytes,
        contentType: detected,
        actor: { id: actor.id, email: actor.email },
      });
    }
    revalidatePath("/admin/settings");
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      return fail(error.message);
    }
    return fail("Could not save the logo. Is Postgres running?");
  }
}
