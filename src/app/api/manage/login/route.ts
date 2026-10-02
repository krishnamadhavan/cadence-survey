import { NextResponse } from "next/server";
import { z } from "zod";
import { readLoginClientIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { verifyManagerCredentials } from "@/lib/manager-auth";
import { limitManagerLogin } from "@/lib/rate-limit";
import {
  MANAGER_SESSION_COOKIE,
  createManagerSession,
  sessionCookieOptions,
} from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const limited = await limitManagerLogin(
      parsed.data.email,
      readLoginClientIp(request.headers, env.TRUST_PROXY === "true"),
    );
    if (!limited.ok) {
      return NextResponse.json(
        { error: `Too many sign-in attempts. Try again in ${limited.retryAfterSeconds}s.` },
        { status: 429 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Could not reach Redis. Is Docker running?" },
      { status: 503 },
    );
  }

  let manager;
  try {
    manager = await verifyManagerCredentials(parsed.data.email, parsed.data.password);
  } catch {
    return NextResponse.json(
      { error: "Could not reach Postgres. Is Docker running?" },
      { status: 503 },
    );
  }

  if (!manager) {
    return NextResponse.json({ error: "Email or password is not right." }, { status: 401 });
  }

  try {
    const token = await createManagerSession(manager.id);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(MANAGER_SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch {
    return NextResponse.json(
      { error: "Could not start a session. Is Redis running?" },
      { status: 503 },
    );
  }
}
