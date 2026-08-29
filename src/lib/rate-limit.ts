import { redis } from "@/lib/redis";

const WINDOW_SECONDS = 10 * 60;
const MAX_HITS = 8;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

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
