"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { AdminSurveyListItem } from "@/db/queries";
import type { SurveyStatus } from "@/db/schema";
import {
  allowedSurveyTransitions,
  formatSurveyStatus,
} from "@/lib/survey-status";
import {
  setSurveyStatusAction,
  type SurveyActionState,
} from "./survey-actions";

type SurveysPanelProps = {
  surveys: AdminSurveyListItem[];
  dbError: boolean;
};

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

export function SurveysPanel({ surveys, dbError }: SurveysPanelProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | SurveyStatus>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageSizeDraft, setPageSizeDraft] = useState(String(DEFAULT_PAGE_SIZE));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = surveys.filter((survey) => {
      if (status !== "all" && survey.status !== status) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        survey.title.toLowerCase().includes(needle) ||
        survey.publicToken.toLowerCase().includes(needle)
      );
    });
    rows.sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
    return rows;
  }, [surveys, query, status]);

  const filtersActive = query.trim() !== "" || status !== "all";
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
        <h1 className="font-serif text-4xl text-ink">Surveys</h1>
        <p className="mt-2 text-ink/60">
          Open a draft to collect answers, or close a live pulse when you are
          done.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Search surveys</span>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink/35">
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search name or token"
              className="h-10 w-full rounded-full border border-ink/10 bg-white/70 pr-3 pl-9 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-ink/30"
            />
          </label>
          <label className="relative shrink-0">
            <span className="sr-only">Filter by status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as "all" | SurveyStatus);
                setPage(1);
              }}
              className="h-10 appearance-none rounded-full border border-ink/10 bg-white/70 py-0 pr-9 pl-4 text-sm text-ink outline-none focus:border-ink/30"
            >
              <option value="all">All statuses</option>
              <option value="open">Live</option>
              <option value="closed">Closed</option>
              <option value="draft">Draft</option>
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink/40">
              <ChevronIcon />
            </span>
          </label>
          {filtersActive ? (
            <button
              type="button"
              className="h-10 shrink-0 rounded-full px-3 text-sm text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink"
              onClick={() => {
                setQuery("");
                setStatus("all");
                setPage(1);
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        {!dbError && surveys.length > 0 ? (
          <p className="shrink-0 text-sm text-ink/40">
            {filtered.length === 0
              ? "0 surveys"
              : `${rangeStart + 1}–${rangeEnd} of ${filtered.length}`}
          </p>
        ) : null}
      </div>

      <section className="mt-4">
        {dbError ? (
          <p className="mt-4 text-ink/70">Could not reach Postgres.</p>
        ) : surveys.length === 0 ? (
          <p className="mt-4 text-ink/70">
            No surveys yet. Use a template or run the seed.
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-ink/70">No surveys match these filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="border-b border-ink/10 text-ink/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Responses</th>
                    <th className="px-4 py-3 font-medium">Questions</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((survey) => (
                    <tr key={survey.id} className="border-t border-ink/5">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/s/${survey.publicToken}`}
                          className="font-medium text-ink underline-offset-4 hover:underline"
                        >
                          {survey.title}
                        </Link>
                        <p className="mt-0.5 font-mono text-xs text-ink/40">
                          /s/{survey.publicToken}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={survey.status} />
                      </td>
                      <td className="px-4 py-3 text-ink/70">
                        {survey.responseCount}
                      </td>
                      <td className="px-4 py-3 text-ink/70">
                        {survey.questionCount}
                      </td>
                      <td className="px-4 py-3 text-ink/70">
                        {formatDate(survey.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <SurveyStatusButton survey={survey} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <nav
                aria-label="Pagination"
                className="flex flex-wrap items-center gap-1"
              >
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
                    <span
                      key={`gap-${index}`}
                      className="px-1.5 text-sm text-ink/35"
                    >
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

function SurveyStatusButton({ survey }: { survey: AdminSurveyListItem }) {
  const [state, action, pending] = useActionState<SurveyActionState, FormData>(
    setSurveyStatusAction,
    null,
  );
  const next = allowedSurveyTransitions(survey.status, survey.questionCount)[0];
  if (!next) {
    return (
      <p className="text-right text-xs text-ink/40">Add a question first</p>
    );
  }

  const label =
    next === "open"
      ? survey.status === "closed"
        ? "Reopen"
        : "Open"
      : "Close";

  return (
    <form action={action} className="flex flex-col items-end">
      <input type="hidden" name="token" value={survey.publicToken} />
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full px-3 py-1.5 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-35"
      >
        {pending ? "Saving…" : label}
      </button>
      {state?.error ? (
        <p className="max-w-40 pt-1 text-right text-xs text-rose-800">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function StatusPill({ status }: { status: SurveyStatus }) {
  return (
    <span className="rounded-full border border-ink/10 px-2.5 py-0.5 text-xs font-medium text-ink/60">
      {formatSurveyStatus(status)}
    </span>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m10.5 10.5 3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
