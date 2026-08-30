import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const ADMIN_COOKIE = "cadence_admin";

export function tokensMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < provided.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export function readBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export function isValidAdminToken(token: string | null | undefined): boolean {
  if (!env.ADMIN_TOKEN || !token) {
    return false;
  }
  return tokensMatch(token, env.ADMIN_TOKEN);
}

export async function hasAdminSession(): Promise<boolean> {
  const jar = await cookies();
  return isValidAdminToken(jar.get(ADMIN_COOKIE)?.value);
}

export async function isAdminRequest(request: Request): Promise<boolean> {
  const bearer = readBearerToken(request.headers.get("authorization"));
  if (isValidAdminToken(bearer)) {
    return true;
  }
  return hasAdminSession();
}

export function adminUnauthorized() {
  return { error: "Unauthorized" } as const;
}
