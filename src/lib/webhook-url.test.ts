import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWebhookUrl, WebhookUrlError } from "./webhook-url";

test("webhook url accepts http and https and treats blank as off", () => {
  assert.equal(parseWebhookUrl("  "), null);
  assert.equal(parseWebhookUrl(""), null);
  assert.equal(
    parseWebhookUrl("https://hooks.example/cadence"),
    "https://hooks.example/cadence",
  );
  assert.equal(
    parseWebhookUrl("http://127.0.0.1:8080/hook"),
    "http://127.0.0.1:8080/hook",
  );
  assert.equal(
    parseWebhookUrl("HTTPS://Hooks.Example/cadence?token=1"),
    "https://hooks.example/cadence?token=1",
  );

  for (const raw of [
    "javascript:alert(1)",
    "ftp://example.com/hook",
    "not a url",
    "https://user:secret@hooks.example/cadence",
  ]) {
    assert.throws(() => parseWebhookUrl(raw), WebhookUrlError);
  }
  assert.throws(
    () => parseWebhookUrl(`https://hooks.example/${"a".repeat(2000)}`),
    WebhookUrlError,
  );
});
