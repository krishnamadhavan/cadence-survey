import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseCrossAxes,
  coarserCrossFilters,
  compareCrossKeys,
  NO_ROLE_KEY,
  planCrossGrid,
} from "./cross-grid";

test("publishes both pockets when each remainder meets the floor", () => {
  const plan = planCrossGrid([
    { rowKey: "lt_1", colKey: "eng", count: 6 },
    { rowKey: "lt_1", colKey: "des", count: 4 },
  ]);

  assert.deepEqual(plan, [
    { rowKey: "lt_1", colKey: "des" },
    { rowKey: "lt_1", colKey: "eng" },
  ]);
});

test("hides a row when the other pocket is under the floor", () => {
  const plan = planCrossGrid([
    { rowKey: "lt_1", colKey: "eng", count: 8 },
    { rowKey: "lt_1", colKey: "des", count: 2 },
  ]);

  assert.deepEqual(plan, []);
});

test("folds the smallest named pocket until the remainder is safe", () => {
  const plan = planCrossGrid([
    { rowKey: "r", colKey: "b", count: 4 },
    { rowKey: "r", colKey: "a", count: 4 },
    { rowKey: "r", colKey: "c", count: 2 },
  ]);

  assert.deepEqual(plan, [{ rowKey: "r", colKey: "b" }]);
});

test("a column remainder folds a pocket that its own row would allow", () => {
  const plan = planCrossGrid([
    { rowKey: "lt_1", colKey: "eng", count: 4 },
    { rowKey: "lt_1", colKey: "des", count: 4 },
    { rowKey: "y1_3", colKey: "eng", count: 4 },
    { rowKey: "y1_3", colKey: "des", count: 2 },
  ]);

  assert.deepEqual(plan, [{ rowKey: "lt_1", colKey: "eng" }]);
});

test("hides the pocket that exposes a smaller group and keeps its neighbour", () => {
  const plan = planCrossGrid(
    [
      { rowKey: "lt_1", colKey: "des", count: 6 },
      { rowKey: "lt_1", colKey: "eng", count: 6 },
      { rowKey: "gte_3", colKey: "eng", count: 6 },
    ],
    3,
    [[
      { rowKey: "lt_1", colKey: "eng", complement: 2 },
      { rowKey: "gte_3", colKey: "eng", complement: 3 },
    ]],
  );

  assert.deepEqual(plan, [
    { rowKey: "gte_3", colKey: "eng" },
    { rowKey: "lt_1", colKey: "des" },
  ]);
});

test("hides a column when the only gap sits outside this slice", () => {
  const plan = planCrossGrid(
    [
      { rowKey: "lt_1", colKey: "eng", count: 4 },
      { rowKey: "lt_1", colKey: "des", count: 4 },
    ],
    3,
    [[
      { rowKey: "y1_3", colKey: "eng", complement: 2 },
      { rowKey: "lt_1", colKey: "des", complement: 4 },
    ]],
  );

  assert.deepEqual(plan, [{ rowKey: "lt_1", colKey: "des" }]);
});

test("publishes nothing when the whole slice leaves a gap under the floor", () => {
  const plan = planCrossGrid(
    [
      { rowKey: "lt_1", colKey: "des", count: 4 },
      { rowKey: "lt_1", colKey: "eng", count: 4 },
    ],
    3,
    [[{ rowKey: "gte_3", colKey: "eng", complement: 2 }]],
  );

  assert.deepEqual(plan, []);
});

test("a complement that meets the floor can stay", () => {
  const plan = planCrossGrid(
    [{ rowKey: "lt_1", colKey: "eng", count: 6 }],
    3,
    [[{ rowKey: "lt_1", colKey: "eng", complement: 3 }]],
  );

  assert.deepEqual(plan, [{ rowKey: "lt_1", colKey: "eng" }]);
});

test("ignores a floor below 3 and a pocket of 2", () => {
  assert.deepEqual(planCrossGrid([{ rowKey: "r", colKey: "a", count: 2 }], 2), []);
  assert.deepEqual(
    planCrossGrid([
      { rowKey: "r", colKey: "a", count: 3 },
      { rowKey: "r", colKey: "b", count: 3 },
    ]),
    [
      { rowKey: "r", colKey: "a" },
      { rowKey: "r", colKey: "b" },
    ],
  );
});

test("uses a higher floor for the same remainder rule", () => {
  const plan = planCrossGrid(
    [
      { rowKey: "r", colKey: "a", count: 6 },
      { rowKey: "r", colKey: "b", count: 4 },
    ],
    5,
  );

  assert.deepEqual(plan, []);
});

test("sums duplicate pockets before applying the floor", () => {
  const plan = planCrossGrid([
    { rowKey: "r", colKey: "a", count: 2 },
    { rowKey: "r", colKey: "a", count: 2 },
  ]);

  assert.deepEqual(plan, [{ rowKey: "r", colKey: "a" }]);
});

test("tenure by role is the default, and a pinned axis is skipped", () => {
  const open = {
    office: false,
    team: false,
    role: false,
    tenure: false,
  };
  assert.deepEqual(chooseCrossAxes({}, open), { rows: "tenure", cols: "role" });
  assert.deepEqual(
    chooseCrossAxes({ rows: "team", cols: "office" }, open),
    { rows: "team", cols: "office" },
  );
  assert.deepEqual(
    chooseCrossAxes({}, { ...open, role: true }),
    { rows: "tenure", cols: "team" },
  );
  assert.deepEqual(
    chooseCrossAxes({ rows: "role", cols: "tenure" }, { ...open, role: true }),
    { rows: "tenure", cols: "team" },
  );
  assert.equal(
    chooseCrossAxes(
      {},
      { office: true, team: true, role: true, tenure: false },
    ),
    null,
  );
});

test("coarser filters are every proper subset of the active slice", () => {
  const filters = coarserCrossFilters({
    teamId: "team",
    role: "eng",
    tenure: null,
    office: null,
  });

  assert.deepEqual(filters, [
    { teamId: null, role: null, tenure: null, office: null },
    { teamId: "team", role: null, tenure: null, office: null },
    { teamId: null, role: "eng", tenure: null, office: null },
  ]);
});

test("tenure bands stay in band order and a blank role sorts last", () => {
  const labels = new Map<string, string>([
    ["eng", "Engineer"],
    [NO_ROLE_KEY, "No role"],
  ]);
  assert.ok(
    compareCrossKeys("tenure", "lt_1", "gte_3", (key) => key) < 0,
  );
  assert.ok(
    compareCrossKeys("tenure", "gte_3", "lt_1", (key) => key) > 0,
  );
  assert.ok(
    compareCrossKeys("role", "eng", NO_ROLE_KEY, (key) => labels.get(key) ?? key) < 0,
  );
});
