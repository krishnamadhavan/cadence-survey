import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { questions, surveys, surveyTemplates } from "@/db/schema";
import {
  TemplateConflictError,
  TemplateEmptyError,
  addTemplateQuestion,
  createTemplate,
  deleteTemplate,
  listTemplatesForAdmin,
  updateTemplate,
  createDraftFromTemplate,
} from "./templates";

const stamp = Date.now();
const name = `QA Template ${stamp}`;
const createdIds: string[] = [];
const surveyTokens: string[] = [];

test("create, list, rename, question, and use a template; block conflicts and empty use", async (t) => {
  t.after(async () => {
    for (const token of surveyTokens) {
      await db.delete(surveys).where(eq(surveys.publicToken, token));
    }
    for (const id of createdIds) {
      await db.delete(surveyTemplates).where(eq(surveyTemplates.id, id));
    }
    await pg.end({ timeout: 2 });
  });

  const created = await createTemplate({
    name,
    description: "A QA blueprint",
  });
  createdIds.push(created.id);
  assert.equal(created.name, name);
  assert.equal(created.description, "A QA blueprint");

  const listed = await listTemplatesForAdmin();
  const found = listed.find((template) => template.id === created.id);
  assert.ok(found);
  assert.equal(found?.questionCount, 0);
  assert.deepEqual(found?.questions, []);

  await assert.rejects(
    () => createTemplate({ name, description: "" }),
    TemplateConflictError,
  );
  await assert.rejects(() => createDraftFromTemplate(created.id), TemplateEmptyError);

  await addTemplateQuestion({
    templateId: created.id,
    prompt: "How was your week?",
    type: "scale",
    required: true,
    min: "1",
    max: "5",
    minLabel: "Rough",
    maxLabel: "Great",
    choices: "",
  });

  const withQuestion = (await listTemplatesForAdmin()).find(
    (template) => template.id === created.id,
  );
  assert.equal(withQuestion?.questionCount, 1);
  assert.equal(withQuestion?.questions[0]?.prompt, "How was your week?");
  assert.equal(withQuestion?.questions[0]?.type, "scale");

  const renamed = await updateTemplate({
    id: created.id,
    name: `${name} Renamed`,
    description: "",
  });
  assert.equal(renamed.name, `${name} Renamed`);
  assert.equal(renamed.description, null);

  const survey = await createDraftFromTemplate(created.id);
  surveyTokens.push(survey.publicToken);
  assert.equal(survey.title, `${name} Renamed`);

  const [draft] = await db
    .select({ status: surveys.status })
    .from(surveys)
    .where(eq(surveys.publicToken, survey.publicToken))
    .limit(1);
  assert.equal(draft?.status, "draft");

  const copied = await db
    .select({ prompt: questions.prompt, type: questions.type })
    .from(questions)
    .where(eq(questions.surveyId, survey.id));
  assert.equal(copied.length, 1);
  assert.equal(copied[0]?.type, "scale");

  await deleteTemplate(created.id);
  const after = await listTemplatesForAdmin();
  assert.equal(
    after.some((template) => template.id === created.id),
    false,
  );
});
