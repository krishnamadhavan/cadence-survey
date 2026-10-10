"use client";

import { useActionState } from "react";
import {
  changeOwnAdminPasswordAction,
  updateOwnAdminAccountAction,
  type AccountActionState,
} from "./actions";

const fieldClass =
  "h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30";

export function AccountPanel({
  email,
  name,
}: {
  email: string;
  name: string | null;
}) {
  return (
    <>
      <AccountForm email={email} name={name} />
      <PasswordForm />
    </>
  );
}

function AccountForm({ email, name }: { email: string; name: string | null }) {
  const [state, action, pending] = useActionState<AccountActionState, FormData>(
    updateOwnAdminAccountAction,
    null,
  );
  const stamp = `${email}:${name ?? ""}`;

  return (
    <section className="mt-8 max-w-lg rounded-2xl border border-ink/10 bg-white/70 p-5">
      <h2 className="text-lg font-medium text-ink">Account</h2>
      <p className="mt-2 text-sm text-ink/60">
        The display name shows on the profile menu. Leave it blank to show your
        email. You sign in with the email.
      </p>
      <form action={action} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Display name</span>
          <input
            key={`name-${stamp}`}
            name="name"
            type="text"
            maxLength={80}
            autoComplete="name"
            defaultValue={name ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Email</span>
          <input
            key={`email-${stamp}`}
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="username"
            defaultValue={email}
            className={fieldClass}
          />
        </label>
        <ActionNote state={state} saved="Account saved." />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 w-fit items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save account"}
        </button>
      </form>
    </section>
  );
}

function PasswordForm() {
  const [state, action, pending] = useActionState<AccountActionState, FormData>(
    changeOwnAdminPasswordAction,
    null,
  );

  return (
    <section className="mt-4 max-w-lg rounded-2xl border border-ink/10 bg-white/70 p-5">
      <h2 className="text-lg font-medium text-ink">Password</h2>
      <p className="mt-2 text-sm text-ink/60">
        Use at least 8 characters. This signs out other sessions for this account.
      </p>
      <form
        key={state?.savedAt ?? "password"}
        action={action}
        className="mt-4 flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Current password</span>
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">New password</span>
          <input
            name="nextPassword"
            type="password"
            required
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Confirm new password</span>
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
            className={fieldClass}
          />
        </label>
        <ActionNote state={state} saved="Password changed." />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 w-fit items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Changing…" : "Change password"}
        </button>
      </form>
    </section>
  );
}

function ActionNote({
  state,
  saved,
}: {
  state: AccountActionState;
  saved: string;
}) {
  if (state?.error) {
    return (
      <p role="alert" className="text-sm text-rose-800">
        {state.error}
      </p>
    );
  }
  if (state?.ok) {
    return (
      <p role="status" className="text-sm text-ink/55">
        {saved}
      </p>
    );
  }
  return null;
}
