export class WebhookUrlError extends Error {}

const MAX_WEBHOOK_URL_LENGTH = 2000;

/** Empty input clears the webhook. Anything else must be an absolute http(s) URL. */
export function parseWebhookUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (value.length > MAX_WEBHOOK_URL_LENGTH) {
    throw new WebhookUrlError("That webhook URL is too long.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebhookUrlError(
      "Enter a webhook URL that starts with http:// or https://.",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebhookUrlError(
      "Enter a webhook URL that starts with http:// or https://.",
    );
  }
  if (!url.hostname) {
    throw new WebhookUrlError(
      "Enter a webhook URL that starts with http:// or https://.",
    );
  }
  if (url.username || url.password) {
    throw new WebhookUrlError(
      "The webhook URL cannot include a username or password.",
    );
  }
  return url.toString();
}
