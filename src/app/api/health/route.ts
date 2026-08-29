import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { pingRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    postgres: false,
    redis: false,
  };

  try {
    await db.execute(sql`select 1`);
    checks.postgres = true;
  } catch {
    checks.postgres = false;
  }

  try {
    checks.redis = await pingRedis();
  } catch {
    checks.redis = false;
  }

  const ok = checks.postgres && checks.redis;

  return NextResponse.json(
    {
      ok,
      checks,
    },
    { status: ok ? 200 : 503 },
  );
}
