import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";

const NAME_MAX = 80;

export class ApiKeyValidationError extends Error {}
export class ApiKeyNotFoundError extends Error {}

export type ApiKeyListItem = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreatedApiKey = {
  id: string;
  name: string;
  prefix: string;
  secret: string;
};

export async function listApiKeys(): Promise<ApiKeyListItem[]> {
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }));
}

export async function createApiKey(name: string): Promise<CreatedApiKey> {
  const label = name.trim();
  if (!label || label.length > NAME_MAX) {
    throw new ApiKeyValidationError("Name must be 1–80 characters.");
  }
  const secret = `ck_${randomBytes(24).toString("hex")}`;
  const prefix = `${secret.slice(0, 7)}…`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      name: label,
      prefix,
      keyHash: hashApiKey(secret),
    })
    .returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix });
  if (!row) {
    throw new ApiKeyValidationError("Could not create that key.");
  }
  return { ...row, secret };
}

export async function revokeApiKey(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: apiKeys.id, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.id, id))
    .limit(1);
  if (!existing) {
    throw new ApiKeyNotFoundError("That key is gone.");
  }
  if (existing.revokedAt) {
    throw new ApiKeyValidationError("That key is already revoked.");
  }
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)));
}

export async function findActiveApiKey(token: string): Promise<{ id: string } | null> {
  const trimmed = token.trim();
  if (!trimmed.startsWith("ck_")) {
    return null;
  }
  const [row] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(trimmed)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) {
    return null;
  }
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  return { id: row.id };
}

function hashApiKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
