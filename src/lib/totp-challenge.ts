import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";

export const TOTP_CHALLENGE_COOKIE = "cadence_totp_challenge";
export const TOTP_CHALLENGE_TTL_SECONDS = 5 * 60;

export type TotpChallenge = {
  adminId: string;
  email: string;
};

export function totpChallengeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production" || env.APP_URL.startsWith("https://"),
    path: "/admin/login",
    maxAge: TOTP_CHALLENGE_TTL_SECONDS,
  };
}

export function totpChallengeCookieClearOptions() {
  return {
    ...totpChallengeCookieOptions(),
    maxAge: 0,
  };
}

function challengeKey(token: string): string {
  return `totp:challenge:${token}`;
}

function validToken(token: string): boolean {
  return /^[a-f0-9]{64}$/u.test(token);
}

export async function createTotpChallenge(
  admin: TotpChallenge,
  previousToken?: string | null,
): Promise<string> {
  if (previousToken) {
    await destroyTotpChallenge(previousToken);
  }
  const token = randomBytes(32).toString("hex");
  await redis.set(
    challengeKey(token),
    JSON.stringify({ adminId: admin.adminId, email: admin.email }),
    "EX",
    TOTP_CHALLENGE_TTL_SECONDS,
  );
  return token;
}

export async function readTotpChallenge(
  token: string | null | undefined,
): Promise<TotpChallenge | null> {
  if (!token || !validToken(token)) {
    return null;
  }
  const raw = await redis.get(challengeKey(token));
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Partial<TotpChallenge>;
    if (typeof value.adminId !== "string" || typeof value.email !== "string") {
      return null;
    }
    if (!value.adminId || !value.email) {
      return null;
    }
    return { adminId: value.adminId, email: value.email };
  } catch {
    return null;
  }
}

export async function destroyTotpChallenge(
  token: string | null | undefined,
): Promise<void> {
  if (!token || !validToken(token)) {
    return;
  }
  await redis.del(challengeKey(token));
}
