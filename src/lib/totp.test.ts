import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { totpQrSvg } from "./totp-qr";
import {
  decodeBase32,
  encodeBase32,
  formatTotpSecret,
  generateTotpSecret,
  matchTotpCode,
  totp,
  totpCode,
  totpKeyUri,
  totpStep,
} from "./totp";

test("totp matches the RFC 6238 SHA1 vectors", () => {
  const key = Buffer.from("12345678901234567890", "ascii");
  const vectors: Array<[number, string, string]> = [
    [59, "94287082", "287082"],
    [1111111109, "07081804", "081804"],
    [1111111111, "14050471", "050471"],
    [1234567890, "89005924", "005924"],
    [2000000000, "69279037", "279037"],
    [20000000000, "65353130", "353130"],
  ];
  for (const [seconds, eight, six] of vectors) {
    assert.equal(totp(key, seconds, 8), eight);
    assert.equal(totp(key, seconds, 6), six);
  }

  const secret = encodeBase32(key);
  assert.equal(matchTotpCode(secret, "287082", 59_000), totpStep(59_000));
});

test("base32 round-trips authenticator secrets", () => {
  assert.equal(encodeBase32(Buffer.from("foobar", "ascii")), "MZXW6YTBOI");
  assert.deepEqual(decodeBase32("mzxw6ytb oi======"), Buffer.from("foobar", "ascii"));
  assert.equal(decodeBase32("!!!!"), null);
  const bytes = randomBytes(20);
  assert.deepEqual(decodeBase32(encodeBase32(bytes)), bytes);

  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/u);
  const grouped = formatTotpSecret(secret);
  assert.equal(grouped.replaceAll(" ", ""), secret);
  assert.equal(grouped.split(" ").length, 8);
});

test("accepts the current code and one step either side", () => {
  const secret = generateTotpSecret();
  const now = 1_711_111_110_000;
  const step = totpStep(now);
  assert.equal(matchTotpCode(secret, totpCode(secret, step) ?? "", now), step);
  assert.equal(matchTotpCode(secret, totpCode(secret, step - 1) ?? "", now), step - 1);
  assert.equal(matchTotpCode(secret, totpCode(secret, step + 1) ?? "", now), step + 1);
  assert.equal(matchTotpCode(secret, totpCode(secret, step - 2) ?? "", now), null);
  assert.equal(matchTotpCode(secret, totpCode(secret, step + 2) ?? "", now), null);
  assert.equal(matchTotpCode(secret, "12345", now), null);
  assert.equal(matchTotpCode(secret, "1234567", now), null);
  assert.equal(matchTotpCode("not-a-secret", "123456", now), null);
});

test("setup link is an authenticator url and renders a qr image", async () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const uri = totpKeyUri("ada@cadence.test", secret);
  assert.equal(
    uri,
    "otpauth://totp/Cadence:ada%40cadence.test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Cadence&algorithm=SHA1&digits=6&period=30",
  );
  const qr = await totpQrSvg(uri);
  assert.match(qr, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /u);
  assert.equal(qr.includes(secret), false);
  assert.equal(qr.includes("<script"), false);
});
