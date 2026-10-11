import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { findActiveApiKey } from "@/db/api-keys";
import { db } from "@/db/client";
import { admins } from "@/db/schema";
import {
  adminLandingPath,
  coerceAdminRole,
  VIEW_ONLY_MESSAGE,
  type AdminRole,
} from "@/lib/admin-role";
import { readBearerToken } from "@/lib/bearer";
import {
  SESSION_COOKIE,
  SessionStoreUnavailable,
  readAdminSession,
} from "@/lib/session";

export { readBearerToken };
export { VIEW_ONLY_MESSAGE };

export type AdminSessionUser = {
  id: string;
  email: string;
  role: AdminRole;
};

export async function getAdminSessionUser(): Promise<AdminSessionUser | null> {
  try {
    const jar = await cookies();
    const session = await readAdminSession(jar.get(SESSION_COOKIE)?.value);
    if (!session) {
      return null;
    }
    try {
      const [admin] = await db
        .select({ id: admins.id, email: admins.email, role: admins.role })
        .from(admins)
        .where(eq(admins.id, session.adminId))
        .limit(1);
      if (!admin) {
        return null;
      }
      return {
        id: admin.id,
        email: admin.email,
        role: coerceAdminRole(admin.role),
      };
    } catch (error) {
      if (error instanceof SessionStoreUnavailable) {
        return null;
      }
      return { id: session.adminId, email: "Admin", role: "viewer" };
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

export async function readWorkspaceWriter(
  loginNext: string,
): Promise<AdminSessionUser | null> {
  const actor = await getAdminSessionUser();
  if (!actor) {
    redirect(`/admin/login?next=${encodeURIComponent(loginNext)}`);
  }
  if (actor.role !== "admin") {
    return null;
  }
  return actor;
}

export async function landingPathForAdmin(
  adminId: string,
  rawNext: string | null,
): Promise<string> {
  let role: AdminRole = "viewer";
  try {
    const [admin] = await db
      .select({ role: admins.role })
      .from(admins)
      .where(eq(admins.id, adminId))
      .limit(1);
    if (admin) {
      role = coerceAdminRole(admin.role);
    }
  } catch {
    role = "viewer";
  }
  return adminLandingPath(role, rawNext);
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

async function roleForAdmin(adminId: string): Promise<AdminRole | null> {
  try {
    const [admin] = await db
      .select({ role: admins.role })
      .from(admins)
      .where(eq(admins.id, adminId))
      .limit(1);
    if (!admin) {
      return null;
    }
    return coerceAdminRole(admin.role);
  } catch (error) {
    if (error instanceof SessionStoreUnavailable) {
      throw error;
    }
    return "viewer";
  }
}

export async function requestMayWrite(request: Request): Promise<boolean> {
  const bearer = readBearerToken(request.headers.get("authorization"));
  if (bearer) {
    const session = await readAdminSession(bearer);
    if (session) {
      const role = await roleForAdmin(session.adminId);
      if (role) {
        return role === "admin";
      }
    } else if (await findActiveApiKey(bearer)) {
      return true;
    }
  }
  const user = await getAdminSessionUser();
  return user?.role === "admin";
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

export async function requireWorkspaceWriterApi(
  request: Request,
): Promise<NextResponse | null> {
  const denied = await requireAdminApi(request);
  if (denied) {
    return denied;
  }
  try {
    if (await requestMayWrite(request)) {
      return null;
    }
    return NextResponse.json({ error: VIEW_ONLY_MESSAGE }, { status: 403 });
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
