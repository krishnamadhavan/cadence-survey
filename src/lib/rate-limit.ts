import { adminLoginEmailKey, adminLoginIpKey } from "@/lib/login-keys";
import { redis } from "@/lib/redis";

const WINDOW_SECONDS = 10 * 60;
const MAX_HITS = 8;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_HITS = 5;
const LOGIN_IP_MAX_HITS = 20;

async function hitLimit(
  key: string,
  maxHits: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const hits = await redis.incr(key);

  if (hits === 1) {
    await redis.expire(key, windowSeconds);
  }

  const ttl = await redis.ttl(key);
  const remaining = Math.max(0, maxHits - hits);

  return {
    ok: hits <= maxHits,
    remaining,
    retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}

export async function limitAdminLogin(
  email: string,
  ip: string,
): Promise<RateLimitResult> {
  const emailLimit = await hitLimit(
    adminLoginEmailKey(email),
    LOGIN_MAX_HITS,
    LOGIN_WINDOW_SECONDS,
  );
  if (!emailLimit.ok) {
    return emailLimit;
  }

  if (ip === "direct") {
    return emailLimit;
  }

  return hitLimit(adminLoginIpKey(ip), LOGIN_IP_MAX_HITS, LOGIN_WINDOW_SECONDS);
}

export async function limitSurveySubmit(
  token: string,
  ip: string,
): Promise<RateLimitResult> {
  const key = `rl:survey:${token}:${ip}`;
  const hits = await redis.incr(key);

  if (hits === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  const ttl = await redis.ttl(key);
  const remaining = Math.max(0, MAX_HITS - hits);

  return {
    ok: hits <= MAX_HITS,
    remaining,
    retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS,
  };
}
