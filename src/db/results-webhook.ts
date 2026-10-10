import { getSurveyResults } from "@/db/results";
import { getResultsWebhook } from "@/db/settings";
import {
  postResultsWebhook,
  pulseClosedPayload,
  signResultsWebhook,
} from "@/lib/results-webhook";

type SendWebhook = (input: {
  url: string;
  body: string;
  signature: string;
}) => Promise<void>;

let sendWebhook: SendWebhook = (input) => postResultsWebhook(input);

export function setResultsWebhookSendForTests(send: SendWebhook | null) {
  sendWebhook = send ?? ((input) => postResultsWebhook(input));
}

export async function deliverClosedPulseWebhooks(
  tokens: string[],
  options?: { floor?: number },
): Promise<void> {
  const pending = [...new Set(tokens.filter(Boolean))].sort();
  if (pending.length === 0) {
    return;
  }
  const webhook = await getResultsWebhook();
  if (!webhook) {
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
      const body = JSON.stringify(
        pulseClosedPayload(results, new Date().toISOString()),
      );
      await sendWebhook({
        url: webhook.url,
        body,
        signature: signResultsWebhook(
          webhook.secret,
          body,
          Math.floor(Date.now() / 1000),
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
