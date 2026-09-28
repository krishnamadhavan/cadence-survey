"use client";

import { useMemo, useState } from "react";
import type { AuditEvent } from "@/db/audit-log";

const DEFAULT_PAGE_SIZE = 25;
const MIN_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 200;

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

const actionLabel: Record<string, string> = {
  "admin.added": "Admin added",
  "admin.removed": "Admin removed",
  "manager.assigned": "Manager assigned",
  "manager.unassigned": "Manager unassigned",
  "api_key.created": "API key created",
  "api_key.revoked": "API key revoked",
  "anonymity_floor.changed": "Anonymity floor",
  "employees.reassigned": "People moved",
};

export function AuditLogPanel({
  events,
  dbError,
}: {
  events: AuditEvent[];
  dbError: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageSizeDraft, setPageSizeDraft] = useState(String(DEFAULT_PAGE_SIZE));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return events;
    }
    return events.filter((event) => {
      const label = actionLabel[event.action] ?? event.action;
      return (
        event.actorEmail.toLowerCase().includes(needle) ||
        event.summary.toLowerCase().includes(needle) ||
        label.toLowerCase().includes(needle)
      );
    });
  }, [events, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(rangeStart, rangeStart + pageSize);
  const rangeEnd = rangeStart + pageRows.length;

  function applyPageSize() {
    const parsed = Number.parseInt(pageSizeDraft, 10);
    if (!Number.isFinite(parsed)) {
      setPageSizeDraft(String(pageSize));
      return;
    }
    const next = Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, parsed));
    setPageSizeDraft(String(next));
    if (next === pageSize) {
      return;
    }
    setPageSize(next);
    setPage(1);
  }

  return (
    <>
      <div className="min-w-0">
        <h1 className="font-serif text-4xl text-ink">Audit log</h1>
        <p className="mt-2 text-ink/60">
          Who changed admins, managers, API keys, and the anonymity floor.
          Newest first.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search the audit log</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search person, action, or detail"
            className="h-10 w-full rounded-full border border-ink/10 bg-white/70 px-4 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-ink/30"
          />
        </label>
        {!dbError && events.length > 0 ? (
          <p className="shrink-0 text-sm text-ink/40">
            {filtered.length === 0
              ? "0 events"
              : `${rangeStart + 1}–${rangeEnd} of ${filtered.length}`}
          </p>
        ) : null}
      </div>

      <section className="mt-4">
        {dbError ? (
          <p className="text-ink/70">Could not reach Postgres.</p>
        ) : events.length === 0 ? (
          <p className="text-ink/70">No admin actions recorded yet.</p>
        ) : filtered.length === 0 ? (
          <p className="text-ink/70">No events match that search.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-ink/10 text-ink/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Who</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((event) => (
                    <tr key={event.id} className="border-t border-ink/5 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-ink/70">
                        {formatWhen(event.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-ink">{event.actorEmail}</td>
                      <td className="px-4 py-3 text-ink/70">
                        {actionLabel[event.action] ?? event.action}
                      </td>
                      <td className="px-4 py-3 text-ink">{event.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-full px-3 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-35"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </button>
                {visiblePages(currentPage, totalPages).map((item, index) =>
                  item === "gap" ? (
                    <span key={`gap-${index}`} className="px-1.5 text-sm text-ink/35">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      aria-current={item === currentPage ? "page" : undefined}
                      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-sm transition-colors ${
                        item === currentPage
                          ? "bg-ink text-paper"
                          : "text-ink/60 hover:bg-ink/5 hover:text-ink"
                      }`}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-full px-3 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-35"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </nav>
              <label className="flex items-center justify-end gap-2 text-sm text-ink/50">
                Per page
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_PAGE_SIZE}
                  max={MAX_PAGE_SIZE}
                  value={pageSizeDraft}
                  aria-label="Rows per page"
                  className="h-9 w-16 rounded-full border border-ink/10 bg-white/70 px-3 text-center text-sm text-ink outline-none focus:border-ink/30"
                  onChange={(event) => setPageSizeDraft(event.target.value)}
                  onBlur={applyPageSize}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyPageSize();
                    }
                  }}
                />
              </label>
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
