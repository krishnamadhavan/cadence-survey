import { and, eq } from "drizzle-orm";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
} from "@/db/admins";
import { recordAudit } from "@/db/audit-log";
import { db } from "@/db/client";
import { admins } from "@/db/schema";
import {
  adminProfileSummary,
  displayNameFromRow,
  parseAdminEmail,
  parseDisplayName,
} from "@/lib/admin-account";
import { hashAdminPassword, matchAdminPassword } from "@/lib/password";
import { destroyOtherAdminSessions } from "@/lib/session";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

export async function readOwnAdminAccount(id: string): Promise<{
  id: string;
  email: string;
  name: string | null;
}> {
  const [row] = await db
    .select({ id: admins.id, email: admins.email, name: admins.name })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);
  if (!row) {
    throw new AdminNotFoundError("That admin is gone.");
  }
  return {
    id: row.id,
    email: row.email,
    name: displayNameFromRow(row.name),
  };
}

export async function updateOwnAdminAccount(input: {
  id: string;
  name: unknown;
  email: unknown;
}): Promise<{
  email: string;
  previousEmail: string;
  name: string | null;
  previousName: string | null;
  changed: boolean;
}> {
  const parsedName = parseDisplayName(input.name);
  if (!parsedName.ok) {
    throw new AdminValidationError(parsedName.error);
  }
  const parsedEmail = parseAdminEmail(input.email);
  if (!parsedEmail.ok) {
    throw new AdminValidationError(parsedEmail.error);
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: admins.id, email: admins.email, name: admins.name })
      .from(admins)
      .where(eq(admins.id, input.id))
      .for("update");
    if (!current) {
      throw new AdminNotFoundError("That admin is gone.");
    }
    const previousName = displayNameFromRow(current.name);
    if (current.email === parsedEmail.email && previousName === parsedName.name) {
      return {
        email: current.email,
        previousEmail: current.email,
        name: previousName,
        previousName,
        changed: false,
      };
    }
    const next = {
      email: parsedEmail.email,
      previousEmail: current.email,
      name: parsedName.name,
      previousName,
      changed: true,
    };
    try {
      await tx
        .update(admins)
        .set({ email: parsedEmail.email, name: parsedName.name })
        .where(eq(admins.id, input.id));
      await recordAudit(
        {
          actorId: input.id,
          actorEmail: current.email,
          action: "admin.profile_updated",
          summary: adminProfileSummary(next),
        },
        tx,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AdminConflictError("An admin with that email already exists.");
      }
      throw error;
    }
    return next;
  });
}

export async function changeOwnAdminPassword(input: {
  id: string;
  currentPassword: string;
  nextPassword: string;
  confirmPassword: string;
  keepSessionToken?: string | null;
}): Promise<{ email: string }> {
  if (!input.currentPassword) {
    throw new AdminValidationError("Enter your current password.");
  }
  if (input.nextPassword !== input.confirmPassword) {
    throw new AdminValidationError("New password and confirmation do not match.");
  }
  if (
    input.nextPassword.length < PASSWORD_MIN ||
    input.nextPassword.length > PASSWORD_MAX
  ) {
    throw new AdminValidationError("Password must be 8–200 characters.");
  }

  const [current] = await db
    .select({
      id: admins.id,
      email: admins.email,
      passwordHash: admins.passwordHash,
    })
    .from(admins)
    .where(eq(admins.id, input.id))
    .limit(1);
  if (!current) {
    throw new AdminNotFoundError("That admin is gone.");
  }
  const matches = await matchAdminPassword(input.currentPassword, current.passwordHash);
  if (!matches) {
    throw new AdminValidationError("Current password is wrong.");
  }
  if (input.currentPassword === input.nextPassword) {
    throw new AdminValidationError("Choose a different password.");
  }

  const passwordHash = await hashAdminPassword(input.nextPassword);
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(admins)
      .set({ passwordHash })
      .where(and(eq(admins.id, input.id), eq(admins.passwordHash, current.passwordHash)))
      .returning({ email: admins.email });
    if (!row) {
      throw new AdminValidationError("Current password is wrong.");
    }
    await recordAudit(
      {
        actorId: input.id,
        actorEmail: row.email,
        action: "admin.password_changed",
        summary: "Changed password",
      },
      tx,
    );
    return row;
  });

  try {
    await destroyOtherAdminSessions(input.id, input.keepSessionToken ?? null);
  } catch {
    // The new password is already stored. Other sessions stay until they expire if Redis is down.
  }
  return { email: updated.email };
}

function isUniqueViolation(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      (current as { code: unknown }).code === "23505"
    ) {
      return true;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause: unknown }).cause
        : undefined;
  }
  return false;
}
