"use client";

import { useActionState } from "react";
import {
  shareSurveyResultsAction,
  stopSurveyResultsShareAction,
  type SurveyActionState,
} from "../../survey-actions";
import { CopyLinkButton } from "./copy-link-button";

export function ResultShare({
  token,
  sharePath,
  note,
}: {
  token: string;
  sharePath: string | null;
  note?: string;
}) {
  const [state, action, pending] = useActionState<SurveyActionState, FormData>(
    shareSurveyResultsAction,
    null,
  );
  const [stopState, stopAction, stopPending] = useActionState<SurveyActionState, FormData>(
    stopSurveyResultsShareAction,
    null,
  );

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
        Share results
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-ink/60">
        Anyone with this link can open the published results without an admin
        login. Turn it off when that link should stop working. Teams under the
        anonymity floor stay hidden, and written comments stay off that page.
      </p>
      {note ? <p className="mt-2 max-w-2xl text-sm text-ink/60">{note}</p> : null}
      {sharePath ? (
        <div className="mt-4 flex flex-col items-start gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <code className="max-w-full truncate rounded-full border border-ink/10 bg-white/70 px-3 py-1.5 font-mono text-sm text-ink">
              {sharePath}
            </code>
            <CopyLinkButton path={sharePath} />
          </div>
          <form action={stopAction} className="flex flex-col items-start gap-2">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              disabled={stopPending}
              className="inline-flex h-10 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink transition-colors hover:bg-ink/5 disabled:opacity-50"
            >
              {stopPending ? "Turning off…" : "Turn off"}
            </button>
            {stopState?.error ? (
              <p className="text-xs text-rose-800">{stopState.error}</p>
            ) : null}
          </form>
        </div>
      ) : (
        <form action={action} className="mt-4 flex flex-col items-start gap-2">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create public link"}
          </button>
          {state?.error ? <p className="text-xs text-rose-800">{state.error}</p> : null}
        </form>
      )}
    </section>
  );
}
