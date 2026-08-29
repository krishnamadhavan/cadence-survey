"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, tokensMatch } from "@/lib/admin";
import { env } from "@/lib/env";

export type LoginState = {
  error: string;
} | null;

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/admin")) {
    return "/admin";
  }
  return raw;
}

export async function loginAdmin(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!env.ADMIN_TOKEN) {
    return { error: "ADMIN_TOKEN is not set in .env" };
  }

  const token = String(formData.get("token") ?? "");
  if (!tokensMatch(token, env.ADMIN_TOKEN)) {
    return { error: "That token is not right." };
  }

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, env.ADMIN_TOKEN, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function logoutAdmin() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/admin/login");
}
