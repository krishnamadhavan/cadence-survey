import Redis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as {
  redis?: Redis;
};

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
  });

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export async function pingRedis(): Promise<boolean> {
  const reply = await redis.ping();
  return reply === "PONG";
}
