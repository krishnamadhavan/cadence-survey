import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "node:test";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import {
  AdminTotpStateError,
  beginAdminTotp,
  confirmAdminTotp,
  consumeAdminTotp,
  disableAdminTotp,
  readAdminTotpProfile,
  restartAdminTotp,
} from "@/db/admin-totp";
import { createAdmin, listAdmins } from "@/db/admins";
import { db, pg } from "@/db/client";
import { admins, auditEvents } from "@/db/schema";
import {
  ADMIN_LOGIN_CODE_INVALID,
  ADMIN_LOGIN_CODE_REQUIRED,
  ADMIN_LOGIN_CODE_REUSED,
  ADMIN_LOGIN_INVALID,
} from "@/lib/admin-login";
import { verifyAdminCredentials } from "@/lib/auth";
import { adminLoginEmailKey } from "@/lib/login-keys";
import { redis } from "@/lib/redis";
import { destroySessionsForAdmin } from "@/lib/session";
import { createTotpChallenge, destroyTotpChallenge, readTotpChallenge } from "@/lib/totp-challenge";
import { totpCode, totpStep } from "@/lib/totp";

const stamp = Date.now();
const email = `totp-${stamp}@cadence.test`;
const password = "a-long-password";
const now = 1_700_000_000_000;

function codeAt(secret: string, nowMs: number, delta = 0): string {
  const code = totpCode(secret, totpStep(nowMs) + delta);
  if (!code) {
    throw new Error("missing authenticator code");
  }
  return code;
}

function wrongCode(secret: string, nowMs: number): string {
  const banned = new Set([
    codeAt(secret, nowMs, -1),
    codeAt(secret, nowMs, 0),
    codeAt(secret, nowMs, 1),
  ]);
  for (const candidate of ["000000", "111111", "222222", "999999"]) {
    if (!banned.has(candidate)) {
      return candidate;
    }
  }
  throw new Error("expected a code outside the window");
}

function hasSessionCookie(response: Response): boolean {
  const parts = [response.headers.get("set-cookie") ?? ""];
  if (typeof response.headers.getSetCookie === "function") {
    parts.push(...response.headers.getSetCookie());
  }
  return parts.join("\n").includes("cadence_session=");
}

async function postLogin(body: Record<string, string>) {
  return adminLogin(
    new Request("http://localhost/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

test("authenticator setup and login codes stay on the admin who turned them on", async (t) => {
  let adminId = "";
  t.after(async () => {
    try {
      await db.delete(auditEvents).where(eq(auditEvents.actorEmail, email));
      await db.delete(admins).where(eq(admins.email, email));
      if (adminId) {
        await destroySessionsForAdmin(adminId);
      }
      await redis.del(adminLoginEmailKey(email));
    } finally {
      await pg.end({ timeout: 2 });
      await redis.quit();
    }
  });

  await redis.del(adminLoginEmailKey(email));
  const created = await createAdmin({ email, password });
  adminId = created.id;
  assert.equal((await verifyAdminCredentials(email, password))?.totpEnabled, false);
  const listed = (await listAdmins()).find((account) => account.id === adminId);
  assert.ok(listed);
  assert.equal("totpSecret" in listed, false);

  const before = await postLogin({ email, password, code: "000000" });
  assert.equal(before.status, 200);
  assert.equal(hasSessionCookie(before), true);
  await redis.del(adminLoginEmailKey(email));

  const first = await beginAdminTotp(adminId);
  const same = await beginAdminTotp(adminId);
  assert.equal(same.secret, first.secret);
  const pending = await readAdminTotpProfile(adminId);
  assert.equal(pending.status, "pending");
  if (pending.status === "pending") {
    assert.equal(pending.manualKey.replaceAll(" ", ""), first.secret);
    assert.match(pending.otpauthUrl, new RegExp(`secret=${first.secret}`));
  }
  assert.equal(await confirmAdminTotp(adminId, wrongCode(first.secret, now), now), "invalid");
  const [stillOff] = await db
    .select({ totpEnabled: admins.totpEnabled, totpSecret: admins.totpSecret })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);
  assert.equal(stillOff?.totpEnabled, false);
  assert.equal(stillOff?.totpSecret, first.secret);

  const restarted = await restartAdminTotp(adminId);
  assert.notEqual(restarted.secret, first.secret);
  assert.equal(
    await confirmAdminTotp(adminId, codeAt(first.secret, now), now),
    "invalid",
  );
  assert.equal(
    await confirmAdminTotp(adminId, codeAt(restarted.secret, now), now),
    "ok",
  );
  const on = await readAdminTotpProfile(adminId);
  assert.equal(on.status, "on");
  assert.equal(JSON.stringify(on).includes(restarted.secret), false);
  assert.equal(JSON.stringify(on).includes(first.secret), false);
  assert.equal((await verifyAdminCredentials(email, password))?.totpEnabled, true);
  await assert.rejects(() => beginAdminTotp(adminId), AdminTotpStateError);
  await assert.rejects(() => restartAdminTotp(adminId), AdminTotpStateError);

  const [enabled] = await db
    .select({
      totpSecret: admins.totpSecret,
      totpEnabled: admins.totpEnabled,
      totpLastStep: admins.totpLastStep,
    })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);
  assert.equal(enabled?.totpEnabled, true);
  assert.equal(enabled?.totpSecret, restarted.secret);
  assert.equal(enabled?.totpLastStep, totpStep(now));

  assert.equal(
    await consumeAdminTotp(adminId, wrongCode(restarted.secret, now), now),
    "invalid",
  );
  assert.equal(
    await consumeAdminTotp(adminId, codeAt(restarted.secret, now), now),
    "reused",
  );
  assert.equal(
    await consumeAdminTotp(adminId, codeAt(restarted.secret, now, -1), now),
    "reused",
  );
  assert.equal(
    await consumeAdminTotp(adminId, codeAt(restarted.secret, now, 1), now + 30_000),
    "ok",
  );
  assert.equal(
    await disableAdminTotp(adminId, codeAt(restarted.secret, now, 1), now + 30_000),
    "reused",
  );
  assert.equal(
    await disableAdminTotp(adminId, wrongCode(restarted.secret, now + 60_000), now + 60_000),
    "invalid",
  );
  const [stillOn] = await db
    .select({ totpEnabled: admins.totpEnabled, totpSecret: admins.totpSecret })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);
  assert.equal(stillOn?.totpEnabled, true);
  assert.equal(stillOn?.totpSecret, restarted.secret);
  assert.equal(
    await disableAdminTotp(adminId, codeAt(restarted.secret, now, 2), now + 60_000),
    "ok",
  );
  const [cleared] = await db
    .select({
      totpEnabled: admins.totpEnabled,
      totpSecret: admins.totpSecret,
      totpLastStep: admins.totpLastStep,
    })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);
  assert.equal(cleared?.totpEnabled, false);
  assert.equal(cleared?.totpSecret, null);
  assert.equal(cleared?.totpLastStep, null);
  assert.equal((await verifyAdminCredentials(email, password))?.totpEnabled, false);

  const liveNow = Date.now() - 120_000;
  const live = await beginAdminTotp(adminId);
  assert.equal(await confirmAdminTotp(adminId, codeAt(live.secret, liveNow), liveNow), "ok");

  const wrongPassword = await postLogin({ email, password: "nope-nope-nope" });
  assert.equal(wrongPassword.status, 401);
  assert.equal(hasSessionCookie(wrongPassword), false);
  assert.equal((await wrongPassword.json()).error, ADMIN_LOGIN_INVALID);

  const missingCode = await postLogin({ email, password });
  assert.equal(missingCode.status, 401);
  assert.equal(hasSessionCookie(missingCode), false);
  assert.equal((await missingCode.json()).error, ADMIN_LOGIN_CODE_REQUIRED);

  const wrong = await postLogin({ email, password, code: wrongCode(live.secret, Date.now()) });
  assert.equal(wrong.status, 401);
  assert.equal(hasSessionCookie(wrong), false);
  assert.equal((await wrong.json()).error, ADMIN_LOGIN_CODE_INVALID);

  const current = codeAt(live.secret, Date.now());
  const signedIn = await postLogin({ email, password, code: current });
  assert.equal(signedIn.status, 200);
  assert.equal(hasSessionCookie(signedIn), true);

  const reused = await postLogin({ email, password, code: current });
  assert.equal(reused.status, 401);
  assert.equal(hasSessionCookie(reused), false);
  assert.equal((await reused.json()).error, ADMIN_LOGIN_CODE_REUSED);

  const audits = await db
    .select({ action: auditEvents.action, summary: auditEvents.summary })
    .from(auditEvents)
    .where(eq(auditEvents.actorEmail, email));
  const secrets = [first.secret, restarted.secret, live.secret];
  assert.deepEqual(
    audits.map((row) => row.action).sort(),
    ["admin.totp_disabled", "admin.totp_enabled", "admin.totp_enabled"],
  );
  for (const row of audits) {
    assert.equal(
      row.summary === "Turned on an authenticator app" ||
        row.summary === "Turned off an authenticator app",
      true,
    );
    for (const secret of secrets) {
      assert.equal(row.summary.includes(secret), false);
    }
  }

  const challenge = await createTotpChallenge({ adminId, email });
  assert.deepEqual(await readTotpChallenge(challenge), { adminId, email });
  const replaced = await createTotpChallenge({ adminId, email }, challenge);
  assert.equal(await readTotpChallenge(challenge), null);
  assert.deepEqual(await readTotpChallenge(replaced), { adminId, email });
  await destroyTotpChallenge(replaced);
  assert.equal(await readTotpChallenge(replaced), null);
  assert.equal(await readTotpChallenge("short"), null);
});
