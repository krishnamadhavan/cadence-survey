"use client";

import { useActionState, useRef, useState } from "react";
import { importEmployees, type ImportState } from "./actions";

type UploadFormProps = {
  onCancel: () => void;
};

export function UploadForm({ onCancel }: UploadFormProps) {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    importEmployees,
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function assignFile(file: File | undefined) {
    if (!file || !inputRef.current) {
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputRef.current.files = transfer.files;
    setFileName(file.name);
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
        <label
          className={`flex min-h-64 flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition-colors ${
            dragging
              ? "border-accent bg-accent/5"
              : "border-ink/15 bg-white/50 hover:border-ink/30 hover:bg-white/70"
          }`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            assignFile(event.dataTransfer.files[0]);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="sr-only"
            onChange={(event) => assignFile(event.target.files?.[0])}
          />
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-ink/5 text-ink/50">
            <UploadIcon />
          </span>
          {fileName ? (
            <>
              <span className="mt-4 text-sm font-medium text-ink">{fileName}</span>
              <span className="mt-1 text-sm text-ink/50">
                Drop a different CSV or click to replace
              </span>
            </>
          ) : (
            <>
              <span className="mt-4 text-sm font-medium text-ink">
                Drop a CSV here, or click to browse
              </span>
              <span className="mt-1 text-sm text-ink/50">
                name, email, team · up to 1 MB
              </span>
            </>
          )}
        </label>

        {state ? (
          <div className="max-h-40 overflow-y-auto rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm">
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
          disabled={pending || !fileName}
          className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Importing…" : "Submit"}
        </button>
      </div>
    </form>
  );
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 11.5V4M5 6.5 8 3.5 11 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 12.5h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
