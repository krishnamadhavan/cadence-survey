import { cookies } from "next/headers";
import { SESSION_COOKIE, readAdminSession } from "@/lib/session";

function readBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export async function hasAdminSession(): Promise<boolean> {
  const jar = await cookies();
  const session = await readAdminSession(jar.get(SESSION_COOKIE)?.value);
  return session !== null;
}

export async function isAdminRequest(request: Request): Promise<boolean> {
  const bearer = readBearerToken(request.headers.get("authorization"));
  if (await readAdminSession(bearer)) {
    return true;
  }
  return hasAdminSession();
}
