"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { TemplateDetail, TemplateQuestionItem } from "@/db/templates";
import { formatQuestionSummary } from "@/lib/template-question";
import {
  deleteTemplateAction,
  moveTemplateQuestionAction,
  updateTemplateAction,
  useTemplateAction,
  type TemplateActionState,
} from "../actions";
import {
  DeleteQuestionForm,
  QuestionsEditor,
  TemplateQuestionForm,
} from "../template-question-form";

type Dialog =
  | { kind: "edit" }
  | { kind: "delete" }
  | { kind: "add-question" }
  | { kind: "edit-question"; question: TemplateQuestionItem }
  | { kind: "delete-question"; question: TemplateQuestionItem };

export function TemplateDetailPanel({ template }: { template: TemplateDetail }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [useStateValue, useAction, usePending] = useActionState<
    TemplateActionState,
    FormData
  >(useTemplateAction, null);

  return (
    <>
      <p className="text-sm text-ink/50">
        <Link
          href="/admin/templates"
          className="underline-offset-4 hover:underline"
        >
          Templates
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-ink/70">{template.name}</span>
      </p>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-4xl text-ink">{template.name}</h1>
          <p className="mt-2 text-ink/60">
            {template.description ?? "No description."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
            onClick={() => setDialog({ kind: "edit" })}
          >
            Edit
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
            onClick={() => setDialog({ kind: "delete" })}
          >
            Delete
          </button>
          <form action={useAction}>
            <input type="hidden" name="id" value={template.id} />
            <button
              type="submit"
              disabled={template.questions.length === 0 || usePending}
              title={
                template.questions.length === 0
                  ? "Add a question first"
                  : "Start a draft pulse"
              }
              className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {usePending ? "Starting…" : "Use template"}
            </button>
          </form>
        </div>
      </div>
      {useStateValue?.error ? (
        <p className="mt-3 text-sm text-rose-800">{useStateValue.error}</p>
      ) : null}

      <section className="mt-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl text-ink">Questions</h2>
            <p className="mt-1 text-sm text-ink/50">
              {template.questions.length === 0
                ? "Add a question to use this template."
                : `${template.questions.length} ${
                    template.questions.length === 1 ? "question" : "questions"
                  }`}
            </p>
          </div>
          <button
            ref={addButtonRef}
            type="button"
            className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            onClick={() => setDialog({ kind: "add-question" })}
          >
            Add question
          </button>
        </div>

        {template.questions.length === 0 ? (
          <p className="mt-6 text-ink/70">No questions yet.</p>
        ) : (
          <ol className="mt-6 flex flex-col gap-3">
            {template.questions.map((question, index) => (
              <li
                key={question.id}
                className="rounded-2xl border border-ink/10 bg-white/70 px-5 py-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      <span className="mr-2 text-ink/35">{index + 1}.</span>
                      {question.prompt}
                    </p>
                    <p className="mt-1 text-sm text-ink/50">
                      {formatQuestionSummary(
                        question.type,
                        question.options,
                        question.required,
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <MoveQuestionControls
                      questionId={question.id}
                      templateId={template.id}
                      canUp={index > 0}
                      canDown={index < template.questions.length - 1}
                    />
                    <button
                      type="button"
                      className="rounded-full px-3 py-1.5 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
                      onClick={() =>
                        setDialog({ kind: "edit-question", question })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-full px-3 py-1.5 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
                      onClick={() =>
                        setDialog({ kind: "delete-question", question })
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {dialog ? (
        <DetailDialog
          template={template}
          dialog={dialog}
          onClose={() => setDialog(null)}
          returnFocusRef={addButtonRef}
        />
      ) : null}
    </>
  );
}

function MoveQuestionControls({
  questionId,
  templateId,
  canUp,
  canDown,
}: {
  questionId: string;
  templateId: string;
  canUp: boolean;
  canDown: boolean;
}) {
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    moveTemplateQuestionAction,
    null,
  );

  return (
    <>
      <form action={action}>
        <input type="hidden" name="id" value={questionId} />
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="direction" value="up" />
        <button
          type="submit"
          disabled={!canUp || pending}
          className="rounded-full px-3 py-1.5 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-35"
        >
          Up
        </button>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={questionId} />
        <input type="hidden" name="templateId" value={templateId} />
        <input type="hidden" name="direction" value="down" />
        <button
          type="submit"
          disabled={!canDown || pending}
          className="rounded-full px-3 py-1.5 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-35"
        >
          Down
        </button>
      </form>
      {state?.error ? (
        <p className="basis-full text-xs text-rose-800">{state.error}</p>
      ) : null}
    </>
  );
}

function DetailDialog({
  template,
  dialog,
  onClose,
  returnFocusRef,
}: {
  template: TemplateDetail;
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
    dialog.kind === "edit"
      ? "Edit template"
      : dialog.kind === "delete"
        ? "Delete template"
        : dialog.kind === "add-question"
          ? "Add question"
          : dialog.kind === "edit-question"
            ? "Edit question"
            : "Delete question";

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
        className={`relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-xl ${
          dialog.kind === "edit" ? "max-w-xl" : "max-w-lg"
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
          {dialog.kind === "edit" ? (
            <MetaForm template={template} onCancel={onClose} />
          ) : dialog.kind === "delete" ? (
            <DeleteMetaForm template={template} />
          ) : dialog.kind === "delete-question" ? (
            <DeleteQuestionForm
              templateId={template.id}
              question={dialog.question}
              onCancel={onClose}
            />
          ) : (
            <TemplateQuestionForm
              templateId={template.id}
              question={dialog.kind === "edit-question" ? dialog.question : null}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MetaForm({
  template,
  onCancel,
}: {
  template: TemplateDetail;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    updateTemplateAction,
    null,
  );
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");

  return (
    <div className="flex flex-col">
      <form action={action} className="flex flex-col">
        <input type="hidden" name="id" value={template.id} />
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
            Close
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
      <QuestionsEditor templateId={template.id} questions={template.questions} />
    </div>
  );
}

function DeleteMetaForm({ template }: { template: TemplateDetail }) {
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    deleteTemplateAction,
    null,
  );

  return (
    <form action={action} className="flex flex-col">
      <input type="hidden" name="id" value={template.id} />
      <input type="hidden" name="next" value="list" />
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
