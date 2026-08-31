"use client";

import { useActionState } from "react";
import { importEmployees, type ImportState } from "./actions";

export function UploadForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    importEmployees,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-ink/60">CSV file</span>
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="text-sm text-ink file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-paper"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-fit items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition-colors hover:bg-ink/90 disabled:opacity-60"
      >
        {pending ? "Importing…" : "Upload and create"}
      </button>

      {state ? (
        <div className="rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm">
          <p className="text-ink">
            Created {state.created}
            {state.updated > 0 ? `, updated ${state.updated}` : ""}.
          </p>
          {state.errors.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1 text-rose-800">
              {state.errors.slice(0, 20).map((error) => (
                <li key={`${error.line}-${error.message}`}>
                  Line {error.line}: {error.message}
                </li>
              ))}
              {state.errors.length > 20 ? (
                <li>…and {state.errors.length - 20} more</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
