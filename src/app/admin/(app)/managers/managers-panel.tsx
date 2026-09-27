"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { EmployeeListItem } from "@/db/employees";
import type { ManagerAssignment } from "@/db/managers";
import {
  assignManagerAction,
  unassignManagerAction,
  type ManagerActionState,
} from "./actions";

type ManagersPanelProps = {
  assignments: ManagerAssignment[];
  people: EmployeeListItem[];
  dbError: boolean;
};

type RosterFilter = "all" | "assigned" | "unassigned";

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

export function ManagersPanel({ assignments, people, dbError }: ManagersPanelProps) {
  const [query, setQuery] = useState("");
  const [roster, setRoster] = useState<RosterFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageSizeDraft, setPageSizeDraft] = useState(String(DEFAULT_PAGE_SIZE));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assignments.filter((row) => {
      const assigned = Boolean(row.employeeId);
      if (roster === "assigned" && !assigned) {
        return false;
      }
      if (roster === "unassigned" && assigned) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        row.teamName.toLowerCase().includes(needle) ||
        (row.employeeName ?? "").toLowerCase().includes(needle) ||
        (row.employeeEmail ?? "").toLowerCase().includes(needle)
      );
    });
  }, [assignments, query, roster]);

  const filtersActive = query.trim() !== "" || roster !== "all";
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(rangeStart, rangeStart + pageSize);
  const rangeEnd = rangeStart + pageRows.length;
  const assignedCount = assignments.filter((row) => row.employeeId).length;

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
        <h1 className="font-serif text-4xl text-ink">Managers</h1>
        <p className="mt-2 text-ink/60">
          Who leads each team. One manager per team. A person can lead more
          than one.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Search managers</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search team or person"
              className="h-10 w-full rounded-full border border-ink/10 bg-white/70 px-4 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-ink/30"
            />
          </label>
          <label className="relative shrink-0">
            <span className="sr-only">Filter by assignment</span>
            <select
              value={roster}
              onChange={(event) => {
                setRoster(event.target.value as RosterFilter);
                setPage(1);
              }}
              className="h-10 appearance-none rounded-full border border-ink/10 bg-white/70 py-0 pr-9 pl-4 text-sm text-ink outline-none focus:border-ink/30"
            >
              <option value="all">All teams</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </label>
          {filtersActive ? (
            <button
              type="button"
              className="h-10 shrink-0 rounded-full px-3 text-sm text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink"
              onClick={() => {
                setQuery("");
                setRoster("all");
                setPage(1);
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        {!dbError && assignments.length > 0 ? (
          <p className="shrink-0 text-sm text-ink/40">
            {assignedCount} of {assignments.length} teams have a manager
            {filtered.length === 0
              ? ""
              : ` · ${rangeStart + 1}–${rangeEnd} of ${filtered.length}`}
          </p>
        ) : null}
      </div>

      <section className="mt-4">
        {dbError ? (
          <p className="mt-4 text-ink/70">Could not reach Postgres.</p>
        ) : assignments.length === 0 ? (
          <p className="mt-4 text-ink/70">
            No teams yet. Create one on{" "}
            <Link href="/admin/teams" className="underline-offset-4 hover:underline">
              Teams
            </Link>
            .
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-ink/70">No teams match these filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="border-b border-ink/10 text-ink/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">Team</th>
                    <th className="px-4 py-3 font-medium">Manager</th>
                    <th className="px-4 py-3 font-medium">Assign</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.teamId} className="border-t border-ink/5 align-top">
                      <td className="px-4 py-3 font-medium text-ink">{row.teamName}</td>
                      <td className="px-4 py-3 text-ink/70">
                        {row.employeeName ? (
                          <>
                            <span className="text-ink">{row.employeeName}</span>
                            <span className="mt-0.5 block text-xs text-ink/45">
                              {row.employeeEmail}
                              {row.homeTeamName ? ` · ${row.homeTeamName}` : ""}
                            </span>
                          </>
                        ) : (
                          <span className="text-ink/40">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <AssignForm
                          key={`${row.teamId}:${row.employeeId ?? "none"}`}
                          teamId={row.teamId}
                          currentEmployeeId={row.employeeId}
                          people={people}
                        />
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

function AssignForm({
  teamId,
  currentEmployeeId,
  people,
}: {
  teamId: string;
  currentEmployeeId: string | null;
  people: EmployeeListItem[];
}) {
  const [assignState, assignAction, assignPending] = useActionState<
    ManagerActionState,
    FormData
  >(assignManagerAction, null);
  const [clearState, clearAction, clearPending] = useActionState<
    ManagerActionState,
    FormData
  >(unassignManagerAction, null);

  return (
    <div className="flex flex-col gap-2">
      <form action={assignAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="teamId" value={teamId} />
        <label className="sr-only" htmlFor={`manager-${teamId}`}>
          Manager
        </label>
        <select
          id={`manager-${teamId}`}
          name="employeeId"
          defaultValue={currentEmployeeId ?? ""}
          disabled={people.length === 0 || assignPending}
          className="h-9 max-w-full rounded-full border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30 disabled:opacity-50"
        >
          <option value="">
            {people.length === 0 ? "No people yet" : "Choose a person"}
          </option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name} · {person.teamName}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={people.length === 0 || assignPending}
          className="inline-flex h-9 items-center rounded-full bg-ink px-3 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {assignPending ? "Saving…" : currentEmployeeId ? "Change" : "Assign"}
        </button>
      </form>
      {currentEmployeeId ? (
        <form action={clearAction}>
          <input type="hidden" name="teamId" value={teamId} />
          <button
            type="submit"
            disabled={clearPending}
            className="inline-flex h-8 items-center rounded-full px-2 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
          >
            {clearPending ? "Removing…" : "Unassign"}
          </button>
        </form>
      ) : null}
      {assignState?.error || clearState?.error ? (
        <p className="text-xs text-rose-800">{assignState?.error ?? clearState?.error}</p>
      ) : null}
    </div>
  );
}
