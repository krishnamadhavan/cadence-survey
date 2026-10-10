import { and, eq, isNull, lt, or } from "drizzle-orm";
import { recordAudit } from "@/db/audit-log";
import { db } from "@/db/client";
import { admins } from "@/db/schema";
import {
  formatTotpSecret,
  generateTotpSecret,
  matchTotpCode,
  totpKeyUri,
} from "@/lib/totp";

export class AdminTotpStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminTotpStateError";
  }
}

export type AdminTotpProfile =
  | { status: "off" }
  | { status: "on" }
  | {
      status: "pending";
      manualKey: string;
      otpauthUrl: string;
    };

type TotpRow = {
  email: string;
  totpSecret: string | null;
  totpEnabled: boolean;
  totpLastStep: number | null;
};

export type TotpCodeStatus =
  | "ok"
  | "invalid"
  | "reused"
  | "off"
  | "missing"
  | "already_on"
  | "not_pending";

async function loadTotp(adminId: string): Promise<TotpRow | null> {
  const [row] = await db
    .select({
      email: admins.email,
      totpSecret: admins.totpSecret,
      totpEnabled: admins.totpEnabled,
      totpLastStep: admins.totpLastStep,
    })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);
  return row ?? null;
}

function freshStep(
  secret: string | null,
  lastStep: number | null,
  code: string,
  nowMs: number,
): { status: "invalid" | "reused" } | { status: "match"; step: number } {
  if (!secret) {
    return { status: "invalid" };
  }
  const step = matchTotpCode(secret, code, nowMs);
  if (step === null) {
    return { status: "invalid" };
  }
  if (lastStep !== null && step <= lastStep) {
    return { status: "reused" };
  }
  return { status: "match", step };
}

function newerThanLastStep(step: number) {
  return or(isNull(admins.totpLastStep), lt(admins.totpLastStep, step));
}

export async function readAdminTotpProfile(adminId: string): Promise<AdminTotpProfile> {
  const row = await loadTotp(adminId);
  if (!row || !row.totpSecret) {
    return { status: "off" };
  }
  if (row.totpEnabled) {
    return { status: "on" };
  }
  return {
    status: "pending",
    manualKey: formatTotpSecret(row.totpSecret),
    otpauthUrl: totpKeyUri(row.email, row.totpSecret),
  };
}

export async function beginAdminTotp(adminId: string): Promise<{ secret: string }> {
  const row = await loadTotp(adminId);
  if (!row) {
    throw new AdminTotpStateError("That admin is gone.");
  }
  if (row.totpEnabled) {
    throw new AdminTotpStateError("Authenticator app is already on.");
  }
  if (row.totpSecret) {
    return { secret: row.totpSecret };
  }

  const secret = generateTotpSecret();
  const updated = await db
    .update(admins)
    .set({ totpSecret: secret, totpLastStep: null })
    .where(
      and(
        eq(admins.id, adminId),
        eq(admins.totpEnabled, false),
        isNull(admins.totpSecret),
      ),
    )
    .returning({ id: admins.id });
  if (updated.length > 0) {
    return { secret };
  }

  const again = await loadTotp(adminId);
  if (again?.totpSecret && !again.totpEnabled) {
    return { secret: again.totpSecret };
  }
  throw new AdminTotpStateError("Authenticator app is already on.");
}

export async function restartAdminTotp(adminId: string): Promise<{ secret: string }> {
  const secret = generateTotpSecret();
  const updated = await db
    .update(admins)
    .set({ totpSecret: secret, totpLastStep: null })
    .where(and(eq(admins.id, adminId), eq(admins.totpEnabled, false)))
    .returning({ id: admins.id });
  if (updated.length > 0) {
    return { secret };
  }

  const row = await loadTotp(adminId);
  if (!row) {
    throw new AdminTotpStateError("That admin is gone.");
  }
  throw new AdminTotpStateError(
    "Turn off the authenticator app before starting over.",
  );
}

export async function confirmAdminTotp(
  adminId: string,
  code: string,
  nowMs = Date.now(),
): Promise<TotpCodeStatus> {
  const row = await loadTotp(adminId);
  if (!row) {
    return "missing";
  }
  if (row.totpEnabled) {
    return "already_on";
  }
  if (!row.totpSecret) {
    return "not_pending";
  }
  const secret = row.totpSecret;

  const matched = freshStep(secret, row.totpLastStep, code, nowMs);
  if (matched.status !== "match") {
    return matched.status;
  }

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(admins)
      .set({ totpEnabled: true, totpLastStep: matched.step })
      .where(
        and(
          eq(admins.id, adminId),
          eq(admins.totpEnabled, false),
          eq(admins.totpSecret, secret),
          newerThanLastStep(matched.step),
        ),
      )
      .returning({ id: admins.id });
    if (updated.length === 0) {
      return "reused";
    }
    await recordAudit(
      {
        actorId: adminId,
        actorEmail: row.email,
        action: "admin.totp_enabled",
        summary: "Turned on an authenticator app",
      },
      tx,
    );
    return "ok";
  });
}

export async function consumeAdminTotp(
  adminId: string,
  code: string,
  nowMs = Date.now(),
): Promise<Extract<TotpCodeStatus, "ok" | "invalid" | "reused" | "off">> {
  const row = await loadTotp(adminId);
  if (!row?.totpEnabled || !row.totpSecret) {
    return "off";
  }

  const matched = freshStep(row.totpSecret, row.totpLastStep, code, nowMs);
  if (matched.status !== "match") {
    return matched.status;
  }

  const updated = await db
    .update(admins)
    .set({ totpLastStep: matched.step })
    .where(
      and(
        eq(admins.id, adminId),
        eq(admins.totpEnabled, true),
        eq(admins.totpSecret, row.totpSecret),
        newerThanLastStep(matched.step),
      ),
    )
    .returning({ id: admins.id });
  return updated.length > 0 ? "ok" : "reused";
}

export async function disableAdminTotp(
  adminId: string,
  code: string,
  nowMs = Date.now(),
): Promise<TotpCodeStatus> {
  const row = await loadTotp(adminId);
  if (!row) {
    return "missing";
  }
  if (!row.totpEnabled || !row.totpSecret) {
    return "off";
  }
  const secret = row.totpSecret;

  const matched = freshStep(secret, row.totpLastStep, code, nowMs);
  if (matched.status !== "match") {
    return matched.status;
  }

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(admins)
      .set({ totpSecret: null, totpEnabled: false, totpLastStep: null })
      .where(
        and(
          eq(admins.id, adminId),
          eq(admins.totpEnabled, true),
          eq(admins.totpSecret, secret),
          newerThanLastStep(matched.step),
        ),
      )
      .returning({ id: admins.id });
    if (updated.length === 0) {
      return "reused";
    }
    await recordAudit(
      {
        actorId: adminId,
        actorEmail: row.email,
        action: "admin.totp_disabled",
        summary: "Turned off an authenticator app",
      },
      tx,
    );
    return "ok";
  });
}
