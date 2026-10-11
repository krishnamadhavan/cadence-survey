import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditLogHref,
  escapeLike,
  nextAuditDirection,
  parseAuditSearch,
} from "./audit-search";

const base = {
  q: "",
  from: "",
  to: "",
  tz: "",
  sort: "when" as const,
  direction: "desc" as const,
  page: 1,
  pageSize: 25,
};

test("audit search parses text, dates, sort, and page size", () => {
  const parsed = parseAuditSearch({
    q: "  Ada  ",
    from: "2026-02-01",
    to: "2026-02-01",
    tz: "-330",
    sort: "who",
    dir: "desc",
    page: "2",
    size: "10",
  });
  assert.equal(parsed.error, null);
  assert.equal(parsed.q, "Ada");
  assert.equal(parsed.sort, "who");
  assert.equal(parsed.direction, "desc");
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 10);
  assert.equal(parsed.fromInstant?.toISOString(), "2026-01-31T18:30:00.000Z");
  assert.equal(parsed.toExclusive?.toISOString(), "2026-02-01T18:30:00.000Z");
  assert.equal(parseAuditSearch({}).sort, "when");
  assert.equal(parseAuditSearch({}).direction, "desc");
  assert.equal(parseAuditSearch({ sort: "detail" }).direction, "asc");
  assert.equal(parseAuditSearch({ size: "1" }).pageSize, 5);
  assert.equal(parseAuditSearch({ size: "999" }).pageSize, 200);
  assert.equal(parseAuditSearch({ page: "0" }).page, 1);
  assert.equal(parseAuditSearch({ from: "2026-02-31" }).error, "Enter dates as YYYY-MM-DD.");
  assert.equal(
    parseAuditSearch({ from: "2026-03-02", to: "2026-03-01" }).error,
    "The start date is after the end date.",
  );
  assert.equal(parseAuditSearch({ tz: "nope", from: "2026-02-01" }).fromInstant?.toISOString(), "2026-02-01T00:00:00.000Z");
});

test("audit column clicks toggle sort and keep the filters", () => {
  assert.equal(nextAuditDirection("when", "desc", "when"), "asc");
  assert.equal(nextAuditDirection("when", "asc", "when"), "desc");
  assert.equal(nextAuditDirection("when", "desc", "who"), "asc");
  assert.equal(nextAuditDirection("who", "asc", "when"), "desc");
  assert.equal(auditLogHref(base), "/admin/audit-log");
  assert.equal(
    auditLogHref({
      ...base,
      q: "Ada",
      from: "2026-02-01",
      tz: "-330",
      sort: "detail",
      direction: "asc",
      page: 3,
      pageSize: 50,
    }),
    "/admin/audit-log?q=Ada&from=2026-02-01&tz=-330&sort=detail&dir=asc&page=3&size=50",
  );
  assert.equal(escapeLike("100%_a\\b"), "100\\%\\_a\\\\b");
});
