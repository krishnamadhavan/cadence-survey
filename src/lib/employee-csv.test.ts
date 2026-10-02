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
  assert.equal(parsed.columns.role, false);
  assert.equal(parsed.columns.tenure, false);
  assert.deepEqual(parsed.rows, [
    {
      line: 2,
      name: "Ada Lovelace",
      email: "ada@x.test",
      team: "Engineering",
      role: null,
      tenureBand: null,
    },
  ]);
});

test("parseEmployeeCsv reads role and tenure and rejects an unknown band", () => {
  const parsed = parseEmployeeCsv(
    [
      "name,email,team,role,tenure",
      "Ada Lovelace,ada@x.test,Engineering,  Product designer  , <1yr",
      "Bea,bea@x.test,Product,Engineer,1-3yr",
      "Cam,cam@x.test,Design,Lead,3yr+",
      "Dee,dee@x.test,Operations,Ops,forever",
    ].join("\n"),
  );
  assert.equal(parsed.columns.role, true);
  assert.equal(parsed.columns.tenure, true);
  assert.deepEqual(
    parsed.rows.map((row) => [row.email, row.role, row.tenureBand]),
    [
      ["ada@x.test", "Product designer", "lt_1"],
      ["bea@x.test", "Engineer", "y1_3"],
      ["cam@x.test", "Lead", "gte_3"],
    ],
  );
  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0]?.message ?? "", /Tenure must be/);
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
