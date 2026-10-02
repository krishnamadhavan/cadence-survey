"use client";

import { useActionState, useState } from "react";
import type { SurveyCadence } from "@/lib/survey-cadence";
import {
  setSurveyScheduleAction,
  type SurveyActionState,
} from "../../survey-actions";

export function SurveySchedule({
  token,
  opensAt,
  closesAt,
  cadence,
}: {
  token: string;
  opensAt: string | null;
  closesAt: string | null;
  cadence: SurveyCadence | null;
}) {
  const [state, action, pending] = useActionState<SurveyActionState, FormData>(
    setSurveyScheduleAction,
    null,
  );
  const [openValue, setOpenValue] = useState(toLocalInput(opensAt));
  const [closeValue, setCloseValue] = useState(toLocalInput(closesAt));
  const [repeat, setRepeat] = useState(cadence ?? "");

  return (
    <form action={action} className="mt-4 rounded-2xl border border-ink/10 bg-white/70 p-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="opensAt" value={openValue ? new Date(openValue).toISOString() : ""} />
      <input type="hidden" name="closesAt" value={closeValue ? new Date(closeValue).toISOString() : ""} />
      <input type="hidden" name="cadence" value={repeat} />
      <p className="text-sm font-medium text-ink">Schedule</p>
      <p className="mt-1 text-sm text-ink/55">
        This draft opens and closes on these dates. A repeating pulse sets up the next draft when it closes.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Opens</span>
          <input
            type="datetime-local"
            value={openValue}
            className="h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30"
            onChange={(event) => setOpenValue(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Closes</span>
          <input
            type="datetime-local"
            value={closeValue}
            className="h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30"
            onChange={(event) => setCloseValue(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="text-ink/60">Repeats</span>
          <select
            value={repeat}
            className="h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30"
            onChange={(event) => setRepeat(event.target.value)}
          >
            <option value="">Does not repeat</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </div>
      {state?.error ? (
        <p className="mt-3 text-sm text-rose-800">{state.error}</p>
      ) : state?.ok ? (
        <p className="mt-3 text-sm text-ink/55">Schedule saved.</p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save schedule"}
        </button>
        <button
          type="submit"
          name="clear"
          value="1"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-full border border-ink/15 px-4 text-sm text-ink/70"
        >
          Clear
        </button>
      </div>
    </form>
  );
}

function toLocalInput(value: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
