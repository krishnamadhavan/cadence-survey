import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { findActiveApiKey } from "@/db/api-keys";
import { db } from "@/db/client";
import { admins } from "@/db/schema";
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
  name: string | null;
} | null> {
  try {
    const jar = await cookies();
    const session = await readAdminSession(jar.get(SESSION_COOKIE)?.value);
    if (!session) {
      return null;
    }
    try {
      const [admin] = await db
        .select({ id: admins.id, email: admins.email, name: admins.name })
        .from(admins)
        .where(eq(admins.id, session.adminId))
        .limit(1);
      if (!admin) {
        return null;
      }
      const name = admin.name?.trim() ?? "";
      return { id: admin.id, email: admin.email, name: name || null };
    } catch (error) {
      if (error instanceof SessionStoreUnavailable) {
        return null;
      }
      return { id: session.adminId, email: "Admin", name: null };
    }
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
    if (!session) {
      return false;
    }
    const [admin] = await db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.id, session.adminId))
      .limit(1);
    return Boolean(admin);
  } catch (error) {
    if (error instanceof SessionStoreUnavailable) {
      return false;
    }
    throw error;
  }
}

export async function isAdminRequest(request: Request): Promise<boolean> {
  const bearer = readBearerToken(request.headers.get("authorization"));
  if (bearer) {
    const session = await readAdminSession(bearer);
    if (session) {
      const [admin] = await db
        .select({ id: admins.id })
        .from(admins)
        .where(eq(admins.id, session.adminId))
        .limit(1);
      if (admin) {
        return true;
      }
    } else if (await findActiveApiKey(bearer)) {
      return true;
    }
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
