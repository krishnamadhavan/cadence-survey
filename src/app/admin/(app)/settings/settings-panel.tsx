"use client";

import { useActionState, useState } from "react";
import { WorkspaceLogoMark } from "@/components/workspace-logo-mark";
import {
  setAnonymityFloorAction,
  workspaceLogoAction,
  type SettingsActionState,
} from "./actions";

export function SettingsPanel({
  floor,
  logoStamp,
  dbError,
}: {
  floor: number;
  logoStamp: number | null;
  dbError: boolean;
}) {
  const [value, setValue] = useState(String(floor));
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    setAnonymityFloorAction,
    null,
  );
  const [logoState, uploadLogo, uploadPending] = useActionState<SettingsActionState, FormData>(
    workspaceLogoAction,
    null,
  );
  const [removeState, removeLogo, removePending] = useActionState<SettingsActionState, FormData>(
    workspaceLogoAction,
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

      {dbError ? null : (
        <section className="mt-4 max-w-md rounded-2xl border border-ink/10 bg-white/70 p-5">
          <h2 className="text-sm font-medium text-ink">Workspace logo</h2>
          <p className="mt-1 text-sm text-ink/60">
            Shown on the survey and the public results page. Use a PNG, JPEG, or WebP
            image up to 512 KB.
          </p>
          {logoStamp !== null ? (
            <div className="mt-4 inline-flex rounded-xl border border-ink/10 bg-white p-3">
              <WorkspaceLogoMark
                stamp={logoStamp}
                className="max-h-16 max-w-64 object-contain object-left"
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink/45">No logo yet.</p>
          )}
          <form action={uploadLogo} encType="multipart/form-data" className="mt-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-ink/60">Image file</span>
              <input
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-full file:border-0 file:bg-ink/5 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
              />
            </label>
            {logoState?.error ? (
              <p className="mt-3 text-sm text-rose-800">{logoState.error}</p>
            ) : logoState?.ok ? (
              <p className="mt-3 text-sm text-ink/55">Saved.</p>
            ) : null}
            <button
              type="submit"
              disabled={uploadPending}
              className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {uploadPending ? "Uploading…" : "Upload"}
            </button>
          </form>
          <form action={removeLogo} className="mt-3">
            <input type="hidden" name="intent" value="remove" />
            <button
              type="submit"
              formNoValidate
              disabled={removePending}
              className="inline-flex h-10 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {removePending ? "Removing…" : "Remove"}
            </button>
            {removeState?.error ? (
              <p className="mt-3 text-sm text-rose-800">{removeState.error}</p>
            ) : removeState?.ok ? (
              <p className="mt-3 text-sm text-ink/55">Saved.</p>
            ) : null}
          </form>
        </section>
      )}
    </>
  );
}
