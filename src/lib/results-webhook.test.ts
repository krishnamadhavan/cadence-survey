import assert from "node:assert/strict";
import { test } from "node:test";
import type { SurveyResults } from "@/db/results";
import {
  postResultsWebhook,
  pulseClosedPayload,
  signResultsWebhook,
  verifyResultsWebhook,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
} from "./results-webhook";

test("closed pulse payload is the published summary", () => {
  const results = {
    survey: {
      id: "survey-1",
      title: "Weekly pulse",
      publicToken: "weekly",
      status: "closed",
      opensAt: null,
      closesAt: null,
      cadence: null,
      responseCount: 4,
      averageScore: 4,
    },
    teams: [],
    questions: [],
    role: "Engineer",
    teamId: "team-1",
    teamName: "Engineering",
    tenure: "lt_1",
    roleVisibility: "shown",
  } as SurveyResults;

  const body = pulseClosedPayload(results, "2026-10-09T12:00:00.000Z");
  assert.equal(body.event, "pulse.closed");
  assert.equal(body.sentAt, "2026-10-09T12:00:00.000Z");
  assert.equal(body.survey.publicToken, "weekly");
  assert.equal("role" in body, false);
  assert.equal("roleVisibility" in body, false);
  assert.equal(JSON.stringify(body).includes("Engineer"), false);
});

test("signature matches the raw body and rejects a change or a stale timestamp", () => {
  const secret = "a".repeat(64);
  const body = '{"event":"pulse.closed"}';
  const timestamp = 1_700_000_000;
  const header = signResultsWebhook(secret, body, timestamp);
  assert.equal(
    verifyResultsWebhook({ secret, body, header, now: timestamp }),
    true,
  );
  assert.equal(
    verifyResultsWebhook({
      secret,
      body,
      header,
      now: timestamp + WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
    }),
    true,
  );
  assert.equal(
    verifyResultsWebhook({
      secret,
      body,
      header,
      now: timestamp + WEBHOOK_SIGNATURE_TOLERANCE_SECONDS + 1,
    }),
    false,
  );
  assert.equal(
    verifyResultsWebhook({ secret: "b".repeat(64), body, header, now: timestamp }),
    false,
  );
  assert.equal(
    verifyResultsWebhook({ secret, body: `${body} `, header, now: timestamp }),
    false,
  );
  assert.equal(
    verifyResultsWebhook({ secret, body, header: "t=1,v1=nope", now: timestamp }),
    false,
  );
  assert.equal(
    verifyResultsWebhook({ secret, body, header: null, now: timestamp }),
    false,
  );
});

test("webhook post sends json and the signature header", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const body = '{"event":"pulse.closed"}';
  const signature = signResultsWebhook("secret", body, 1_700_000_000);
  await postResultsWebhook(
    {
      url: "https://hooks.example/cadence",
      body,
      signature,
    },
    async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status: 204 });
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://hooks.example/cadence");
  assert.equal(calls[0]?.init.method, "POST");
  assert.equal(calls[0]?.init.redirect, "error");
  assert.equal(calls[0]?.init.body, body);
  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers["content-type"], "application/json");
  assert.equal(headers["user-agent"], "cadence-survey");
  assert.equal(headers[WEBHOOK_SIGNATURE_HEADER], signature);

  await assert.rejects(
    () =>
      postResultsWebhook(
        { url: "https://hooks.example/cadence", body: "{}", signature },
        async () => new Response(null, { status: 503 }),
      ),
    (error: unknown) => error instanceof Error && error.message === "HTTP 503",
  );
});
