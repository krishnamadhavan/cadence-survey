"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { ActionPlanItem } from "@/db/action-plans";
import type { RecommendationSurveyOption } from "@/db/recommendations";
import {
  setActionPlanStatusAction,
  type ActionPlanActionState,
} from "./actions";

type ActionPlansPanelProps = {
  plans: ActionPlanItem[];
  surveys: RecommendationSurveyOption[];
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

export function ActionPlansPanel({ plans, surveys, dbError }: ActionPlansPanelProps) {
  const [query, setQuery] = useState("");
  const [surveyToken, setSurveyToken] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageSizeDraft, setPageSizeDraft] = useState(String(DEFAULT_PAGE_SIZE));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return plans.filter((row) => {
      if (surveyToken !== "all" && row.surveyToken !== surveyToken) {
        return false;
      }
      if (status !== "all" && row.status !== status) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        row.surveyTitle.toLowerCase().includes(needle) ||
        row.teamName.toLowerCase().includes(needle) ||
        row.followUp.toLowerCase().includes(needle)
      );
    });
  }, [plans, query, status, surveyToken]);

  const filtersActive = query.trim() !== "" || surveyToken !== "all" || status !== "all";
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
        <h1 className="font-serif text-4xl text-ink">Action plans</h1>
        <p className="mt-2 text-ink/60">
          Follow-ups taken from recommendations. A team can have one open plan
          per pulse.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Search action plans</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search survey, team, or follow-up"
              className="h-10 w-full rounded-full border border-ink/10 bg-white/70 px-4 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-ink/30"
            />
          </label>
          <label className="relative shrink-0">
            <span className="sr-only">Filter by survey</span>
            <select
              value={surveyToken}
              onChange={(event) => {
                setSurveyToken(event.target.value);
                setPage(1);
              }}
              className="h-10 max-w-full appearance-none rounded-full border border-ink/10 bg-white/70 py-0 pr-9 pl-4 text-sm text-ink outline-none focus:border-ink/30"
            >
              <option value="all">All surveys</option>
              {surveys.map((survey) => (
                <option key={survey.token} value={survey.token}>
                  {survey.title}
                </option>
              ))}
            </select>
          </label>
          <label className="relative shrink-0">
            <span className="sr-only">Filter by status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="h-10 appearance-none rounded-full border border-ink/10 bg-white/70 py-0 pr-9 pl-4 text-sm text-ink outline-none focus:border-ink/30"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>
          </label>
          {filtersActive ? (
            <button
              type="button"
              className="h-10 shrink-0 rounded-full px-3 text-sm text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink"
              onClick={() => {
                setQuery("");
                setSurveyToken("all");
                setStatus("all");
                setPage(1);
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        {!dbError && plans.length > 0 ? (
          <p className="shrink-0 text-sm text-ink/40">
            {filtered.length === 0
              ? "0 plans"
              : `${rangeStart + 1}–${rangeEnd} of ${filtered.length}`}
          </p>
        ) : null}
      </div>

      <section className="mt-4">
        {dbError ? (
          <p className="mt-4 text-ink/70">Could not reach Postgres.</p>
        ) : plans.length === 0 ? (
          <p className="mt-4 text-ink/70">
            No plans yet. Add one from{" "}
            <Link href="/admin/recommendations" className="underline-offset-4 hover:underline">
              Recommendations
            </Link>
            .
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-ink/70">No plans match these filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="border-b border-ink/10 text-ink/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">Survey</th>
                    <th className="px-4 py-3 font-medium">Team</th>
                    <th className="px-4 py-3 font-medium">Follow-up</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Opened</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-t border-ink/5 align-top">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/reports/${row.surveyToken}`}
                          className="font-medium text-ink underline-offset-4 hover:underline"
                        >
                          {row.surveyTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink/70">{row.teamName}</td>
                      <td className="max-w-md px-4 py-3 text-ink">{row.followUp}</td>
                      <td className="px-4 py-3">
                        <span className={statusClass(row.status)}>
                          {row.status === "open" ? "Open" : "Done"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink/70">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusButton id={row.id} status={row.status} />
                      </td>
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

function StatusButton({ id, status }: { id: string; status: "open" | "done" }) {
  const [state, action, pending] = useActionState<ActionPlanActionState, FormData>(
    setActionPlanStatusAction,
    null,
  );
  const next = status === "open" ? "done" : "open";
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8 items-center rounded-full border border-ink/15 px-3 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
      >
        {pending ? "Saving…" : status === "open" ? "Mark done" : "Reopen"}
      </button>
      {state?.error ? <p className="text-xs text-rose-800">{state.error}</p> : null}
    </form>
  );
}

function statusClass(status: "open" | "done") {
  if (status === "done") {
    return "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800";
  }
  return "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900";
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
