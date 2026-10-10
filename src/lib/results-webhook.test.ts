import assert from "node:assert/strict";
import { test } from "node:test";
import type { SurveyResults } from "@/db/results";
import { postResultsWebhook, pulseClosedPayload } from "./results-webhook";

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

test("webhook post sends json and rejects a failed response", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  await postResultsWebhook(
    "https://hooks.example/cadence",
    '{"event":"pulse.closed"}',
    async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status: 204 });
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://hooks.example/cadence");
  assert.equal(calls[0]?.init.method, "POST");
  assert.equal(calls[0]?.init.redirect, "error");
  assert.equal(calls[0]?.init.body, '{"event":"pulse.closed"}');
  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers["content-type"], "application/json");
  assert.equal(headers["user-agent"], "cadence-survey");

  await assert.rejects(
    () =>
      postResultsWebhook("https://hooks.example/cadence", "{}", async () => {
        return new Response(null, { status: 503 });
      }),
    (error: unknown) => error instanceof Error && error.message === "HTTP 503",
  );
});
