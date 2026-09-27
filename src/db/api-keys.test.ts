import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { test } from "node:test";
import {
  ApiKeyNotFoundError,
  ApiKeyValidationError,
  createApiKey,
  findActiveApiKey,
  listApiKeys,
  revokeApiKey,
} from "@/db/api-keys";
import { db, pg } from "@/db/client";
import { apiKeys } from "@/db/schema";

const stamp = Date.now();
const nameA = `QA key ${stamp}`;
const nameB = `QA key b ${stamp}`;

test("creates a secret once, lists only a prefix, and rejects a revoked key", async (t) => {
  const ids: string[] = [];
  t.after(async () => {
    if (ids.length > 0) {
      await db.delete(apiKeys).where(inArray(apiKeys.id, ids));
    }
    await pg.end({ timeout: 2 });
  });

  await assert.rejects(() => createApiKey("   "), ApiKeyValidationError);

  const created = await createApiKey(`  ${nameA}  `);
  ids.push(created.id);
  assert.equal(created.name, nameA);
  assert.match(created.secret, /^ck_[0-9a-f]{48}$/);
  assert.ok(created.secret.startsWith(created.prefix.replace("…", "")));

  const listed = await listApiKeys();
  const row = listed.find((key) => key.id === created.id);
  assert.ok(row);
  assert.equal(row?.prefix, created.prefix);
  assert.equal("secret" in (row ?? {}), false);
  assert.equal(row?.revokedAt, null);

  const [stored] = await db
    .select({ keyHash: apiKeys.keyHash })
    .from(apiKeys)
    .where(eq(apiKeys.id, created.id))
    .limit(1);
  assert.ok(stored);
  assert.notEqual(stored.keyHash, created.secret);

  const active = await findActiveApiKey(created.secret);
  assert.equal(active?.id, created.id);
  const used = await listApiKeys();
  assert.ok(used.find((key) => key.id === created.id)?.lastUsedAt);

  assert.equal(await findActiveApiKey("ck_not-a-real-key"), null);
  assert.equal(await findActiveApiKey("session-token"), null);

  await revokeApiKey(created.id);
  assert.equal(await findActiveApiKey(created.secret), null);
  assert.ok((await listApiKeys()).find((key) => key.id === created.id)?.revokedAt);
  await assert.rejects(() => revokeApiKey(created.id), ApiKeyValidationError);

  const second = await createApiKey(nameB);
  ids.push(second.id);
  assert.notEqual(second.secret, created.secret);

  await assert.rejects(
    () => revokeApiKey("00000000-0000-4000-8000-000000000000"),
    ApiKeyNotFoundError,
  );
});
