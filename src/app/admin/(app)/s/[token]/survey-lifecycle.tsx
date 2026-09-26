"use client";

import { useActionState } from "react";
import type { SurveyStatus } from "@/db/schema";
import { allowedSurveyTransitions } from "@/lib/survey-status";
import {
  setSurveyStatusAction,
  type SurveyActionState,
} from "../../survey-actions";

export function SurveyLifecycle({
  token,
  status,
  questionCount,
}: {
  token: string;
  status: SurveyStatus;
  questionCount: number;
}) {
  const [state, action, pending] = useActionState<SurveyActionState, FormData>(
    setSurveyStatusAction,
    null,
  );
  const next = allowedSurveyTransitions(status, questionCount)[0];
  if (!next) {
    return (
      <p className="text-right text-xs text-ink/45">
        Add a question before opening this pulse.
      </p>
    );
  }

  const label =
    next === "open" ? (status === "closed" ? "Reopen pulse" : "Open pulse") : "Close pulse";

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : label}
      </button>
      {state?.error ? (
        <p className="text-xs text-rose-800">{state.error}</p>
      ) : null}
    </form>
  );
}
