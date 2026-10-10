import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResponseCsv } from "./response-export";
import {
  RESPONSE_IMPORT_MAX_ROWS,
  parseResponseImport,
  responseImportTemplate,
  type ResponseImportQuestion,
} from "./response-import";

const questions: ResponseImportQuestion[] = [
  {
    id: "scale",
    prompt: "How was the week?",
    position: 1,
    type: "scale",
    min: 1,
    max: 5,
  },
  {
    id: "pace",
    prompt: "Pace",
    position: 2,
    type: "choice",
    choices: ["Fast", "Slow"],
  },
  {
    id: "notes",
    prompt: "Notes",
    position: 3,
    type: "text",
  },
];

test("parses a cadence response export and a history file", () => {
  const exported = buildResponseCsv(
    [
      { prompt: "How was the week?", position: 1 },
      { prompt: "Pace", position: 2 },
      { prompt: "Notes", position: 3 },
    ],
    [
      {
        teamName: "Engineering",
        role: "Engineer",
        tenure: "1-3yr",
        values: [4, "Fast", "shipped, today"],
      },
    ],
  );
  const parsed = parseResponseImport(exported, questions);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.team, "Engineering");
  assert.equal(parsed.rows[0]?.role, "Engineer");
  assert.equal(parsed.rows[0]?.tenureBand, "y1_3");
  assert.deepEqual(parsed.rows[0]?.answers, [
    { questionId: "scale", value: 4 },
    { questionId: "pace", value: "Fast" },
    { questionId: "notes", value: "shipped, today" },
  ]);

  const history = parseResponseImport(
    [
      "team,submitted,notes,pace,How was the week?",
      "Design,2024-05-02,=1+1,Slow,2",
      "Design,2024-05-03T15:04:05Z,,Fast,5",
    ].join("\n"),
    questions,
  );
  assert.equal(history.ok, true);
  if (!history.ok) {
    return;
  }
  assert.equal(history.rows[0]?.submittedAt?.toISOString(), "2024-05-02T00:00:00.000Z");
  assert.equal(history.rows[0]?.answers.find((answer) => answer.questionId === "notes")?.value, "=1+1");
  assert.equal(history.rows[1]?.role, null);
  assert.equal(history.rows[1]?.tenureBand, null);
  assert.equal(
    history.rows[1]?.answers.some((answer) => answer.questionId === "notes"),
    false,
  );
});

test("rejects a file unless every row can be saved", () => {
  const parsed = parseResponseImport(
    [
      "Team,How was the week?,Pace,Notes",
      "Design,4,Fast,ok",
      "Design,9,Fast,no",
      ",2,Slow,missing team",
      "Design,3,Maybe,",
      "Design,,,,",
    ].join("\n"),
    questions,
  );
  assert.equal(parsed.ok, false);
  if (parsed.ok) {
    return;
  }
  assert.deepEqual(
    parsed.errors.map((error) => error.message),
    [
      "How was the week? must be a whole number from 1 to 5.",
      "Team is required.",
      "Pace must be one of: Fast, Slow.",
      "This row has no answers.",
    ],
  );

  const tenure = parseResponseImport(
    "Team,Tenure,How was the week?,Pace,Notes\nDesign,forever,4,Fast,ok\n",
    questions,
  );
  assert.equal(tenure.ok, false);
  if (!tenure.ok) {
    assert.equal(tenure.errors[0]?.message, "Tenure must be <1yr, 1-3yr, or 3yr+.");
  }

  const columns = parseResponseImport("Team,Notes\nDesign,hello\n", questions);
  assert.equal(columns.ok, false);
  if (!columns.ok) {
    assert.match(columns.errors[0]?.message ?? "", /Missing columns: How was the week\?, Pace/);
  }

  const unknown = parseResponseImport(
    "Team,How was the week?,Pace,Notes,Mood\nDesign,4,Fast,ok,1\n",
    questions,
  );
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.equal(unknown.errors[0]?.message, "Unknown column: Mood.");
  }

  const empty = parseResponseImport("", questions);
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.errors[0]?.message, "The file is empty.");
  }
});

test("template names each question and keeps duplicate prompts apart", () => {
  const template = responseImportTemplate([
    { prompt: "How was the week?", position: 1 },
    { prompt: "Hello, team", position: 2 },
  ]);
  assert.ok(template.startsWith("\uFEFF"));
  assert.match(template, /Team,Role,Tenure,Submitted,How was the week\?,"Hello, team"/);

  const moods: ResponseImportQuestion[] = [
    { id: "a", prompt: "Mood", position: 1, type: "scale", min: 1, max: 5 },
    { id: "b", prompt: "Mood", position: 2, type: "scale", min: 1, max: 5 },
  ];
  const parsed = parseResponseImport("Team,Mood (1),Mood (2)\nDesign,4,2\n", moods);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.rows[0]?.answers, [
      { questionId: "a", value: 4 },
      { questionId: "b", value: 2 },
    ]);
  }

  const reserved = parseResponseImport("Team\nDesign\n", [
    { id: "team", prompt: "Team", position: 1, type: "text" },
  ]);
  assert.equal(reserved.ok, false);

  const header = "Team,Score\n";
  const tooMany = header + Array.from({ length: RESPONSE_IMPORT_MAX_ROWS + 1 }, () => "Design,3").join("\n");
  const capped = parseResponseImport(tooMany, [
    { id: "score", prompt: "Score", position: 1, type: "scale", min: 1, max: 5 },
  ]);
  assert.equal(capped.ok, false);
  if (!capped.ok) {
    assert.match(capped.errors[0]?.message ?? "", /5000/);
  }
});
