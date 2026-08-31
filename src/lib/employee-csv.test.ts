import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchTeamId,
  parseCsvRecords,
  parseEmployeeCsv,
} from "./employee-csv";

test("parseCsvRecords handles quotes, commas, and CRLF", () => {
  const records = parseCsvRecords(
    'name,email,team\r\n"Lovelace, Ada",ada@x.test,Engineering\n',
  );
  assert.deepEqual(records[1], ["Lovelace, Ada", "ada@x.test", "Engineering"]);
});

test("parseEmployeeCsv keeps a UTF-8 BOM and reordered columns", () => {
  const parsed = parseEmployeeCsv(
    "\uFEFFteam,email,name\nEngineering,ada@x.test,Ada Lovelace\n",
  );
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.rows, [
    {
      line: 2,
      name: "Ada Lovelace",
      email: "ada@x.test",
      team: "Engineering",
    },
  ]);
});

test("parseEmployeeCsv maps headers and rejects bad rows", () => {
  const parsed = parseEmployeeCsv(
    [
      "Name,Email,Team",
      "Ada Lovelace,ada@x.test,Engineering",
      "No Email,,Design",
      "Bad Mail,not-an-email,Product",
      "Ada Clone,ADA@x.test,Operations",
    ].join("\n"),
  );

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.email, "ada@x.test");
  assert.equal(parsed.errors.length, 3);
  assert.match(parsed.errors[0]?.message ?? "", /required/);
  assert.match(parsed.errors[1]?.message ?? "", /Invalid email/);
  assert.match(parsed.errors[2]?.message ?? "", /Duplicate email/);
});

test("parseEmployeeCsv requires name email team columns", () => {
  const parsed = parseEmployeeCsv("foo,bar\n1,2\n");
  assert.equal(parsed.rows.length, 0);
  assert.match(parsed.errors[0]?.message ?? "", /Missing columns/);
});

test("matchTeamId accepts name or slug", () => {
  const teams = [
    { id: "1", name: "Engineering", slug: "engineering" },
    { id: "2", name: "Product", slug: "product" },
  ];
  assert.equal(matchTeamId("engineering", teams), "1");
  assert.equal(matchTeamId("Product", teams), "2");
  assert.equal(matchTeamId("Design", teams), null);
});
