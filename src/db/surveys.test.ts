import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { questions, surveys } from "@/db/schema";
import { SurveyStatusError, setSurveyStatus } from "./surveys";

const stamp = Date.now();
const token = `qa-survey-${stamp}`;

test("open requires a question; live can close and reopen", async (t) => {
  t.after(async () => {
    await db.delete(surveys).where(eq(surveys.publicToken, token));
    await pg.end({ timeout: 2 });
  });

  const [created] = await db
    .insert(surveys)
    .values({
      title: `QA Pulse ${stamp}`,
      publicToken: token,
      status: "draft",
    })
    .returning({ id: surveys.id });
  assert.ok(created);

  await assert.rejects(
    () => setSurveyStatus({ token, status: "open" }),
    SurveyStatusError,
  );

  await db.insert(questions).values({
    surveyId: created.id,
    prompt: "How was your week?",
    type: "scale",
    options: { min: 1, max: 5 },
    position: 1,
    required: true,
  });

  const opened = await setSurveyStatus({ token, status: "open" });
  assert.equal(opened.status, "open");

  const closed = await setSurveyStatus({ token, status: "closed" });
  assert.equal(closed.status, "closed");

  const reopened = await setSurveyStatus({ token, status: "open" });
  assert.equal(reopened.status, "open");

  await assert.rejects(
    () => setSurveyStatus({ token, status: "draft" }),
    SurveyStatusError,
  );
});
