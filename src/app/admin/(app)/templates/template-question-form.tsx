"use client";

import { useActionState, useState } from "react";
import type { QuestionType } from "@/db/schema";
import type { TemplateQuestionItem } from "@/db/templates";
import {
  choicesToField,
  formatQuestionSummary,
  isChoiceOptions,
  isScaleOptions,
} from "@/lib/template-question";
import {
  addTemplateQuestionAction,
  deleteTemplateQuestionAction,
  updateTemplateQuestionAction,
  type TemplateActionState,
} from "./actions";

type QuestionView =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "edit"; question: TemplateQuestionItem }
  | { kind: "delete"; question: TemplateQuestionItem };

export function QuestionsEditor({
  templateId,
  questions,
}: {
  templateId: string;
  questions: TemplateQuestionItem[];
}) {
  const [view, setView] = useState<QuestionView>({ kind: "list" });

  if (view.kind === "add") {
    return (
      <div className="border-t border-ink/10">
        <p className="px-6 pt-5 text-sm font-medium text-ink">Add question</p>
        <TemplateQuestionForm
          key="add"
          templateId={templateId}
          question={null}
          onCancel={() => setView({ kind: "list" })}
        />
      </div>
    );
  }

  if (view.kind === "edit") {
    return (
      <div className="border-t border-ink/10">
        <p className="px-6 pt-5 text-sm font-medium text-ink">Edit question</p>
        <TemplateQuestionForm
          key={view.question.id}
          templateId={templateId}
          question={view.question}
          onCancel={() => setView({ kind: "list" })}
        />
      </div>
    );
  }

  if (view.kind === "delete") {
    return (
      <div className="border-t border-ink/10">
        <DeleteQuestionForm
          templateId={templateId}
          question={view.question}
          onCancel={() => setView({ kind: "list" })}
        />
      </div>
    );
  }

  return (
    <div className="border-t border-ink/10 px-6 py-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">Questions</p>
        <button
          type="button"
          className="inline-flex h-9 items-center rounded-full border border-ink/15 px-3 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
          onClick={() => setView({ kind: "add" })}
        >
          Add question
        </button>
      </div>
      {questions.length === 0 ? (
        <p className="mt-3 text-sm text-ink/60">No questions yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {questions.map((question, index) => (
            <li
              key={question.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-ink/10 bg-white/70 px-3 py-2.5"
            >
              <div className="min-w-0 text-sm text-ink">
                <p>
                  <span className="text-ink/35">{index + 1}.</span>{" "}
                  {question.prompt}
                </p>
                <p className="mt-0.5 text-xs text-ink/45">
                  {formatQuestionSummary(
                    question.type,
                    question.options,
                    question.required,
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="rounded-full px-2.5 py-1 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
                  onClick={() => setView({ kind: "edit", question })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rounded-full px-2.5 py-1 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
                  onClick={() => setView({ kind: "delete", question })}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function TemplateQuestionForm({
  templateId,
  question,
  onCancel,
}: {
  templateId: string;
  question: TemplateQuestionItem | null;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    question ? updateTemplateQuestionAction : addTemplateQuestionAction,
    null,
  );
  const [type, setType] = useState<QuestionType>(question?.type ?? "scale");
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [required, setRequired] = useState(question?.required ?? true);
  const [min, setMin] = useState(
    question && isScaleOptions(question.options)
      ? String(question.options.min)
      : "1",
  );
  const [max, setMax] = useState(
    question && isScaleOptions(question.options)
      ? String(question.options.max)
      : "5",
  );
  const [minLabel, setMinLabel] = useState(
    question && isScaleOptions(question.options)
      ? (question.options.minLabel ?? "")
      : "",
  );
  const [maxLabel, setMaxLabel] = useState(
    question && isScaleOptions(question.options)
      ? (question.options.maxLabel ?? "")
      : "",
  );
  const [choices, setChoices] = useState(
    question && isChoiceOptions(question.options)
      ? choicesToField(question.options)
      : "",
  );

  if (state?.ok) {
    return (
      <div className="px-6 py-5">
        <p className="text-sm text-ink/70">
          {question ? "Question updated." : "Question added."}
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
      <input type="hidden" name="templateId" value={templateId} />
      {question ? <input type="hidden" name="id" value={question.id} /> : null}
      <div className="flex flex-col gap-4 px-6 py-5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Prompt</span>
          <textarea
            name="prompt"
            value={prompt}
            required
            maxLength={280}
            rows={3}
            className="rounded-xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Type</span>
          <select
            name="type"
            value={type}
            className="h-10 rounded-xl border border-ink/10 bg-white/70 px-3 text-sm text-ink outline-none focus:border-ink/30"
            onChange={(event) => setType(event.target.value as QuestionType)}
          >
            <option value="scale">Scale</option>
            <option value="choice">Choice</option>
            <option value="text">Text</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input
            type="checkbox"
            name="required"
            checked={required}
            className="h-4 w-4 rounded border-ink/20"
            onChange={(event) => setRequired(event.target.checked)}
          />
          Required
        </label>
        {type === "scale" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-ink/60">Min</span>
                <input
                  name="min"
                  type="number"
                  min={0}
                  max={10}
                  value={min}
                  className="h-10 rounded-xl border border-ink/10 bg-white/70 px-3 text-sm text-ink outline-none focus:border-ink/30"
                  onChange={(event) => setMin(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-ink/60">Max</span>
                <input
                  name="max"
                  type="number"
                  min={0}
                  max={10}
                  value={max}
                  className="h-10 rounded-xl border border-ink/10 bg-white/70 px-3 text-sm text-ink outline-none focus:border-ink/30"
                  onChange={(event) => setMax(event.target.value)}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-ink/60">Min label</span>
                <input
                  name="minLabel"
                  value={minLabel}
                  maxLength={40}
                  className="h-10 rounded-xl border border-ink/10 bg-white/70 px-3 text-sm text-ink outline-none focus:border-ink/30"
                  onChange={(event) => setMinLabel(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-ink/60">Max label</span>
                <input
                  name="maxLabel"
                  value={maxLabel}
                  maxLength={40}
                  className="h-10 rounded-xl border border-ink/10 bg-white/70 px-3 text-sm text-ink outline-none focus:border-ink/30"
                  onChange={(event) => setMaxLabel(event.target.value)}
                />
              </label>
            </div>
          </>
        ) : null}
        {type === "choice" ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink/60">Choices</span>
            <textarea
              name="choices"
              value={choices}
              required
              rows={4}
              className="rounded-xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
              onChange={(event) => setChoices(event.target.value)}
            />
            <span className="text-xs text-ink/40">
              One per line, or comma-separated. Need 2–20 unique options.
            </span>
          </label>
        ) : null}
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
          {pending ? "Saving…" : question ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

export function DeleteQuestionForm({
  templateId,
  question,
  onCancel,
}: {
  templateId: string;
  question: TemplateQuestionItem;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<TemplateActionState, FormData>(
    deleteTemplateQuestionAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="px-6 py-5">
        <p className="text-sm text-ink/70">Question deleted.</p>
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
      <input type="hidden" name="id" value={question.id} />
      <input type="hidden" name="templateId" value={templateId} />
      <div className="px-6 py-5">
        <p className="text-sm leading-6 text-ink/70">
          Delete{" "}
          <span className="font-medium text-ink">{question.prompt}</span>?
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
