import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { admins } from "@/db/schema";
import { resolveSessionUser } from "@/lib/admin-user";
import { readBearerToken } from "@/lib/bearer";
import {
  SESSION_COOKIE,
  SessionStoreUnavailable,
  readAdminSession,
} from "@/lib/session";

export { readBearerToken };

export async function getAdminSessionUser(): Promise<{
  id: string;
  email: string;
} | null> {
  try {
    const jar = await cookies();
    const session = await readAdminSession(jar.get(SESSION_COOKIE)?.value);
    if (!session) {
      return null;
    }
    return resolveSessionUser(session.adminId, async () => {
      const [admin] = await db
        .select({ id: admins.id, email: admins.email })
        .from(admins)
        .where(eq(admins.id, session.adminId))
        .limit(1);
      return admin;
    });
  } catch (error) {
    if (error instanceof SessionStoreUnavailable) {
      return null;
    }
    throw error;
  }
}

export async function hasAdminSession(): Promise<boolean> {
  try {
    const jar = await cookies();
    const session = await readAdminSession(jar.get(SESSION_COOKIE)?.value);
    return session !== null;
  } catch (error) {
    if (error instanceof SessionStoreUnavailable) {
      return false;
    }
    throw error;
  }
}

export async function isAdminRequest(request: Request): Promise<boolean> {
  const bearer = readBearerToken(request.headers.get("authorization"));
  if (await readAdminSession(bearer)) {
    return true;
  }
  return hasAdminSession();
}

export async function requireAdminApi(
  request: Request,
): Promise<NextResponse | null> {
  try {
    if (await isAdminRequest(request)) {
      return null;
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch (error) {
    if (error instanceof SessionStoreUnavailable) {
      return NextResponse.json(
        { error: "Session store unavailable. Is Redis running?" },
        { status: 503 },
      );
    }
    throw error;
  }
}
