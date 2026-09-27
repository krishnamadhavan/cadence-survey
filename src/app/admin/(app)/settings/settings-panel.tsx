"use client";

import { useActionState, useState } from "react";
import {
  setAnonymityFloorAction,
  type SettingsActionState,
} from "./actions";

export function SettingsPanel({
  floor,
  dbError,
}: {
  floor: number;
  dbError: boolean;
}) {
  const [value, setValue] = useState(String(floor));
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    setAnonymityFloorAction,
    null,
  );

  return (
    <>
      <div className="min-w-0">
        <h1 className="font-serif text-4xl text-ink">Settings</h1>
        <p className="mt-2 max-w-2xl text-ink/60">
          The anonymity floor is the minimum number of responses a team needs
          before its results and written feedback are shown. A smaller leftover
          is folded in so one or two people cannot be identified.
        </p>
      </div>

      {dbError ? (
        <p className="mt-8 text-ink/70">Could not reach Postgres.</p>
      ) : (
        <form
          action={action}
          className="mt-8 max-w-md rounded-2xl border border-ink/10 bg-white/70 p-5"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink/60">Anonymity floor</span>
            <input
              name="anonymityFloor"
              type="number"
              inputMode="numeric"
              min={3}
              max={50}
              required
              value={value}
              className="h-10 w-28 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30"
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <p className="mt-2 text-xs text-ink/40">Current value is {floor}. Use 3–50.</p>
          {state?.error ? (
            <p className="mt-3 text-sm text-rose-800">{state.error}</p>
          ) : state?.ok ? (
            <p className="mt-3 text-sm text-ink/55">Saved.</p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </>
  );
}
