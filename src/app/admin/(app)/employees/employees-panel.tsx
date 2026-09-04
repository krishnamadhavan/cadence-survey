"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { EmployeeListItem } from "@/db/employees";
import { UploadForm } from "./upload-form";

type TeamOption = {
  id: string;
  name: string;
};

type EmployeesPanelProps = {
  people: EmployeeListItem[];
  teams: TeamOption[];
  dbError: boolean;
};

const DEFAULT_PAGE_SIZE = 25;
const MIN_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 200;

function visiblePages(
  current: number,
  total: number,
): Array<number | "gap"> {
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

export function EmployeesPanel({ people, teams, dbError }: EmployeesPanelProps) {
  const [query, setQuery] = useState("");
  const [teamId, setTeamId] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageSizeDraft, setPageSizeDraft] = useState(String(DEFAULT_PAGE_SIZE));
  const [importOpen, setImportOpen] = useState(false);
  const importButtonRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return people.filter((person) => {
      if (teamId !== "all" && person.teamId !== teamId) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        person.name.toLowerCase().includes(needle) ||
        person.email.toLowerCase().includes(needle)
      );
    });
  }, [people, query, teamId]);

  const filtersActive = query.trim() !== "" || teamId !== "all";
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(rangeStart, rangeStart + pageSize);
  const rangeEnd = rangeStart + pageRows.length;

  function resetToFirstPage() {
    setPage(1);
  }

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-4xl text-ink">Employees</h1>
          <p className="mt-2 text-ink/60">
            Search the roster, filter by team, or import a CSV.
          </p>
        </div>
        <button
          ref={importButtonRef}
          type="button"
          className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={dbError}
          onClick={() => setImportOpen(true)}
        >
          <ImportIcon />
          Import
        </button>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Search employees</span>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink/35">
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetToFirstPage();
              }}
              placeholder="Search name or email"
              className="h-10 w-full rounded-full border border-ink/10 bg-white/70 pr-3 pl-9 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-ink/30"
            />
          </label>
          <label className="relative shrink-0">
            <span className="sr-only">Filter by team</span>
            <select
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value);
                resetToFirstPage();
              }}
              className="h-10 appearance-none rounded-full border border-ink/10 bg-white/70 py-0 pr-9 pl-4 text-sm text-ink outline-none focus:border-ink/30"
            >
              <option value="all">All teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
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
                setTeamId("all");
                resetToFirstPage();
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        {!dbError && people.length > 0 ? (
          <p className="shrink-0 text-sm text-ink/40">
            {filtered.length === 0
              ? "0 people"
              : `${rangeStart + 1}–${rangeEnd} of ${filtered.length}`}
          </p>
        ) : null}
      </div>

      <section className="mt-4">
        {dbError ? (
          <p className="mt-4 text-ink/70">Could not reach Postgres.</p>
        ) : people.length === 0 ? (
          <p className="mt-4 text-ink/70">No employees yet. Import a CSV.</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-ink/70">No employees match these filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="border-b border-ink/10 text-ink/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Team</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((person) => (
                    <tr key={person.id} className="border-t border-ink/5">
                      <td className="px-4 py-3 font-medium text-ink">
                        {person.name}
                      </td>
                      <td className="px-4 py-3 text-ink/70">{person.email}</td>
                      <td className="px-4 py-3 text-ink/70">{person.teamName}</td>
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

      {importOpen ? (
        <ImportModal
          teams={teams}
          dbError={dbError}
          onClose={() => setImportOpen(false)}
          returnFocusRef={importButtonRef}
        />
      ) : null}
    </>
  );
}

function ImportModal({
  teams,
  dbError,
  onClose,
  returnFocusRef,
}: {
  teams: TeamOption[];
  dbError: boolean;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const returnTo = returnFocusRef.current;
    closeRef.current?.focus();
    return () => {
      (returnTo ?? previous)?.focus();
    };
  }, [returnFocusRef]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        trapTab(event, dialogRef.current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close import"
        tabIndex={-1}
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex h-[min(44rem,90dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
          <div>
            <h2 id={titleId} className="font-serif text-3xl text-ink">
              Import employees
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              CSV columns: <code className="font-mono text-xs">name</code>,{" "}
              <code className="font-mono text-xs">email</code>,{" "}
              <code className="font-mono text-xs">team</code>. Team must match
              one of:{" "}
              {teams.length > 0
                ? teams.map((team) => team.name).join(", ")
                : "seed teams first"}
              .{" "}
              <a
                href="/api/admin/employees/template"
                className="font-medium text-accent underline-offset-4 hover:underline"
              >
                Download template
              </a>
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink/10 text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>

        {dbError ? (
          <>
            <p className="flex-1 px-6 py-5 text-sm text-ink/70">
              Could not reach Postgres. Import is disabled until the database is
              up.
            </p>
            <div className="flex items-center justify-end border-t border-ink/10 px-6 py-4">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <UploadForm onCancel={onClose} />
        )}
      </div>
    </div>
  );
}

function focusableElements(root: HTMLElement) {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.tabIndex !== -1);
}

function trapTab(event: KeyboardEvent, root: HTMLElement | null) {
  if (!root) {
    return;
  }
  const list = focusableElements(root);
  if (list.length === 0) {
    event.preventDefault();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
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

function ImportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3v7M5 7.5 8 10.5 11 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 12.5h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="m4 4 8 8M12 4 4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
