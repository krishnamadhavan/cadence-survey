import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { surveys } from "@/db/schema";
import {
  SurveyStatusError,
  addSurveyQuestion,
  deleteSurveyQuestion,
  listSurveyQuestions,
  moveSurveyQuestion,
  renameSurvey,
  setSurveyStatus,
  updateSurveyQuestion,
} from "./surveys";

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

  const renamed = await renameSurvey({ token, title: "  Renamed pulse  " });
  assert.equal(renamed.title, "Renamed pulse");

  const first = await addSurveyQuestion({
    token,
    prompt: "How was your week?",
    type: "scale",
    required: true,
    min: "1",
    max: "5",
    minLabel: "",
    maxLabel: "",
    choices: "",
  });
  const second = await addSurveyQuestion({
    token,
    prompt: "Anything else?",
    type: "text",
    required: false,
    min: "1",
    max: "5",
    minLabel: "",
    maxLabel: "",
    choices: "",
  });
  await moveSurveyQuestion({ token, id: second.id, direction: "up" });
  const moved = await listSurveyQuestions(token);
  assert.deepEqual(
    moved.map((question) => question.prompt),
    ["Anything else?", "How was your week?"],
  );
  const edited = await updateSurveyQuestion({
    token,
    id: first.id,
    prompt: "How was the week?",
    type: "scale",
    required: true,
    min: "1",
    max: "5",
    minLabel: "Rough",
    maxLabel: "Great",
    choices: "",
  });
  assert.equal(edited.prompt, "How was the week?");
  await deleteSurveyQuestion({ token, id: second.id });

  const opened = await setSurveyStatus({ token, status: "open" });
  assert.equal(opened.status, "open");
  await assert.rejects(
    () => renameSurvey({ token, title: "Too late" }),
    SurveyStatusError,
  );
  await assert.rejects(
    () =>
      addSurveyQuestion({
        token,
        prompt: "Another?",
        type: "text",
        required: false,
        min: "1",
        max: "5",
        minLabel: "",
        maxLabel: "",
        choices: "",
      }),
    SurveyStatusError,
  );

  const closed = await setSurveyStatus({ token, status: "closed" });
  assert.equal(closed.status, "closed");

  const reopened = await setSurveyStatus({ token, status: "open" });
  assert.equal(reopened.status, "open");

  await assert.rejects(
    () => setSurveyStatus({ token, status: "draft" }),
    SurveyStatusError,
  );
});
