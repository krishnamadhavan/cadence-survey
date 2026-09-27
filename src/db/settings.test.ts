import "./../lib/load-env";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SettingsValidationError,
  getAnonymityFloor,
  setAnonymityFloor,
} from "@/db/settings";
import { pg } from "@/db/client";

test("reads and updates the anonymity floor", async (t) => {
  const original = await getAnonymityFloor();
  t.after(async () => {
    await setAnonymityFloor(original);
    await pg.end({ timeout: 2 });
  });

  assert.equal(await setAnonymityFloor(5), 5);
  assert.equal(await getAnonymityFloor(), 5);

  await assert.rejects(() => setAnonymityFloor(1), SettingsValidationError);
  await assert.rejects(() => setAnonymityFloor(2), SettingsValidationError);
  await assert.rejects(() => setAnonymityFloor(51), SettingsValidationError);
  await assert.rejects(() => setAnonymityFloor(3.5), SettingsValidationError);
  assert.equal(await getAnonymityFloor(), 5);
});
