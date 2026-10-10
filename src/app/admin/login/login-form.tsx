"use client";

import { useActionState } from "react";
import { loginAdmin, type LoginState } from "./actions";

const fieldClass =
  "h-12 rounded-xl border border-ink/10 bg-white/70 px-4 text-base text-ink outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20";

export function LoginForm({
  nextPath,
  challengeEmail,
}: {
  nextPath: string;
  challengeEmail: string | null;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    loginAdmin,
    null,
  );
  const showCode = state ? state.step === "code" : challengeEmail !== null;
  const email = state?.email ?? challengeEmail ?? "";

  if (showCode) {
    return (
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={nextPath} />
        <p className="text-sm text-ink/70">
          Enter the 6-digit code from the authenticator app
          {email ? ` for ${email}` : ""}.
        </p>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-ink/60">Authenticator code</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            autoFocus
            className={fieldClass}
          />
        </label>
        {state?.error ? <LoginError message={state.error} /> : null}
        <button
          type="submit"
          name="intent"
          value="code"
          disabled={pending}
          className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-sm font-medium text-paper transition-colors hover:bg-ink/90 disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <button
          type="submit"
          name="intent"
          value="cancel"
          formNoValidate
          disabled={pending}
          className="inline-flex h-12 items-center justify-center rounded-full border border-ink/15 px-6 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-60"
        >
          Use password instead
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={nextPath} />
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-ink/60">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-ink/60">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className={fieldClass}
        />
      </label>
      {state?.error ? <LoginError message={state.error} /> : null}
      <button
        type="submit"
        name="intent"
        value="password"
        disabled={pending}
        className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-sm font-medium text-paper transition-colors hover:bg-ink/90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function LoginError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
    >
      {message}
    </p>
  );
}
