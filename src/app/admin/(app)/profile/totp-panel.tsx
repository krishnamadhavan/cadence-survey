"use client";

import { useActionState } from "react";
import {
  beginAdminTotpAction,
  confirmAdminTotpAction,
  disableAdminTotpAction,
  restartAdminTotpAction,
  type TotpActionState,
} from "./actions";

type TotpProfile =
  | { status: "off" }
  | { status: "on" }
  | { status: "pending"; manualKey: string; qrSvg: string };

const codeClass =
  "h-12 w-full max-w-xs rounded-xl border border-ink/10 bg-white px-4 text-base tracking-[0.3em] text-ink outline-none focus:border-ink/30";

export function TotpPanel({ profile }: { profile: TotpProfile }) {
  return (
    <section className="mt-8 max-w-lg rounded-2xl border border-ink/10 bg-white/70 p-5">
      <h2 className="text-lg font-medium text-ink">Authenticator app</h2>
      {profile.status === "pending" ? (
        <PendingSetup manualKey={profile.manualKey} qrSvg={profile.qrSvg} />
      ) : profile.status === "on" ? (
        <EnabledSetup />
      ) : (
        <OffSetup />
      )}
    </section>
  );
}

function OffSetup() {
  const [state, action, pending] = useActionState<TotpActionState, FormData>(
    beginAdminTotpAction,
    null,
  );

  return (
    <form action={action} className="mt-3">
      <p className="text-sm text-ink/60">
        Add an authenticator app for this account. After it is on, sign-in asks
        for a 6-digit code.
      </p>
      <ActionError message={state?.error} />
      <button
        type="submit"
        name="intent"
        value="begin"
        disabled={pending}
        className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Starting…" : "Turn on authenticator app"}
      </button>
    </form>
  );
}

function PendingSetup({
  manualKey,
  qrSvg,
}: {
  manualKey: string;
  qrSvg: string;
}) {
  const [confirmState, confirmAction, confirmPending] = useActionState<
    TotpActionState,
    FormData
  >(confirmAdminTotpAction, null);
  const [restartState, restartAction, restartPending] = useActionState<
    TotpActionState,
    FormData
  >(restartAdminTotpAction, null);

  return (
    <div className="mt-3">
      <p className="text-sm text-ink/60">
        Scan this code with an authenticator app, then enter the 6-digit code
        it shows.
      </p>
      <div
        role="img"
        aria-label="QR code for your authenticator app"
        className="mt-4 w-fit rounded-xl border border-ink/10 bg-white p-2"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <p className="mt-4 text-sm text-ink/60">Or type this key into the app.</p>
      <p className="mt-2 font-mono text-sm tracking-wide text-ink">{manualKey}</p>
      <form action={confirmAction} className="mt-5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">6-digit code</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            className={codeClass}
          />
        </label>
        <ActionError message={confirmState?.error} />
        <button
          type="submit"
          disabled={confirmPending}
          className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {confirmPending ? "Checking…" : "Confirm and turn on"}
        </button>
      </form>
      <form action={restartAction} className="mt-3">
        <ActionError message={restartState?.error} />
        <button
          type="submit"
          name="intent"
          value="restart"
          disabled={restartPending}
          className="inline-flex h-10 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
        >
          {restartPending ? "Starting over…" : "Start over"}
        </button>
      </form>
    </div>
  );
}

function EnabledSetup() {
  const [state, action, pending] = useActionState<TotpActionState, FormData>(
    disableAdminTotpAction,
    null,
  );

  return (
    <form action={action} className="mt-3">
      <p className="text-sm text-ink/60">
        This account asks for a 6-digit code from the authenticator app after
        the password. Enter a current code to turn it off.
      </p>
      <label className="mt-4 flex flex-col gap-1.5 text-sm">
        <span className="text-ink/60">6-digit code</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
          className={codeClass}
        />
      </label>
      <ActionError message={state?.error} />
      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Turning off…" : "Turn off"}
      </button>
    </form>
  );
}

function ActionError({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="mt-3 text-sm text-rose-800">
      {message}
    </p>
  );
}
