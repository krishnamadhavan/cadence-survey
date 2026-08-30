"use client";

import { useActionState } from "react";
import { loginAdmin, type LoginState } from "./actions";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    loginAdmin,
    null,
  );

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
          className="h-12 rounded-xl border border-ink/10 bg-white/70 px-4 text-base text-ink outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-ink/60">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-xl border border-ink/10 bg-white/70 px-4 text-base text-ink outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
        />
      </label>
      {state?.error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-sm font-medium text-paper transition-colors hover:bg-ink/90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
