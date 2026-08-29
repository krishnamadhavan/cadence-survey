"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { submitSurveyResponse } from "@/lib/submit-response";

export type SubmitState = {
  error: string;
} | null;

function submittedCookie(token: string) {
  return `cadence_submitted_${token}`;
}

function readIp(headerStore: Headers): string {
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headerStore.get("x-real-ip") ?? "unknown";
}

export async function submitSurvey(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    return { error: "Missing survey." };
  }

  const incoming = [...formData.entries()]
    .filter(([key]) => key.startsWith("q_"))
    .map(([key, value]) => ({
      questionId: key.slice(2),
      value: typeof value === "string" ? value : "",
    }));

  const headerStore = await headers();
  const result = await submitSurveyResponse(token, incoming, readIp(headerStore));

  if (!result.ok) {
    return { error: result.error };
  }

  const jar = await cookies();
  jar.set(submittedCookie(token), "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(`/s/${token}/thanks`);
}
