"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { submitSurveyResponse } from "@/lib/submit-response";

export type SubmitState = {
  error: string;
} | null;

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
  const code = String(formData.get("code") ?? "").trim();
  if (!token || !code) {
    return { error: "This link is not valid." };
  }

  const role = String(formData.get("role") ?? "");
  const incoming = [...formData.entries()]
    .filter(([key]) => key.startsWith("q_"))
    .map(([key, value]) => ({
      questionId: key.slice(2),
      value: typeof value === "string" ? value : "",
    }));

  const headerStore = await headers();
  const result = await submitSurveyResponse(
    token,
    incoming,
    readIp(headerStore),
    code,
    role,
  );

  if (!result.ok) {
    return { error: result.error };
  }

  redirect(`/s/${token}/thanks`);
}
