import { NextResponse } from "next/server";
import { z } from "zod";
import { readLoginClientIp } from "@/lib/client-ip";
import { env } from "@/lib/env";
import {
  ADMIN_LOGIN_CODE_INVALID,
  ADMIN_LOGIN_CODE_REQUIRED,
  ADMIN_LOGIN_CODE_REUSED,
  ADMIN_LOGIN_INVALID,
  gateAdminPassword,
} from "@/lib/admin-login";
import { limitAdminLogin } from "@/lib/rate-limit";
import {
  SESSION_COOKIE,
  SessionStoreUnavailable,
  sessionCookieOptions,
} from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  code: z.string().optional(),
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
    const limited = await limitAdminLogin(
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

  try {
    const gate = await gateAdminPassword({
      email: parsed.data.email,
      password: parsed.data.password,
      code: parsed.data.code ?? null,
    });
    if (gate.status === "invalid") {
      return NextResponse.json({ error: ADMIN_LOGIN_INVALID }, { status: 401 });
    }
    if (gate.status === "code_required") {
      return NextResponse.json({ error: ADMIN_LOGIN_CODE_REQUIRED }, { status: 401 });
    }
    if (gate.status === "code_reused") {
      return NextResponse.json({ error: ADMIN_LOGIN_CODE_REUSED }, { status: 401 });
    }
    if (gate.status === "code_invalid") {
      return NextResponse.json({ error: ADMIN_LOGIN_CODE_INVALID }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, gate.token, sessionCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof SessionStoreUnavailable) {
      return NextResponse.json(
        { error: "Could not start a session. Is Redis running?" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Could not reach Postgres. Is Docker running?" },
      { status: 503 },
    );
  }
}
