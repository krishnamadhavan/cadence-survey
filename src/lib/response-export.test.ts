import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";
import {
  buildResponseCsv,
  responseExportFilename,
  responseQuestionHeaders,
  selectResponseRows,
  type ExportResponse,
} from "@/lib/response-export";

const floor = MIN_TEAM_RESPONSES;

test("response csv is one row per named team response", () => {
  const questions = [
    { prompt: "How was the week?", position: 1 },
    { prompt: "=notes", position: 2 },
  ];
  const rows = selectResponseRows(
    [
      row("a", "eng", "Engineering", 1, [5, "shipped"]),
      row("b", "eng", "Engineering", 2, [4, null]),
      row("c", "eng", "Engineering", 3, [5, "=1+1"]),
      row("d", "des", "Design", 4, [2, "folded-note"]),
      row("e", "des", "Design", 5, [2, null]),
      row("f", "des", "Design", 6, [2, null]),
      row("g", "ops", "Operations", 7, [1, "secret-note"]),
    ],
    floor,
  );

  assert.equal(rows.state, "ready");
  assert.equal(rows.rows.length, floor);
  assert.equal(rows.rows.every((line) => line.teamName === "Engineering"), true);
  const csv = buildResponseCsv(questions, rows.rows);
  assert.match(csv, /Team,How was the week\?,'=notes/);
  assert.match(csv, /Engineering,5,shipped/);
  assert.match(csv, /Engineering,5,'=1\+1/);
  assert.equal(csv.includes("Design"), false);
  assert.equal(csv.includes("Operations"), false);
  assert.equal(csv.includes("folded-note"), false);
  assert.equal(csv.includes("secret-note"), false);
  assert.equal(csv.includes(",=1+1"), false);
});

test("two teams at the floor are both in the file", () => {
  const selected = selectResponseRows(
    [
      row("a", "eng", "Engineering", 1, [5]),
      row("b", "eng", "Engineering", 2, [5]),
      row("c", "eng", "Engineering", 3, [4]),
      row("d", "des", "Design", 4, [3]),
      row("e", "des", "Design", 5, [3]),
      row("f", "des", "Design", 6, [2]),
    ],
    floor,
  );
  assert.equal(selected.state, "ready");
  assert.equal(selected.rows.length, floor * 2);
  const names = new Set(selected.rows.map((line) => line.teamName));
  assert.deepEqual(names, new Set(["Design", "Engineering"]));
});

test("a pulse under the floor exports no rows", () => {
  const selected = selectResponseRows(
    [row("a", "ops", "Operations", 1, [1, "secret-note"])],
    floor,
  );
  assert.equal(selected.state, "hidden");
  assert.equal(selected.rows.length, 0);
});

test("duplicate prompts stay distinct columns", () => {
  assert.deepEqual(
    responseQuestionHeaders([
      { prompt: "How was the week?", position: 1 },
      { prompt: "How was the week?", position: 2 },
    ]),
    ["How was the week? (1)", "How was the week? (2)"],
  );
});

test("response filename is a csv for that pulse", () => {
  const name = responseExportFilename("weekly pulse", new Date("2026-10-09T12:00:00Z"));
  assert.equal(name, "weekly-pulse-responses-2026-10-09.csv");
});

function row(
  id: string,
  teamKey: string,
  teamName: string,
  submittedAt: number,
  values: ExportResponse["values"],
): ExportResponse {
  return { id, teamKey, teamName, submittedAt, values };
}
