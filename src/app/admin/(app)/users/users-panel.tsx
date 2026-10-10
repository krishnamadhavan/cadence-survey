"use client";

import { useActionState, useMemo, useState } from "react";
import type { AdminAccount } from "@/db/admins";
import { adminRoleLabel, adminRoleSwitchLabel, type AdminRole } from "@/lib/admin-role";
import {
  createAdminAction,
  deleteAdminAction,
  setAdminRoleAction,
  type UserActionState,
} from "./actions";

type UsersPanelProps = {
  accounts: AdminAccount[];
  currentId: string | null;
  dbError: boolean;
};

export function UsersPanel({ accounts, currentId, dbError }: UsersPanelProps) {
  const [query, setQuery] = useState("");
  const [createState, createAction, createPending] = useActionState<
    UserActionState,
    FormData
  >(createAdminAction, null);
  const adminCount = accounts.filter((account) => account.role === "admin").length;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return accounts;
    }
    return accounts.filter((account) => {
      const access = accessSearchText(account.role);
      return account.email.toLowerCase().includes(needle) || access.includes(needle);
    });
  }, [accounts, query]);

  return (
    <>
      <div className="min-w-0">
        <h1 className="font-serif text-4xl text-ink">Users</h1>
        <p className="mt-2 max-w-2xl text-ink/60">
          Accounts that can sign in. Switch another account between full access and
          viewer. Full access can change the workspace. A viewer can open the
          dashboard and reports and cannot change anything. At least one full-access
          account has to stay, and you can&apos;t change your own access.
        </p>
      </div>

      <form
        action={createAction}
        className="mt-8 flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white/70 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="off"
            className="h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
            className="h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30"
          />
        </label>
        <label className="flex w-full flex-col gap-1.5 text-sm sm:w-36">
          <span className="text-ink/60">Access</span>
          <select
            name="role"
            defaultValue="admin"
            className="h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30"
          >
            <option value="admin">Full access</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={createPending || dbError}
          className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {createPending ? "Adding…" : "Add account"}
        </button>
        {createState?.error ? (
          <p className="text-sm text-rose-800 sm:basis-full">{createState.error}</p>
        ) : createState?.ok ? (
          <p className="text-sm text-ink/55 sm:basis-full">Account added.</p>
        ) : (
          <p className="text-xs text-ink/40 sm:basis-full">
            Password needs at least 8 characters. A viewer can open the dashboard
            and reports and cannot change anything.
          </p>
        )}
      </form>

      <div className="mt-6">
        <label className="relative block max-w-xs">
          <span className="sr-only">Search accounts</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search email or access"
            className="h-10 w-full rounded-full border border-ink/10 bg-white/70 px-4 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-ink/30"
          />
        </label>
      </div>

      <section className="mt-4">
        {dbError ? (
          <p className="text-ink/70">Could not reach Postgres.</p>
        ) : accounts.length === 0 ? (
          <p className="text-ink/70">No admin accounts yet.</p>
        ) : filtered.length === 0 ? (
          <p className="text-ink/70">No accounts match that search.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-ink/10 text-ink/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Access</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((account) => {
                  const isYou = account.id === currentId;
                  const lastAdmin = account.role === "admin" && adminCount <= 1;
                  const lastAccount = accounts.length === 1;
                  return (
                    <tr key={account.id} className="border-t border-ink/5">
                      <td className="px-4 py-3 font-medium text-ink">
                        {account.email}
                        {isYou ? (
                          <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink/55">
                            You
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <RoleForm
                          key={`${account.id}-${account.role}`}
                          id={account.id}
                          email={account.email}
                          role={account.role}
                          locked={isYou || lastAdmin}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink/70">
                        {formatDate(account.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isYou || lastAdmin || lastAccount ? (
                          <span className="text-xs text-ink/40">
                            {isYou
                              ? "Signed in"
                              : lastAdmin
                                ? "Last full access"
                                : "Last account"}
                          </span>
                        ) : (
                          <RemoveButton id={account.id} email={account.email} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function RoleForm({
  id,
  email,
  role,
  locked,
}: {
  id: string;
  email: string;
  role: AdminRole;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState<UserActionState, FormData>(
    setAdminRoleAction,
    null,
  );
  const label = adminRoleLabel(role);
  if (locked) {
    return <span className="text-ink/70">{label}</span>;
  }
  const next = role === "admin" ? "viewer" : "admin";
  const switchLabel = adminRoleSwitchLabel(role);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="role" value={next} />
      <span className="text-ink">{label}</span>
      <button
        type="submit"
        disabled={pending}
        aria-label={`${switchLabel} for ${email}`}
        className="inline-flex h-8 items-center rounded-full border border-ink/15 px-3 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
      >
        {pending ? "Switching…" : switchLabel}
      </button>
      {state?.error ? <p className="basis-full text-xs text-rose-800">{state.error}</p> : null}
    </form>
  );
}

function RemoveButton({ id, email }: { id: string; email: string }) {
  const [state, action, pending] = useActionState<UserActionState, FormData>(
    deleteAdminAction,
    null,
  );
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8 items-center rounded-full border border-ink/15 px-3 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
      >
        {pending ? "Removing…" : `Remove ${email}`}
      </button>
      {state?.error ? <p className="text-xs text-rose-800">{state.error}</p> : null}
    </form>
  );
}

function accessSearchText(role: AdminRole): string {
  return role === "admin" ? "full access admin" : "viewer";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
