export const AUDIT_SORTS = ["when", "who", "action", "detail"] as const;

export type AuditSort = (typeof AUDIT_SORTS)[number];

export type AuditDirection = "asc" | "desc";

export const AUDIT_PAGE_SIZE_DEFAULT = 25;
export const AUDIT_PAGE_SIZE_MIN = 5;
export const AUDIT_PAGE_SIZE_MAX = 200;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TZ_MIN = -14 * 60;
const TZ_MAX = 14 * 60;

export type AuditSearchParams = {
  q?: string | string[];
  from?: string | string[];
  to?: string | string[];
  tz?: string | string[];
  sort?: string | string[];
  dir?: string | string[];
  page?: string | string[];
  size?: string | string[];
};

export type ParsedAuditSearch = {
  q: string;
  from: string;
  to: string;
  tz: string;
  offsetMinutes: number;
  sort: AuditSort;
  direction: AuditDirection;
  page: number;
  pageSize: number;
  error: string | null;
  fromInstant: Date | null;
  toExclusive: Date | null;
};

export type AuditHrefState = {
  q: string;
  from: string;
  to: string;
  tz: string;
  sort: AuditSort;
  direction: AuditDirection;
  page: number;
  pageSize: number;
};

function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

function parseDay(value: string): string | null {
  const match = DATE_RE.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

export function auditDayStart(isoDate: string, offsetMinutes: number): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) + offsetMinutes * 60_000);
}

export function auditDayAfter(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  utc.setUTCDate(utc.getUTCDate() + 1);
  return utc.toISOString().slice(0, 10);
}

function parseOffset(value: string): number {
  if (!/^-?\d+$/.test(value)) {
    return 0;
  }
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < TZ_MIN || minutes > TZ_MAX) {
    return 0;
  }
  return minutes;
}

function parsePageSize(value: string): number {
  if (!/^\d+$/.test(value)) {
    return AUDIT_PAGE_SIZE_DEFAULT;
  }
  return Math.min(AUDIT_PAGE_SIZE_MAX, Math.max(AUDIT_PAGE_SIZE_MIN, Number(value)));
}

function parsePage(value: string): number {
  if (!/^\d+$/.test(value)) {
    return 1;
  }
  const parsed = Number(value);
  return parsed > 0 ? parsed : 1;
}

export function parseAuditSearch(params: AuditSearchParams): ParsedAuditSearch {
  const q = first(params.q).slice(0, 200);
  const fromRaw = first(params.from);
  const toRaw = first(params.to);
  const tz = first(params.tz);
  const sortRaw = first(params.sort);
  const dirRaw = first(params.dir);
  const sort: AuditSort = (AUDIT_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as AuditSort)
    : "when";
  const direction: AuditDirection =
    dirRaw === "asc" || dirRaw === "desc" ? dirRaw : sort === "when" ? "desc" : "asc";
  const offsetMinutes = tz ? parseOffset(tz) : 0;

  let error: string | null = null;
  let from = "";
  let to = "";
  if (fromRaw) {
    const parsed = parseDay(fromRaw);
    if (!parsed) {
      error = "Enter dates as YYYY-MM-DD.";
    } else {
      from = parsed;
    }
  }
  if (!error && toRaw) {
    const parsed = parseDay(toRaw);
    if (!parsed) {
      error = "Enter dates as YYYY-MM-DD.";
    } else {
      to = parsed;
    }
  }
  if (!error && from && to && from > to) {
    error = "The start date is after the end date.";
  }

  return {
    q,
    from: error ? fromRaw : from,
    to: error ? toRaw : to,
    tz,
    offsetMinutes,
    sort,
    direction,
    page: parsePage(first(params.page)),
    pageSize: parsePageSize(first(params.size)),
    error,
    fromInstant: !error && from ? auditDayStart(from, offsetMinutes) : null,
    toExclusive: !error && to ? auditDayStart(auditDayAfter(to), offsetMinutes) : null,
  };
}

export function nextAuditDirection(
  currentSort: AuditSort,
  currentDirection: AuditDirection,
  column: AuditSort,
): AuditDirection {
  if (currentSort !== column) {
    return column === "when" ? "desc" : "asc";
  }
  return currentDirection === "asc" ? "desc" : "asc";
}

export function auditLogHref(input: AuditHrefState): string {
  const params = new URLSearchParams();
  if (input.q) {
    params.set("q", input.q);
  }
  if (input.from) {
    params.set("from", input.from);
  }
  if (input.to) {
    params.set("to", input.to);
  }
  if (input.tz) {
    params.set("tz", input.tz);
  }
  if (input.sort !== "when" || input.direction !== "desc") {
    params.set("sort", input.sort);
    params.set("dir", input.direction);
  }
  if (input.page > 1) {
    params.set("page", String(input.page));
  }
  if (input.pageSize !== AUDIT_PAGE_SIZE_DEFAULT) {
    params.set("size", String(input.pageSize));
  }
  const query = params.toString();
  return query ? `/admin/audit-log?${query}` : "/admin/audit-log";
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
