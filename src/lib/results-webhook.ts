import type { SurveyResults } from "@/db/results";

export const PULSE_CLOSED_EVENT = "pulse.closed";
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

export async function postResultsWebhook(
  url: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "cadence-survey",
      },
      body,
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
