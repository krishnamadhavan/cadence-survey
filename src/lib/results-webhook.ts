import { createHmac, timingSafeEqual } from "node:crypto";
import type { SurveyResults } from "@/db/results";

export const PULSE_CLOSED_EVENT = "pulse.closed";
export const WEBHOOK_SIGNATURE_HEADER = "Cadence-Signature";
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const WEBHOOK_TIMEOUT_MS = 5_000;

export type PulseClosedPayload = {
  event: typeof PULSE_CLOSED_EVENT;
  sentAt: string;
  survey: SurveyResults["survey"];
  teams: SurveyResults["teams"];
  questions: SurveyResults["questions"];
};

export function pulseClosedPayload(
  results: SurveyResults,
  sentAt: string,
): PulseClosedPayload {
  return {
    event: PULSE_CLOSED_EVENT,
    sentAt,
    survey: results.survey,
    teams: results.teams,
    questions: results.questions,
  };
}

/** `t=<unix seconds>,v1=<hex>` over `timestamp + "." + raw body`. */
export function signResultsWebhook(
  secret: string,
  body: string,
  timestamp: number,
): string {
  if (!Number.isInteger(timestamp)) {
    throw new TypeError("Webhook timestamp must be whole seconds.");
  }
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

export function verifyResultsWebhook(input: {
  secret: string;
  body: string;
  header: string | null;
  now: number;
  toleranceSeconds?: number;
}): boolean {
  if (!input.secret || !input.header || !Number.isInteger(input.now)) {
    return false;
  }
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(input.header.trim());
  if (!match) {
    return false;
  }
  const timestampPart = match[1] ?? "";
  const given = match[2] ?? "";
  const timestamp = Number(timestampPart);
  if (!Number.isInteger(timestamp)) {
    return false;
  }
  const expected = createHmac("sha256", input.secret)
    .update(`${timestampPart}.${input.body}`)
    .digest("hex");
  const givenBytes = Buffer.from(given);
  const expectedBytes = Buffer.from(expected);
  if (givenBytes.length !== expectedBytes.length) {
    return false;
  }
  if (!timingSafeEqual(givenBytes, expectedBytes)) {
    return false;
  }
  const tolerance = input.toleranceSeconds ?? WEBHOOK_SIGNATURE_TOLERANCE_SECONDS;
  return Math.abs(input.now - timestamp) <= tolerance;
}

export async function postResultsWebhook(
  input: { url: string; body: string; signature: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await fetchImpl(input.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "cadence-survey",
        [WEBHOOK_SIGNATURE_HEADER]: input.signature,
      },
      body: input.body,
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
