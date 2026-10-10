import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WORKSPACE_LOGO_MAX_BYTES,
  detectWorkspaceLogo,
  workspaceLogoValidationMessage,
} from "./workspace-logo";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("detects png, jpeg, and webp by magic bytes", () => {
  assert.equal(detectWorkspaceLogo(PNG), "image/png");
  assert.equal(workspaceLogoValidationMessage(PNG), null);

  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(detectWorkspaceLogo(jpeg), "image/jpeg");

  const webp = new Uint8Array(12);
  webp.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(detectWorkspaceLogo(webp), "image/webp");
});

test("rejects svg, html, gif, empty, truncated, and oversized files", () => {
  const svg = new TextEncoder().encode(
    "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
  );
  const html = new TextEncoder().encode("<!DOCTYPE html><html></html>");
  const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const wave = new Uint8Array(12);
  wave.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);

  for (const bytes of [svg, html, gif, wave, new Uint8Array(), PNG.subarray(0, 7)]) {
    assert.equal(detectWorkspaceLogo(bytes), null);
    assert.equal(workspaceLogoValidationMessage(bytes), "Use a PNG, JPEG, or WebP image.");
  }

  assert.equal(detectWorkspaceLogo(Uint8Array.from([0xff, 0xd8])), null);
  assert.equal(detectWorkspaceLogo(webpTooShort()), null);

  const oversized = new Uint8Array(WORKSPACE_LOGO_MAX_BYTES + 1);
  oversized.set(PNG.subarray(0, 8));
  assert.equal(detectWorkspaceLogo(oversized), null);
  assert.equal(workspaceLogoValidationMessage(oversized), "Logo must be 512 KB or smaller.");

  const capped = new Uint8Array(WORKSPACE_LOGO_MAX_BYTES);
  capped.set(PNG.subarray(0, 8));
  assert.equal(detectWorkspaceLogo(capped), "image/png");
});

function webpTooShort(): Uint8Array {
  const bytes = new Uint8Array(11);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42]);
  return bytes;
}
