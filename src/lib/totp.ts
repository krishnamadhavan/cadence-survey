import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

// Authenticator apps verify the current 30s step and one step on either side.
const TOTP_WINDOW = 1;

export function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += ALPHABET[(value >>> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(input: string): Buffer | null {
  const cleaned = input.replace(/=+$/u, "").replace(/\s+/gu, "").toUpperCase();
  if (cleaned.length === 0 || !/^[A-Z2-7]+$/u.test(cleaned)) {
    return null;
  }
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function formatTotpSecret(secret: string): string {
  return secret.replace(/.{4}(?=.)/gu, "$& ").trim();
}

export function hotp(key: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(counterBytes).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function totp(key: Buffer, unixSeconds: number, digits = TOTP_DIGITS): string {
  return hotp(key, Math.floor(unixSeconds / TOTP_PERIOD_SECONDS), digits);
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function totpCode(secret: string, step: number): string | null {
  const key = decodeBase32(secret);
  if (!key || key.length === 0 || step < 0) {
    return null;
  }
  return hotp(key, step);
}

export function matchTotpCode(
  secret: string,
  code: string,
  nowMs = Date.now(),
): number | null {
  const normalized = code.replace(/\s+/gu, "");
  if (!/^\d{6}$/u.test(normalized)) {
    return null;
  }
  const key = decodeBase32(secret);
  if (!key || key.length === 0) {
    return null;
  }
  const step = totpStep(nowMs);
  const given = Buffer.from(normalized);
  let matched: number | null = null;
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta += 1) {
    const candidate = step + delta;
    if (candidate < 0) {
      continue;
    }
    const expected = Buffer.from(hotp(key, candidate));
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      matched = candidate;
    }
  }
  return matched;
}

export function totpKeyUri(email: string, secret: string): string {
  const params = new URLSearchParams({
    secret,
    issuer: "Cadence",
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/Cadence:${encodeURIComponent(email)}?${params.toString()}`;
}
