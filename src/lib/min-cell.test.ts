import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_TEAM_RESPONSES,
  planCombinedSegment,
  planRoleSegment,
  planTeamPublish,
} from "./min-cell";

test("hides teams below the minimum", () => {
  const plan = planTeamPublish([
    { key: "eng", count: 5 },
    { key: "design", count: 2 },
    { key: "product", count: 2 },
  ]);

  assert.deepEqual(plan.namedKeys.sort(), ["eng"]);
  assert.deepEqual(plan.suppressedKeys.sort(), ["design", "product"]);
  assert.equal(plan.showSuppressedBucket, true);
});

test("folds a named team when the leftover would be 1–2 people", () => {
  const plan = planTeamPublish([
    { key: "eng", count: 3 },
    { key: "ops", count: 3 },
    { key: "design", count: 2 },
  ]);

  assert.deepEqual(plan.namedKeys, ["ops"]);
  assert.deepEqual(plan.suppressedKeys.sort(), ["design", "eng"]);
  assert.equal(plan.showSuppressedBucket, true);
});

test("un-names the last visible team when a remainder of 1–2 would leak", () => {
  const plan = planTeamPublish([
    { key: "eng", count: 5 },
    { key: "product", count: 2 },
  ]);

  assert.deepEqual(plan.namedKeys, []);
  assert.deepEqual(plan.suppressedKeys.sort(), ["eng", "product"]);
  assert.equal(plan.showSuppressedBucket, true);
});

test("shows no team names when everyone is below the minimum", () => {
  const plan = planTeamPublish([
    { key: "a", count: 1 },
    { key: "b", count: 1 },
  ]);

  assert.deepEqual(plan.namedKeys, []);
  assert.equal(plan.showSuppressedBucket, false);
  assert.equal(MIN_TEAM_RESPONSES, 3);
});

test("ignores a floor below 3 so a team of 2 stays hidden", () => {
  const plan = planTeamPublish([{ key: "eng", count: 2 }], 2);
  assert.deepEqual(plan.namedKeys, []);
  assert.equal(plan.showSuppressedBucket, false);
});

test("uses a higher floor and still folds a leftover that is too small", () => {
  const plan = planTeamPublish(
    [
      { key: "eng", count: 5 },
      { key: "ops", count: 6 },
      { key: "design", count: 4 },
    ],
    5,
  );
  assert.deepEqual(plan.namedKeys, ["ops"]);
  assert.deepEqual(plan.suppressedKeys.sort(), ["design", "eng"]);
});

test("hides a role when the rest of the survey is 1 or 2 people", () => {
  const plan = planRoleSegment([{ key: "a", roleCount: 3, totalCount: 4 }]);

  assert.equal(plan.hideSlice, true);
  assert.deepEqual(plan.namedKeys, []);
  assert.equal(plan.showSuppressedBucket, false);
});

test("folds a team whose complement is under the floor into the other role teams", () => {
  const plan = planRoleSegment([
    { key: "a", roleCount: 3, totalCount: 4 },
    { key: "b", roleCount: 5, totalCount: 10 },
  ]);

  assert.equal(plan.hideSlice, false);
  assert.deepEqual(plan.namedKeys, []);
  assert.deepEqual(plan.suppressedKeys.sort(), ["a", "b"]);
  assert.equal(plan.showSuppressedBucket, true);
});

test("keeps the within-role fold when nobody is outside the role", () => {
  const plan = planRoleSegment([
    { key: "a", roleCount: 3, totalCount: 3 },
    { key: "b", roleCount: 1, totalCount: 1 },
  ]);

  assert.equal(plan.hideSlice, false);
  assert.deepEqual(plan.namedKeys, []);
  assert.deepEqual(plan.suppressedKeys.sort(), ["a", "b"]);
  assert.equal(plan.showSuppressedBucket, true);
});

test("buckets teams when each complement is small but together they meet the floor", () => {
  const plan = planRoleSegment([
    { key: "a", roleCount: 3, totalCount: 4 },
    { key: "b", roleCount: 3, totalCount: 5 },
  ]);

  assert.equal(plan.hideSlice, false);
  assert.deepEqual(plan.namedKeys, []);
  assert.deepEqual(plan.suppressedKeys.sort(), ["a", "b"]);
  assert.equal(plan.showSuppressedBucket, true);
});

test("hides a role when the only named cell still leaves 1 or 2 people", () => {
  const plan = planRoleSegment([
    { key: "a", roleCount: 3, totalCount: 4 },
    { key: "d", roleCount: 0, totalCount: 5 },
  ]);

  assert.equal(plan.hideSlice, true);
  assert.deepEqual(plan.namedKeys, []);
  assert.equal(plan.showSuppressedBucket, false);
});

test("keeps a safe team named after a smaller team closes the complement", () => {
  const plan = planRoleSegment([
    { key: "a", roleCount: 3, totalCount: 4 },
    { key: "b", roleCount: 4, totalCount: 9 },
    { key: "c", roleCount: 10, totalCount: 20 },
  ]);

  assert.equal(plan.hideSlice, false);
  assert.deepEqual(plan.namedKeys, ["c"]);
  assert.deepEqual(plan.suppressedKeys.sort(), ["a", "b"]);
  assert.equal(plan.showSuppressedBucket, true);
});

test("names a role team when the people outside it meet the floor", () => {
  const plan = planRoleSegment([{ key: "a", roleCount: 3, totalCount: 6 }]);

  assert.equal(plan.hideSlice, false);
  assert.deepEqual(plan.namedKeys, ["a"]);
  assert.equal(plan.showSuppressedBucket, false);
});

test("uses a higher floor when deciding a role complement", () => {
  const plan = planRoleSegment([{ key: "a", roleCount: 5, totalCount: 8 }], 5);

  assert.equal(plan.hideSlice, true);
  assert.deepEqual(plan.namedKeys, []);
});

test("ignores a role floor below 3", () => {
  const plan = planRoleSegment([{ key: "a", roleCount: 2, totalCount: 2 }], 2);

  assert.equal(plan.hideSlice, false);
  assert.deepEqual(plan.namedKeys, []);
  assert.equal(plan.showSuppressedBucket, false);
  assert.equal(MIN_TEAM_RESPONSES, 3);
});

const roleFixtures: {
  teams: { key: string; roleCount: number; totalCount: number }[];
  floor?: number;
}[] = [
  { teams: [{ key: "a", roleCount: 3, totalCount: 4 }] },
  {
    teams: [
      { key: "a", roleCount: 3, totalCount: 4 },
      { key: "b", roleCount: 5, totalCount: 10 },
    ],
  },
  {
    teams: [
      { key: "a", roleCount: 3, totalCount: 3 },
      { key: "b", roleCount: 1, totalCount: 1 },
    ],
  },
  {
    teams: [
      { key: "a", roleCount: 3, totalCount: 4 },
      { key: "b", roleCount: 3, totalCount: 5 },
    ],
  },
  {
    teams: [
      { key: "a", roleCount: 3, totalCount: 4 },
      { key: "d", roleCount: 0, totalCount: 5 },
    ],
  },
  {
    teams: [
      { key: "a", roleCount: 3, totalCount: 4 },
      { key: "b", roleCount: 4, totalCount: 9 },
      { key: "c", roleCount: 10, totalCount: 20 },
    ],
  },
  { teams: [{ key: "a", roleCount: 3, totalCount: 6 }] },
  { teams: [{ key: "a", roleCount: 5, totalCount: 8 }], floor: 5 },
  { teams: [{ key: "a", roleCount: 2, totalCount: 2 }], floor: 2 },
];

function asCombined(
  teams: { key: string; roleCount: number; totalCount: number }[],
  floor?: number,
) {
  const sliceTotal = teams.reduce((sum, team) => sum + team.roleCount, 0);
  const survey = teams.reduce(
    (sum, team) => sum + Math.max(team.totalCount, team.roleCount),
    0,
  );
  return planCombinedSegment(
    teams
      .filter((team) => team.roleCount > 0)
      .map((team) => ({
        key: team.key,
        sliceCount: team.roleCount,
        parents: [Math.max(team.totalCount, team.roleCount)],
      })),
    [survey],
    sliceTotal,
    floor,
  );
}

test("combined planner matches the role planner for a role-only slice", () => {
  for (const fixture of roleFixtures) {
    assert.deepEqual(
      asCombined(fixture.teams, fixture.floor),
      planRoleSegment(fixture.teams, fixture.floor),
    );
  }
});

test("folds a safe team when a suppressed complement is still under the floor", () => {
  const plan = planCombinedSegment(
    [
      { key: "a", sliceCount: 4, parents: [5] },
      { key: "b", sliceCount: 5, parents: [10] },
    ],
    [15],
    9,
  );

  assert.equal(plan.hideSlice, false);
  assert.deepEqual(plan.namedKeys, []);
  assert.deepEqual(plan.suppressedKeys.sort(), ["a", "b"]);
  assert.equal(plan.showSuppressedBucket, true);
});

test("names a team when every coarser complement meets the floor", () => {
  const plan = planCombinedSegment(
    [{ key: "a", sliceCount: 5, parents: [10, 5, 5] }],
    [20, 10, 10, 5],
    5,
  );

  assert.equal(plan.hideSlice, false);
  assert.deepEqual(plan.namedKeys, ["a"]);
  assert.equal(plan.showSuppressedBucket, false);
});

test("withholds a team slice when the rest of the survey is 1 or 2", () => {
  const plan = planCombinedSegment(
    [{ key: "a", sliceCount: 5, parents: [5] }],
    [7],
    5,
  );

  assert.equal(plan.hideSlice, true);
  assert.deepEqual(plan.namedKeys, []);
  assert.equal(plan.showSuppressedBucket, false);
});

test("withholds a slice when one within-team parent still leaves 1 or 2", () => {
  const plan = planCombinedSegment(
    [{ key: "a", sliceCount: 5, parents: [6, 20] }],
    [20],
    5,
  );

  assert.equal(plan.hideSlice, true);
  assert.deepEqual(plan.suppressedKeys, ["a"]);
});

test("a zero-count team does not fill in a small complement", () => {
  const plan = planCombinedSegment(
    [
      { key: "a", sliceCount: 3, parents: [4] },
      { key: "d", sliceCount: 0, parents: [5] },
    ],
    [9],
    3,
  );

  assert.equal(plan.hideSlice, true);
  assert.deepEqual(plan.namedKeys, []);
});
