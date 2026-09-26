"use client";

import { useActionState, useState } from "react";
import type { QuestionType } from "@/db/schema";
import type { SurveyQuestionItem } from "@/db/surveys";
import {
  choicesToField,
  formatQuestionSummary,
  isChoiceOptions,
  isScaleOptions,
} from "@/lib/template-question";
import {
  addSurveyQuestionAction,
  deleteSurveyQuestionAction,
  moveSurveyQuestionAction,
  renameSurveyAction,
  updateSurveyQuestionAction,
  type SurveyActionState,
} from "../../survey-actions";

export function SurveyDraftEditor({
  token,
  title,
  questions,
}: {
  token: string;
  title: string;
  questions: SurveyQuestionItem[];
}) {
  return (
    <section className="mt-8 rounded-2xl border border-ink/10 bg-white/70">
      <div className="px-5 py-5">
        <p className="text-sm font-medium text-ink">Draft</p>
        <p className="mt-1 text-sm text-ink/55">
          Rename this pulse and edit its questions before you open it.
        </p>
        <TitleForm key={title} token={token} title={title} />
      </div>
      <QuestionList token={token} questions={questions} />
    </section>
  );
}

function TitleForm({ token, title }: { token: string; title: string }) {
  const [state, action, pending] = useActionState<SurveyActionState, FormData>(
    renameSurveyAction,
    null,
  );
  const [value, setValue] = useState(title);

  return (
    <form action={action} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="token" value={token} />
      <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
        <span className="text-ink/60">Title</span>
        <input
          name="title"
          value={value}
          required
          maxLength={80}
          className="h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30"
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save title"}
      </button>
      {state?.error ? (
        <p className="text-sm text-rose-800 sm:basis-full">{state.error}</p>
      ) : state?.ok ? (
        <p className="text-sm text-ink/55 sm:basis-full">Title saved.</p>
      ) : null}
    </form>
  );
}

function QuestionList({
  token,
  questions,
}: {
  token: string;
  questions: SurveyQuestionItem[];
}) {
  const [view, setView] = useState<
    | { kind: "list" }
    | { kind: "add" }
    | { kind: "edit"; question: SurveyQuestionItem }
    | { kind: "delete"; question: SurveyQuestionItem }
  >({ kind: "list" });

  if (view.kind === "add" || view.kind === "edit") {
    const question = view.kind === "edit" ? view.question : null;
    return (
      <QuestionForm
        key={question?.id ?? "add"}
        token={token}
        question={question}
        title={view.kind === "edit" ? "Edit question" : "Add question"}
        onCancel={() => setView({ kind: "list" })}
      />
    );
  }

  if (view.kind === "delete") {
    return (
      <DeleteForm
        token={token}
        question={view.question}
        onCancel={() => setView({ kind: "list" })}
      />
    );
  }

  return (
    <div className="border-t border-ink/10 px-5 py-5">
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
        <p className="mt-3 text-sm text-ink/60">
          No questions yet. Add one before opening this pulse.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {questions.map((question, index) => (
            <li
              key={question.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-ink/10 bg-white px-3 py-2.5"
            >
              <div className="min-w-0 text-sm text-ink">
                <p>
                  <span className="text-ink/35">{index + 1}.</span> {question.prompt}
                </p>
                <p className="mt-0.5 text-xs text-ink/45">
                  {formatQuestionSummary(
                    question.type,
                    question.options,
                    question.required,
                  )}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                <MoveButtons
                  token={token}
                  questionId={question.id}
                  canUp={index > 0}
                  canDown={index < questions.length - 1}
                />
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

function MoveButtons({
  token,
  questionId,
  canUp,
  canDown,
}: {
  token: string;
  questionId: string;
  canUp: boolean;
  canDown: boolean;
}) {
  const [state, action, pending] = useActionState<SurveyActionState, FormData>(
    moveSurveyQuestionAction,
    null,
  );
  return (
    <>
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="id" value={questionId} />
        <input type="hidden" name="direction" value="up" />
        <button
          type="submit"
          disabled={!canUp || pending}
          className="rounded-full px-2.5 py-1 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-35"
        >
          Up
        </button>
      </form>
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="id" value={questionId} />
        <input type="hidden" name="direction" value="down" />
        <button
          type="submit"
          disabled={!canDown || pending}
          className="rounded-full px-2.5 py-1 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-35"
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

function QuestionForm({
  token,
  question,
  title,
  onCancel,
}: {
  token: string;
  question: SurveyQuestionItem | null;
  title: string;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<SurveyActionState, FormData>(
    question ? updateSurveyQuestionAction : addSurveyQuestionAction,
    null,
  );
  const [type, setType] = useState<QuestionType>(question?.type ?? "scale");
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [required, setRequired] = useState(question?.required ?? true);
  const [min, setMin] = useState(
    question && isScaleOptions(question.options) ? String(question.options.min) : "1",
  );
  const [max, setMax] = useState(
    question && isScaleOptions(question.options) ? String(question.options.max) : "5",
  );
  const [minLabel, setMinLabel] = useState(
    question && isScaleOptions(question.options) ? (question.options.minLabel ?? "") : "",
  );
  const [maxLabel, setMaxLabel] = useState(
    question && isScaleOptions(question.options) ? (question.options.maxLabel ?? "") : "",
  );
  const [choices, setChoices] = useState(
    question && isChoiceOptions(question.options) ? choicesToField(question.options) : "",
  );

  if (state?.ok) {
    return (
      <div className="border-t border-ink/10 px-5 py-5">
        <p className="text-sm text-ink/70">
          {question ? "Question updated." : "Question added."}
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
            onClick={onCancel}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="border-t border-ink/10">
      <p className="px-5 pt-5 text-sm font-medium text-ink">{title}</p>
      <input type="hidden" name="token" value={token} />
      {question ? <input type="hidden" name="id" value={question.id} /> : null}
      <div className="flex flex-col gap-4 px-5 py-5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Prompt</span>
          <textarea
            name="prompt"
            value={prompt}
            required
            maxLength={280}
            rows={3}
            className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Type</span>
          <select
            name="type"
            value={type}
            className="h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30"
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
              <Field label="Min" name="min" value={min} onChange={setMin} />
              <Field label="Max" name="max" value={max} onChange={setMax} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Min label" name="minLabel" value={minLabel} onChange={setMinLabel} />
              <TextField label="Max label" name="maxLabel" value={maxLabel} onChange={setMaxLabel} />
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
              className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
              onChange={(event) => setChoices(event.target.value)}
            />
            <span className="text-xs text-ink/40">
              One per line, or comma-separated. Need 2–20 unique options.
            </span>
          </label>
        ) : null}
        {state?.error ? <p className="text-sm text-rose-800">{state.error}</p> : null}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-ink/10 px-5 py-4">
        <button
          type="button"
          className="inline-flex h-10 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : question ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-ink/60">{label}</span>
      <input
        name={name}
        type="number"
        min={0}
        max={10}
        value={value}
        className="h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-ink/60">{label}</span>
      <input
        name={name}
        value={value}
        maxLength={40}
        className="h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DeleteForm({
  token,
  question,
  onCancel,
}: {
  token: string;
  question: SurveyQuestionItem;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<SurveyActionState, FormData>(
    deleteSurveyQuestionAction,
    null,
  );
  if (state?.ok) {
    return (
      <div className="border-t border-ink/10 px-5 py-5">
        <p className="text-sm text-ink/70">Question deleted.</p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
            onClick={onCancel}
          >
            Done
          </button>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="border-t border-ink/10">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="id" value={question.id} />
      <div className="px-5 py-5">
        <p className="text-sm leading-6 text-ink/70">
          Delete <span className="font-medium text-ink">{question.prompt}</span>?
        </p>
        {state?.error ? <p className="mt-3 text-sm text-rose-800">{state.error}</p> : null}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-ink/10 px-5 py-4">
        <button
          type="button"
          className="inline-flex h-10 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
    </form>
  );
}
