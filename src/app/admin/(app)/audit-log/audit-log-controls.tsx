"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AUDIT_PAGE_SIZE_DEFAULT,
  AUDIT_PAGE_SIZE_MAX,
  AUDIT_PAGE_SIZE_MIN,
  auditLogHref,
  type AuditHrefState,
} from "@/lib/audit-search";

export function AuditLogFilters({ state }: { state: AuditHrefState }) {
  const showClear =
    Boolean(state.q || state.from || state.to) ||
    state.sort !== "when" ||
    state.direction !== "desc";
  const clearHref = auditLogHref({
    ...state,
    q: "",
    from: "",
    to: "",
    tz: "",
    sort: "when",
    direction: "desc",
    page: 1,
  });

  return (
    <form
      method="get"
      action="/admin/audit-log"
      onSubmit={(event) => {
        const tz = event.currentTarget.elements.namedItem("tz");
        if (tz instanceof HTMLInputElement) {
          tz.value = String(new Date().getTimezoneOffset());
        }
      }}
      className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <input type="hidden" name="tz" defaultValue="" />
      {state.sort !== "when" || state.direction !== "desc" ? (
        <>
          <input type="hidden" name="sort" defaultValue={state.sort} />
          <input type="hidden" name="dir" defaultValue={state.direction} />
        </>
      ) : null}
      {state.pageSize !== AUDIT_PAGE_SIZE_DEFAULT ? (
        <input key={state.pageSize} type="hidden" name="size" defaultValue={state.pageSize} />
      ) : null}
      <label className="relative min-w-0 sm:min-w-56 sm:flex-1">
        <span className="sr-only">Search the audit log</span>
        <input
          name="q"
          defaultValue={state.q}
          maxLength={200}
          placeholder="Search who, action, or detail"
          className="h-10 w-full rounded-full border border-ink/10 bg-white/70 px-4 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-ink/30"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink/50">
        From
        <input
          type="date"
          name="from"
          defaultValue={state.from}
          className="h-10 rounded-full border border-ink/10 bg-white/70 px-3 text-sm text-ink outline-none focus:border-ink/30"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink/50">
        To
        <input
          type="date"
          name="to"
          defaultValue={state.to}
          className="h-10 rounded-full border border-ink/10 bg-white/70 px-3 text-sm text-ink outline-none focus:border-ink/30"
        />
      </label>
      <button
        type="submit"
        className="inline-flex h-10 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
      >
        Search
      </button>
      {showClear ? (
        <Link
          href={clearHref}
          className="inline-flex h-10 items-center px-2 text-sm text-ink/50 underline-offset-2 hover:text-ink hover:underline"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}

export function AuditPageSize({ state }: { state: AuditHrefState }) {
  const router = useRouter();
  const [draft, setDraft] = useState(String(state.pageSize));

  function applyPageSize() {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(state.pageSize));
      return;
    }
    const next = Math.min(AUDIT_PAGE_SIZE_MAX, Math.max(AUDIT_PAGE_SIZE_MIN, parsed));
    setDraft(String(next));
    if (next === state.pageSize) {
      return;
    }
    router.push(auditLogHref({ ...state, pageSize: next, page: 1 }));
  }

  return (
    <label className="flex items-center justify-end gap-2 text-sm text-ink/50">
      Per page
      <input
        type="number"
        inputMode="numeric"
        min={AUDIT_PAGE_SIZE_MIN}
        max={AUDIT_PAGE_SIZE_MAX}
        value={draft}
        aria-label="Rows per page"
        className="h-9 w-16 rounded-full border border-ink/10 bg-white/70 px-3 text-center text-sm text-ink outline-none focus:border-ink/30"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={applyPageSize}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            applyPageSize();
          }
        }}
      />
    </label>
  );
}
