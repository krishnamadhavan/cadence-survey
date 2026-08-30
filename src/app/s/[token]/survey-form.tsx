"use client";

import { useActionState, useState } from "react";
import { submitSurvey, type SubmitState } from "./actions";
import type { SurveyQuestion } from "@/db/queries";
import type { ChoiceOptions, ScaleOptions } from "@/db/schema";

type TeamOption = {
  id: string;
  name: string;
};

type SurveyFormProps = {
  token: string;
  questions: SurveyQuestion[];
  teams: TeamOption[];
};

export function SurveyForm({ token, questions, teams }: SurveyFormProps) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(
    submitSurvey,
    null,
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [teamId, setTeamId] = useState("");

  return (
    <form action={action} className="flex flex-col gap-10">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="teamId" value={teamId} />

      <fieldset className="flex flex-col gap-3">
        <legend className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-ink/45 uppercase">
            Your team
          </span>
          <span className="text-lg font-medium text-ink">Which team are you on?</span>
        </legend>
        <div className="flex flex-col gap-2">
          {teams.map((team) => {
            const selected = teamId === team.id;
            return (
              <button
                key={team.id}
                type="button"
                onClick={() => setTeamId(team.id)}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  selected
                    ? "border-accent bg-accent/10 text-ink"
                    : "border-ink/10 bg-paper text-ink hover:border-ink/30"
                }`}
                aria-pressed={selected}
              >
                {team.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      {questions.map((question, index) => (
        <fieldset key={question.id} className="flex flex-col gap-3">
          <legend className="flex flex-col gap-1">
            <span className="text-xs font-medium tracking-wide text-ink/45 uppercase">
              {index + 1} of {questions.length}
              {question.required ? "" : " · optional"}
            </span>
            <span className="text-lg font-medium text-ink">
              {question.prompt}
            </span>
          </legend>

          {question.type === "scale" ? (
            <ScaleField
              question={question}
              value={values[question.id] ?? ""}
              onChange={(next) =>
                setValues((prev) => ({ ...prev, [question.id]: next }))
              }
            />
          ) : null}

          {question.type === "choice" ? (
            <ChoiceField
              question={question}
              value={values[question.id] ?? ""}
              onChange={(next) =>
                setValues((prev) => ({ ...prev, [question.id]: next }))
              }
            />
          ) : null}

          {question.type === "text" ? (
            <textarea
              name={`q_${question.id}`}
              rows={4}
              value={values[question.id] ?? ""}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  [question.id]: event.target.value,
                }))
              }
              placeholder="A sentence is enough."
              className="w-full resize-y rounded-xl border border-ink/10 bg-paper px-4 py-3 text-base text-ink outline-none placeholder:text-ink/35 focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
            />
          ) : null}
        </fieldset>
      ))}

      {state?.error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-sm font-medium text-paper transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send response"}
      </button>
    </form>
  );
}

function ScaleField({
  question,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = question.options as ScaleOptions | null;
  const min = options?.min ?? 1;
  const max = options?.max ?? 5;
  const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={`q_${question.id}`} value={value} />
      <div className="flex flex-wrap gap-2">
        {numbers.map((n) => {
          const selected = value === String(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(String(n))}
              className={`flex h-12 w-12 items-center justify-center rounded-full border text-base font-medium transition-colors ${
                selected
                  ? "border-accent bg-accent text-paper"
                  : "border-ink/15 bg-paper text-ink hover:border-ink/40"
              }`}
              aria-pressed={selected}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-ink/45">
        <span>{options?.minLabel ?? ""}</span>
        <span>{options?.maxLabel ?? ""}</span>
      </div>
    </div>
  );
}

function ChoiceField({
  question,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = question.options as ChoiceOptions | null;
  const choices = options?.choices ?? [];

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={`q_${question.id}`} value={value} />
      {choices.map((choice) => {
        const selected = value === choice;
        return (
          <button
            key={choice}
            type="button"
            onClick={() => onChange(choice)}
            className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
              selected
                ? "border-accent bg-accent/10 text-ink"
                : "border-ink/10 bg-paper text-ink hover:border-ink/30"
            }`}
            aria-pressed={selected}
          >
            {choice}
          </button>
        );
      })}
    </div>
  );
}
