import Link from "next/link";
import type { AuditEvent } from "@/db/audit-log";
import { auditActionLabel } from "@/lib/audit-csv";
import {
  auditLogHref,
  nextAuditDirection,
  type AuditHrefState,
  type AuditSort,
} from "@/lib/audit-search";
import { AuditLogFilters, AuditPageSize } from "./audit-log-controls";

const COLUMNS: Array<{ key: AuditSort; label: string }> = [
  { key: "when", label: "When" },
  { key: "who", label: "Who" },
  { key: "action", label: "Action" },
  { key: "detail", label: "Detail" },
];

function visiblePages(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  const items: Array<number | "gap"> = [1];
  if (start > 2) {
    items.push("gap");
  }
  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    items.push(pageNumber);
  }
  if (end < total - 1) {
    items.push("gap");
  }
  items.push(total);
  return items;
}

function columnHref(state: AuditHrefState, column: AuditSort) {
  return auditLogHref({
    ...state,
    sort: column,
    direction: nextAuditDirection(state.sort, state.direction, column),
    page: 1,
  });
}

export function AuditLogPanel({
  events,
  total,
  dbError,
  error,
  state,
}: {
  events: AuditEvent[];
  total: number;
  dbError: boolean;
  error: string | null;
  state: AuditHrefState;
}) {
  const filtersActive = Boolean(state.q || state.from || state.to);
  const showCount = !dbError && !error && (total > 0 || filtersActive);
  const rangeStart = total === 0 ? 0 : (state.page - 1) * state.pageSize;
  const rangeEnd = rangeStart + events.length;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  const endClass =
    "inline-flex h-9 items-center rounded-full px-3 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink";

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-4xl text-ink">Audit log</h1>
          <p className="mt-2 text-ink/60">
            Who did what, and when. Search the person, action, or detail, filter by
            date, and click a column to sort. The CSV is the whole log, not just this
            page.
          </p>
        </div>
        {dbError ? null : (
          <a
            href="/api/admin/audit-log"
            className="inline-flex h-10 shrink-0 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            Download CSV
          </a>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <AuditLogFilters
          key={`${state.q}|${state.from}|${state.to}|${state.sort}|${state.direction}|${state.tz}`}
          state={state}
        />
        {showCount ? (
          <p className="shrink-0 text-sm text-ink/40">
            {total === 0 ? "0 events" : `${rangeStart + 1}–${rangeEnd} of ${total}`}
          </p>
        ) : null}
      </div>

      <section className="mt-4">
        {dbError ? (
          <p className="text-ink/70">Could not reach Postgres.</p>
        ) : error ? (
          <p className="text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : total === 0 ? (
          <p className="text-ink/70">
            {filtersActive
              ? "No events match that search."
              : "No admin actions recorded yet."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-ink/10 text-ink/45">
                  <tr>
                    {COLUMNS.map((column) => {
                      const active = state.sort === column.key;
                      return (
                        <th
                          key={column.key}
                          scope="col"
                          aria-sort={
                            active
                              ? state.direction === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                          className="px-4 py-3 font-medium"
                        >
                          <Link
                            href={columnHref(state, column.key)}
                            scroll={false}
                            className="inline-flex items-center gap-1.5 hover:text-ink"
                          >
                            {column.label}
                            <span
                              aria-hidden="true"
                              className={active ? "text-ink/70" : "text-ink/25"}
                            >
                              {active ? (state.direction === "asc" ? "↑" : "↓") : "↕"}
                            </span>
                          </Link>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-t border-ink/5 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-ink/70">
                        {formatWhen(event.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-ink">{event.actorEmail}</td>
                      <td className="px-4 py-3 text-ink/70">
                        {auditActionLabel(event.action)}
                      </td>
                      <td className="px-4 py-3 text-ink">{event.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1">
                {state.page <= 1 ? (
                  <span className={`${endClass} pointer-events-none opacity-35`} aria-disabled="true">
                    Previous
                  </span>
                ) : (
                  <Link
                    href={auditLogHref({ ...state, page: state.page - 1 })}
                    scroll={false}
                    className={endClass}
                  >
                    Previous
                  </Link>
                )}
                {visiblePages(state.page, totalPages).map((item, index) =>
                  item === "gap" ? (
                    <span key={`gap-${index}`} className="px-1.5 text-sm text-ink/35">
                      …
                    </span>
                  ) : item === state.page ? (
                    <span
                      key={item}
                      aria-current="page"
                      className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-ink px-2.5 text-sm text-paper"
                    >
                      {item}
                    </span>
                  ) : (
                    <Link
                      key={item}
                      href={auditLogHref({ ...state, page: item })}
                      scroll={false}
                      className="inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
                    >
                      {item}
                    </Link>
                  ),
                )}
                {state.page >= totalPages ? (
                  <span className={`${endClass} pointer-events-none opacity-35`} aria-disabled="true">
                    Next
                  </span>
                ) : (
                  <Link
                    href={auditLogHref({ ...state, page: state.page + 1 })}
                    scroll={false}
                    className={endClass}
                  >
                    Next
                  </Link>
                )}
              </nav>
              <AuditPageSize key={state.pageSize} state={state} />
            </div>
          </>
        )}
      </section>
    </>
  );
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
