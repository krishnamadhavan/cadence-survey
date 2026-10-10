"use client";

import { useActionState } from "react";
import {
  importResponsesAction,
  type ResponseImportState,
} from "./import-responses-action";

export function ResponseImportForm({
  token,
  status,
  questionCount,
}: {
  token: string;
  status: string;
  questionCount: number;
}) {
  const [state, action, pending] = useActionState<ResponseImportState, FormData>(
    importResponsesAction,
    null,
  );
  const ready = (status === "draft" || status === "closed") && questionCount > 0;
  const empty = (status === "draft" || status === "closed") && questionCount < 1;

  return (
    <section className="mt-8 max-w-2xl rounded-2xl border border-ink/10 bg-white/70 p-5">
      <h2 className="text-sm font-medium text-ink">Import history</h2>
      {status !== "draft" && status !== "closed" ? (
        <p className="mt-2 text-sm text-ink/60">
          Close this pulse before importing past responses. An open pulse is still
          collecting answers.
        </p>
      ) : null}
      {empty ? (
        <p className="mt-2 text-sm text-ink/60">
          Add a question before importing responses.
        </p>
      ) : null}
      {ready ? (
        <>
          <p className="mt-2 text-sm text-ink/60">
            Each row is one past response for a team. Include a Team column and one
            column per question, using the question text. Role, Tenure, and Submitted
            are optional. Tenure is &lt;1yr, 1-3yr, or 3yr+. Submitted is a date like
            2024-05-02. The file is saved only when every row is valid. Importing
            again adds another copy of each row.
          </p>
          <a
            href={`/api/admin/surveys/${token}/responses/template`}
            className="mt-3 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            Download a template
          </a>
          <form action={action} encType="multipart/form-data" className="mt-4">
            <input type="hidden" name="token" value={token} />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-ink/60">CSV file</span>
              <input
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
                className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-full file:border-0 file:bg-ink/5 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
              />
            </label>
            {state && state.errors.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1 text-sm text-rose-800">
                {state.errors.slice(0, 12).map((error) => (
                  <li key={`${error.line}-${error.message}`}>
                    Line {error.line}: {error.message}
                  </li>
                ))}
              </ul>
            ) : state?.ok ? (
              <p className="mt-3 text-sm text-ink/55">
                Imported {state.imported} {state.imported === 1 ? "response" : "responses"}.
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Importing…" : "Import responses"}
            </button>
          </form>
        </>
      ) : null}
    </section>
  );
}
