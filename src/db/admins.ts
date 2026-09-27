import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { admins } from "@/db/schema";
import { normalizeEmail } from "@/lib/email";
import { hashAdminPassword } from "@/lib/password";
import { destroySessionsForAdmin } from "@/lib/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

export class AdminValidationError extends Error {}
export class AdminConflictError extends Error {}
export class AdminNotFoundError extends Error {}

export type AdminAccount = {
  id: string;
  email: string;
  createdAt: string;
};

export async function listAdmins(): Promise<AdminAccount[]> {
  const rows = await db
    .select({
      id: admins.id,
      email: admins.email,
      createdAt: admins.createdAt,
    })
    .from(admins)
    .orderBy(asc(admins.email));
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createAdmin(input: {
  email: string;
  password: string;
}): Promise<AdminAccount> {
  const email = normalizeEmail(input.email);
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    throw new AdminValidationError("Enter a valid email address.");
  }
  if (input.password.length < PASSWORD_MIN || input.password.length > PASSWORD_MAX) {
    throw new AdminValidationError("Password must be 8–200 characters.");
  }

  const passwordHash = await hashAdminPassword(input.password);
  try {
    const [row] = await db
      .insert(admins)
      .values({ email, passwordHash })
      .returning({
        id: admins.id,
        email: admins.email,
        createdAt: admins.createdAt,
      });
    if (!row) {
      throw new AdminValidationError("Could not add that admin.");
    }
    return {
      id: row.id,
      email: row.email,
      createdAt: row.createdAt.toISOString(),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdminConflictError("An admin with that email already exists.");
    }
    if (error instanceof AdminValidationError) {
      throw error;
    }
    throw error;
  }
}

export async function deleteAdmin(input: {
  id: string;
  actorId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: admins.id })
      .from(admins)
      .for("update");
    const block = adminDeletionBlock(
      rows.map((row) => row.id),
      input.id,
      input.actorId,
    );
    if (block === "missing") {
      throw new AdminNotFoundError("That admin is gone.");
    }
    if (block === "self") {
      throw new AdminValidationError("You can't remove the account you're signed in as.");
    }
    if (block === "last") {
      throw new AdminValidationError("Keep at least one admin.");
    }
    await tx.delete(admins).where(eq(admins.id, input.id));
  });
  try {
    await destroySessionsForAdmin(input.id);
  } catch {
    // The account row is already gone, so a later request cannot stay signed in.
  }
}

export function adminDeletionBlock(
  ids: string[],
  id: string,
  actorId: string,
): "missing" | "self" | "last" | null {
  if (!ids.includes(id)) {
    return "missing";
  }
  if (id === actorId) {
    return "self";
  }
  if (ids.length <= 1) {
    return "last";
  }
  return null;
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
