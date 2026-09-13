"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import type { TemplateListItem } from "@/db/templates";
import { formatQuestionSummary } from "@/lib/template-question";
import {
  createTemplateAction,
  deleteTemplateAction,
  updateTemplateAction,
  useTemplateAction,
  type TemplateActionState,
} from "./actions";
import { QuestionsEditor } from "./template-question-form";

type QuestionsFilter = "all" | "ready" | "empty";

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; template: TemplateListItem }
  | { kind: "delete"; template: TemplateListItem };

type TemplatesPanelProps = {
  templates: TemplateListItem[];
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

export function TemplatesPanel({ templates, dbError }: TemplatesPanelProps) {
  const [query, setQuery] = useState("");
  const [questions, setQuestions] = useState<QuestionsFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [pageSizeDraft, setPageSizeDraft] = useState(String(DEFAULT_PAGE_SIZE));
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates.filter((template) => {
      if (questions === "ready" && template.questionCount === 0) {
        return false;
      }
      if (questions === "empty" && template.questionCount > 0) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        template.name.toLowerCase().includes(needle) ||
        (template.description ?? "").toLowerCase().includes(needle) ||
        template.questions.some((question) =>
          question.prompt.toLowerCase().includes(needle),
        )
      );
    });
  }, [templates, query, questions]);

  const filtersActive = query.trim() !== "" || questions !== "all";
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(rangeStart, rangeStart + pageSize);
  const rangeEnd = rangeStart + pageRows.length;
  const questionTotal = templates.reduce(
    (sum, template) => sum + template.questionCount,
    0,
  );

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
          <h1 className="font-serif text-4xl text-ink">Templates</h1>
          <p className="mt-2 text-ink/60">
            Reusable survey blueprints for new pulses. Edit the questions here,
            then use a template to start a draft.
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
          New template
        </button>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Search templates</span>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink/35">
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetToFirstPage();
              }}
              placeholder="Search name, description, or question"
              className="h-10 w-full rounded-full border border-ink/10 bg-white/70 pr-3 pl-9 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-ink/30"
            />
          </label>
          <label className="relative shrink-0">
            <span className="sr-only">Filter by questions</span>
            <select
              value={questions}
              onChange={(event) => {
                setQuestions(event.target.value as QuestionsFilter);
                resetToFirstPage();
              }}
              className="h-10 appearance-none rounded-full border border-ink/10 bg-white/70 py-0 pr-9 pl-4 text-sm text-ink outline-none focus:border-ink/30"
            >
              <option value="all">All templates</option>
              <option value="ready">With questions</option>
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
                setQuestions("all");
                resetToFirstPage();
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        {!dbError && templates.length > 0 ? (
          <p className="shrink-0 text-sm text-ink/40">
            {filtered.length === 0
              ? "0 templates"
              : `${rangeStart + 1}–${rangeEnd} of ${filtered.length}`}
            {` · ${questionTotal} ${questionTotal === 1 ? "question" : "questions"}`}
          </p>
        ) : null}
      </div>

      <section className="mt-4">
        {dbError ? (
          <p className="mt-4 text-ink/70">Could not reach Postgres.</p>
        ) : templates.length === 0 ? (
          <p className="mt-4 text-ink/70">No templates yet. Create one.</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-ink/70">No templates match these filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-ink/10 text-ink/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Questions</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((template) => (
                    <tr key={template.id} className="border-t border-ink/5">
                      <td className="px-4 py-3 font-medium text-ink">
                        <Link
                          href={`/admin/templates/${template.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {template.name}
                        </Link>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-ink/70">
                        <p className="line-clamp-2">
                          {template.description ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-ink/70">
                        {template.questions.length === 0 ? (
                          "—"
                        ) : (
                          <ol className="flex flex-col gap-1.5">
                            {template.questions.map((question, index) => (
                              <li key={question.id}>
                                <p className="text-ink">
                                  <span className="text-ink/35">{index + 1}.</span>{" "}
                                  {question.prompt}
                                </p>
                                <p className="text-xs text-ink/45">
                                  {formatQuestionSummary(
                                    question.type,
                                    question.options,
                                    question.required,
                                  )}
                                </p>
                              </li>
                            ))}
                          </ol>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink/70">
                        {formatDate(template.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <UseTemplateButton
                            id={template.id}
                            disabled={template.questionCount === 0}
                          />
                          <button
                            type="button"
                            className="rounded-full px-3 py-1.5 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
                            onClick={() => setDialog({ kind: "edit", template })}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded-full px-3 py-1.5 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
                            onClick={() =>
                              setDialog({ kind: "delete", template })
                            }
                          >
                            Delete
                          </button>
                        </div>
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

      {dialog ? (
        <TemplateDialog
          dialog={resolveDialog(dialog, templates)}
          onClose={() => setDialog(null)}
          returnFocusRef={newButtonRef}
        />
      ) : null}
    </>
  );
}

function UseTemplateButton({
  id,
  disabled,
}: {
  id: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    useTemplateAction,
    null,
  );

  return (
    <form action={action} className="flex flex-col items-end">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={disabled || pending}
        title={disabled ? "Add a question first" : "Start a draft pulse"}
        className="rounded-full px-3 py-1.5 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-35"
      >
        {pending ? "Starting…" : "Use"}
      </button>
      {state?.error ? (
        <p className="max-w-40 pt-1 text-right text-xs text-rose-800">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function TemplateDialog({
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
      ? "New template"
      : dialog.kind === "edit"
        ? "Edit template"
        : "Delete template";

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
        className={`relative z-10 flex w-full flex-col overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-xl ${
          dialog.kind === "edit" ? "max-h-[90vh] max-w-xl" : "max-w-lg"
        }`}
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
        <div className="min-h-0 overflow-y-auto">
          {dialog.kind === "delete" ? (
            <DeleteTemplateForm template={dialog.template} onCancel={onClose} />
          ) : (
            <TemplateForm
              template={dialog.kind === "edit" ? dialog.template : null}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function resolveDialog(dialog: Dialog, templates: TemplateListItem[]): Dialog {
  if (dialog.kind !== "edit") {
    return dialog;
  }
  const latest = templates.find((template) => template.id === dialog.template.id);
  return latest ? { kind: "edit", template: latest } : dialog;
}

function TemplateForm({
  template,
  onCancel,
}: {
  template: TemplateListItem | null;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    template ? updateTemplateAction : createTemplateAction,
    null,
  );
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");

  return (
    <div className="flex flex-col">
      <form action={action} className="flex flex-col">
        {template ? <input type="hidden" name="id" value={template.id} /> : null}
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
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink/60">Description</span>
            <textarea
              name="description"
              value={description}
              maxLength={280}
              rows={3}
              className="rounded-xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {state?.error ? (
            <p className="text-sm text-rose-800">{state.error}</p>
          ) : state?.ok ? (
            <p className="text-sm text-ink/70">Template updated.</p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-ink/10 px-6 py-4">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
            onClick={onCancel}
          >
            {template ? "Close" : "Cancel"}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : template ? "Save" : "Create"}
          </button>
        </div>
      </form>
      {template ? (
        <QuestionsEditor
          templateId={template.id}
          questions={template.questions}
        />
      ) : null}
    </div>
  );
}

function DeleteTemplateForm({
  template,
  onCancel,
}: {
  template: TemplateListItem;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    deleteTemplateAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="px-6 py-5">
        <p className="text-sm text-ink/70">Template deleted.</p>
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
      <input type="hidden" name="id" value={template.id} />
      <div className="px-6 py-5">
        <p className="text-sm leading-6 text-ink/70">
          Delete <span className="font-medium text-ink">{template.name}</span>?
          Existing pulses stay put. This cannot be undone.
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
