import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { admins } from "@/db/schema";
import {
  coerceAdminRole,
  parseAdminRole,
  type AdminRole,
} from "@/lib/admin-role";
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
  role: AdminRole;
  createdAt: string;
};

export type AdminAccessRow = {
  id: string;
  role: AdminRole;
};

export async function listAdmins(): Promise<AdminAccount[]> {
  const rows = await db
    .select({
      id: admins.id,
      email: admins.email,
      role: admins.role,
      createdAt: admins.createdAt,
    })
    .from(admins)
    .orderBy(asc(admins.email));
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: coerceAdminRole(row.role),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createAdmin(input: {
  email: string;
  password: string;
  role?: string;
}): Promise<AdminAccount> {
  const email = normalizeEmail(input.email);
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    throw new AdminValidationError("Enter a valid email address.");
  }
  if (input.password.length < PASSWORD_MIN || input.password.length > PASSWORD_MAX) {
    throw new AdminValidationError("Password must be 8–200 characters.");
  }
  const role = resolveRole(input.role);

  const passwordHash = await hashAdminPassword(input.password);
  try {
    const [row] = await db
      .insert(admins)
      .values({ email, passwordHash, role })
      .returning({
        id: admins.id,
        email: admins.email,
        role: admins.role,
        createdAt: admins.createdAt,
      });
    if (!row) {
      throw new AdminValidationError("Could not add that admin.");
    }
    return {
      id: row.id,
      email: row.email,
      role: coerceAdminRole(row.role),
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
      .select({ id: admins.id, role: admins.role })
      .from(admins)
      .for("update");
    const block = adminDeletionBlock(
      rows.map((row) => ({ id: row.id, role: coerceAdminRole(row.role) })),
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
      throw new AdminValidationError("Keep at least one account with full access.");
    }
    await tx.delete(admins).where(eq(admins.id, input.id));
  });
  try {
    await destroySessionsForAdmin(input.id);
  } catch {
    // The account row is already gone, so a later request cannot stay signed in.
  }
}

export async function setAdminRole(input: {
  id: string;
  actorId: string;
  role: string;
}): Promise<{ email: string; role: AdminRole; changed: boolean }> {
  const role = parseAdminRole(input.role);
  if (!role) {
    throw new AdminValidationError("Choose full access or viewer.");
  }
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: admins.id, email: admins.email, role: admins.role })
      .from(admins)
      .for("update");
    const target = rows.find((row) => row.id === input.id);
    if (!target) {
      throw new AdminNotFoundError("That admin is gone.");
    }
    if (input.id === input.actorId) {
      throw new AdminValidationError("You can't change your own access.");
    }
    const current = coerceAdminRole(target.role);
    if (current === role) {
      return { email: target.email, role, changed: false };
    }
    const adminCount = rows.filter((row) => coerceAdminRole(row.role) === "admin").length;
    if (current === "admin" && role === "viewer" && adminCount <= 1) {
      throw new AdminValidationError("Keep at least one account with full access.");
    }
    await tx.update(admins).set({ role }).where(eq(admins.id, input.id));
    return { email: target.email, role, changed: true };
  });
}

export function adminDeletionBlock(
  rows: AdminAccessRow[],
  id: string,
  actorId: string,
): "missing" | "self" | "last" | null {
  const target = rows.find((row) => row.id === id);
  if (!target) {
    return "missing";
  }
  if (id === actorId) {
    return "self";
  }
  const remaining = rows.filter((row) => row.id !== id);
  if (
    remaining.length === 0 ||
    (target.role === "admin" && !remaining.some((row) => row.role === "admin"))
  ) {
    return "last";
  }
  return null;
}

function resolveRole(role: string | undefined): AdminRole {
  if (role == null || role === "") {
    return "admin";
  }
  const parsed = parseAdminRole(role);
  if (!parsed) {
    throw new AdminValidationError("Choose full access or viewer.");
  }
  return parsed;
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
