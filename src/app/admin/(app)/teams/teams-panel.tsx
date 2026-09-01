"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import type { TeamListItem } from "@/db/teams";
import { slugifyTeam } from "@/lib/team-slug";
import {
  createTeamAction,
  deleteTeamAction,
  updateTeamAction,
  type TeamActionState,
} from "./actions";

type RosterFilter = "all" | "staffed" | "empty";

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; team: TeamListItem }
  | { kind: "delete"; team: TeamListItem };

type TeamsPanelProps = {
  teams: TeamListItem[];
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

export function TeamsPanel({ teams, dbError }: TeamsPanelProps) {
  const [query, setQuery] = useState("");
  const [roster, setRoster] = useState<RosterFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageSizeDraft, setPageSizeDraft] = useState(String(DEFAULT_PAGE_SIZE));
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return teams.filter((team) => {
      if (roster === "staffed" && team.employeeCount === 0) {
        return false;
      }
      if (roster === "empty" && team.employeeCount > 0) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        team.name.toLowerCase().includes(needle) ||
        team.slug.toLowerCase().includes(needle)
      );
    });
  }, [teams, query, roster]);

  const filtersActive = query.trim() !== "" || roster !== "all";
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(rangeStart, rangeStart + pageSize);
  const rangeEnd = rangeStart + pageRows.length;
  const peopleTotal = teams.reduce((sum, team) => sum + team.employeeCount, 0);

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
    setPageSize(next);
    setPageSizeDraft(String(next));
    setPage(1);
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-4xl text-ink">Teams</h1>
          <p className="mt-2 text-ink/60">
            Create, rename, and retire teams used on the roster and pulses.
          </p>
        </div>
        <button
          ref={newButtonRef}
          type="button"
          className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={dbError}
          onClick={() => setDialog({ kind: "create" })}
        >
          <PlusIcon />
          New team
        </button>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Search teams</span>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink/35">
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetToFirstPage();
              }}
              placeholder="Search name or slug"
              className="h-10 w-full rounded-full border border-ink/10 bg-white/70 pr-3 pl-9 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-ink/30"
            />
          </label>
          <label className="relative shrink-0">
            <span className="sr-only">Filter by roster</span>
            <select
              value={roster}
              onChange={(event) => {
                setRoster(event.target.value as RosterFilter);
                resetToFirstPage();
              }}
              className="h-10 appearance-none rounded-full border border-ink/10 bg-white/70 py-0 pr-9 pl-4 text-sm text-ink outline-none focus:border-ink/30"
            >
              <option value="all">All teams</option>
              <option value="staffed">With people</option>
              <option value="empty">Empty</option>
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
                setRoster("all");
                resetToFirstPage();
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        {!dbError && teams.length > 0 ? (
          <p className="shrink-0 text-sm text-ink/40">
            {filtered.length === 0
              ? "0 teams"
              : `${rangeStart + 1}–${rangeEnd} of ${filtered.length}`}
            {` · ${peopleTotal} ${peopleTotal === 1 ? "person" : "people"}`}
          </p>
        ) : null}
      </div>

      <section className="mt-4">
        {dbError ? (
          <p className="mt-4 text-ink/70">Could not reach Postgres.</p>
        ) : teams.length === 0 ? (
          <p className="mt-4 text-ink/70">No teams yet. Create one.</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-ink/70">No teams match these filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-ink/10 text-ink/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">People</th>
                    <th className="px-4 py-3 font-medium">Responses</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((team) => {
                    const inUse = team.employeeCount + team.responseCount > 0;
                    return (
                      <tr key={team.id} className="border-t border-ink/5">
                        <td className="px-4 py-3 font-medium text-ink">
                          {team.name}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-ink/60">
                          {team.slug}
                        </td>
                        <td className="px-4 py-3 text-ink/70">
                          {team.employeeCount}
                        </td>
                        <td className="px-4 py-3 text-ink/70">
                          {team.responseCount}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="rounded-full px-3 py-1.5 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
                              onClick={() => setDialog({ kind: "edit", team })}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded-full px-3 py-1.5 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-35"
                              disabled={inUse}
                              title={
                                inUse
                                  ? "Move people and responses first"
                                  : "Delete team"
                              }
                              onClick={() => setDialog({ kind: "delete", team })}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

      {dialog ? (
        <TeamDialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          returnFocusRef={newButtonRef}
        />
      ) : null}
    </>
  );
}

function TeamDialog({
  dialog,
  onClose,
  returnFocusRef,
}: {
  dialog: Dialog;
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
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const title =
    dialog.kind === "create"
      ? "New team"
      : dialog.kind === "edit"
        ? "Edit team"
        : "Delete team";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
          <h2 id={titleId} className="font-serif text-3xl text-ink">
            {title}
          </h2>
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
        {dialog.kind === "delete" ? (
          <DeleteTeamForm team={dialog.team} onCancel={onClose} />
        ) : (
          <TeamForm
            team={dialog.kind === "edit" ? dialog.team : null}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
}

function TeamForm({
  team,
  onCancel,
}: {
  team: TeamListItem | null;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<TeamActionState, FormData>(
    team ? updateTeamAction : createTeamAction,
    null,
  );
  const [name, setName] = useState(team?.name ?? "");
  const [slug, setSlug] = useState(team?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(team));

  if (state?.ok) {
    return (
      <div className="px-6 py-5">
        <p className="text-sm text-ink/70">
          {team ? "Team updated." : "Team created."}
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
            onClick={onCancel}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col">
      {team ? <input type="hidden" name="id" value={team.id} /> : null}
      <div className="flex flex-col gap-4 px-6 py-5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Name</span>
          <input
            name="name"
            value={name}
            required
            maxLength={80}
            autoComplete="off"
            className="h-10 rounded-xl border border-ink/10 bg-white/70 px-3 text-sm text-ink outline-none focus:border-ink/30"
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
              if (!slugTouched) {
                setSlug(slugifyTeam(next));
              }
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Slug</span>
          <input
            name="slug"
            value={slug}
            required
            maxLength={64}
            autoComplete="off"
            className="h-10 rounded-xl border border-ink/10 bg-white/70 px-3 font-mono text-sm text-ink outline-none focus:border-ink/30"
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
          />
          <span className="text-xs text-ink/40">
            Used in imports and public survey team matching.
          </span>
        </label>
        {state?.error ? (
          <p className="text-sm text-rose-800">{state.error}</p>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-ink/10 px-6 py-4">
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : team ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}

function DeleteTeamForm({
  team,
  onCancel,
}: {
  team: TeamListItem;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<TeamActionState, FormData>(
    deleteTeamAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="px-6 py-5">
        <p className="text-sm text-ink/70">Team deleted.</p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
            onClick={onCancel}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col">
      <input type="hidden" name="id" value={team.id} />
      <div className="px-6 py-5">
        <p className="text-sm leading-6 text-ink/70">
          Delete <span className="font-medium text-ink">{team.name}</span>? This
          cannot be undone. Teams with people or survey responses stay put.
        </p>
        {state?.error ? (
          <p className="mt-3 text-sm text-rose-800">{state.error}</p>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-ink/10 px-6 py-4">
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
    </form>
  );
}

function trapTab(event: KeyboardEvent, root: HTMLElement | null) {
  if (!root) {
    return;
  }
  const list = [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.tabIndex !== -1);
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

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3v10M3 8h10"
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
