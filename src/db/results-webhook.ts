import { getSurveyResults } from "@/db/results";
import { getResultsWebhookUrl } from "@/db/settings";
import {
  postResultsWebhook,
  pulseClosedPayload,
} from "@/lib/results-webhook";

type SendWebhook = (input: { url: string; body: string }) => Promise<void>;

let sendWebhook: SendWebhook = ({ url, body }) => postResultsWebhook(url, body);

export function setResultsWebhookSendForTests(send: SendWebhook | null) {
  sendWebhook = send ?? ((input) => postResultsWebhook(input.url, input.body));
}

export async function deliverClosedPulseWebhooks(
  tokens: string[],
  options?: { floor?: number },
): Promise<void> {
  const pending = [...new Set(tokens.filter(Boolean))].sort();
  if (pending.length === 0) {
    return;
  }
  const url = await getResultsWebhookUrl();
  if (!url) {
    return;
  }
  for (const token of pending) {
    try {
      const results = await getSurveyResults(token, {
        floor: options?.floor,
        skipSchedule: true,
      });
      if (!results || results.survey.status !== "closed") {
        continue;
      }
      await sendWebhook({
        url,
        body: JSON.stringify(
          pulseClosedPayload(results, new Date().toISOString()),
        ),
      });
    } catch (error) {
      console.error(
        "Results webhook failed",
        token,
        error instanceof Error ? error.name : "Error",
      );
    }
  }
}
