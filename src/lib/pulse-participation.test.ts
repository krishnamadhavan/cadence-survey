import assert from "node:assert/strict";
import { test } from "node:test";
import { groupParticipation, type ParticipationRow } from "./pulse-participation";

test("participation lists the teams furthest behind first", () => {
  const rows: ParticipationRow[] = [
    person("eng", "Engineering", "Cam", "cam@cadence.test", true, "secret-cam"),
    person("design", "Design", "Bea", "bea@cadence.test", false, "token-bea"),
    person("design", "Design", "Ada", "ada@cadence.test", false, "token-ada"),
    person("product", "Product", "Dee", "dee@cadence.test", true, "secret-dee"),
    person("product", "Product", "Cy", "cy@cadence.test", false, "token-cy"),
  ];

  const grouped = groupParticipation(rows);

  assert.equal(grouped.total, 5);
  assert.equal(grouped.responded, 2);
  assert.deepEqual(
    grouped.teams.map((team) => team.teamName),
    ["Design", "Product", "Engineering"],
  );
  assert.deepEqual(
    grouped.teams.map((team) => [team.responded, team.total]),
    [
      [0, 2],
      [1, 2],
      [1, 1],
    ],
  );

  const design = grouped.teams[0];
  assert.ok(design);
  assert.deepEqual(
    design.waiting.map((personRow) => personRow.email),
    ["ada@cadence.test", "bea@cadence.test"],
  );
  assert.deepEqual(
    design.waiting.map((personRow) => personRow.token),
    ["token-ada", "token-bea"],
  );

  const product = grouped.teams[1];
  assert.ok(product);
  assert.deepEqual(
    product.waiting.map((personRow) => personRow.email),
    ["cy@cadence.test"],
  );

  const engineering = grouped.teams[2];
  assert.ok(engineering);
  assert.deepEqual(engineering.waiting, []);
  const encoded = JSON.stringify(grouped);
  assert.equal(encoded.includes("secret-cam"), false);
  assert.equal(encoded.includes("secret-dee"), false);
});

test("equal progress puts the team with more people still waiting first", () => {
  const grouped = groupParticipation([
    person("small", "Small", "Ann", "ann@cadence.test", false, "a"),
    person("large", "Large", "Bo", "bo@cadence.test", false, "b"),
    person("large", "Large", "Cy", "cy@cadence.test", false, "c"),
  ]);

  assert.deepEqual(
    grouped.teams.map((team) => team.teamName),
    ["Large", "Small"],
  );
});

function person(
  teamId: string,
  teamName: string,
  name: string,
  email: string,
  answered: boolean,
  token: string,
): ParticipationRow {
  return { teamId, teamName, name, email, answered, token };
}
