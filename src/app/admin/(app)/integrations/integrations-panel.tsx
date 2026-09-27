"use client";

import { useActionState, useMemo, useState } from "react";
import type { ApiKeyListItem } from "@/db/api-keys";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  type IntegrationActionState,
} from "./actions";

type IntegrationsPanelProps = {
  keys: ApiKeyListItem[];
  dbError: boolean;
};

type StatusFilter = "active" | "revoked" | "all";

export function IntegrationsPanel({ keys, dbError }: IntegrationsPanelProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [createState, createAction, createPending] = useActionState<
    IntegrationActionState,
    FormData
  >(createApiKeyAction, null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return keys.filter((key) => {
      const revoked = Boolean(key.revokedAt);
      if (status === "active" && revoked) {
        return false;
      }
      if (status === "revoked" && !revoked) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        key.name.toLowerCase().includes(needle) ||
        key.prefix.toLowerCase().includes(needle)
      );
    });
  }, [keys, query, status]);

  return (
    <>
      <div className="min-w-0">
        <h1 className="font-serif text-4xl text-ink">Integrations</h1>
        <p className="mt-2 text-ink/60">
          API keys for tools that call the admin API with{" "}
          <span className="font-medium text-ink/80">Authorization: Bearer</span>.
          The full key is shown once.
        </p>
      </div>

      <form
        action={createAction}
        className="mt-8 flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white/70 p-4 sm:flex-row sm:items-end"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
          <span className="text-ink/60">Name</span>
          <input
            name="name"
            required
            maxLength={80}
            placeholder="HRIS sync"
            className="h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-ink/30"
          />
        </label>
        <button
          type="submit"
          disabled={createPending || dbError}
          className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {createPending ? "Creating…" : "Create key"}
        </button>
        {createState?.error ? (
          <p className="text-sm text-rose-800 sm:basis-full">{createState.error}</p>
        ) : null}
      </form>

      {createState?.secret ? (
        <div className="mt-4 rounded-2xl border border-ink/10 bg-white/70 p-4">
          <p className="text-sm font-medium text-ink">Copy this key now. It will not be shown again.</p>
          <p className="mt-2 break-all font-mono text-sm text-ink">{createState.secret}</p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search keys</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or prefix"
            className="h-10 w-full rounded-full border border-ink/10 bg-white/70 px-4 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-ink/30"
          />
        </label>
        <label className="relative shrink-0">
          <span className="sr-only">Filter by status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="h-10 appearance-none rounded-full border border-ink/10 bg-white/70 py-0 pr-9 pl-4 text-sm text-ink outline-none focus:border-ink/30"
          >
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      <section className="mt-4">
        {dbError ? (
          <p className="text-ink/70">Could not reach Postgres.</p>
        ) : keys.length === 0 ? (
          <p className="text-ink/70">No API keys yet.</p>
        ) : filtered.length === 0 ? (
          <p className="text-ink/70">No keys match these filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-ink/10 text-ink/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Last used</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((key) => (
                  <tr key={key.id} className="border-t border-ink/5">
                    <td className="px-4 py-3 font-medium text-ink">{key.name}</td>
                    <td className="px-4 py-3 font-mono text-ink/70">{key.prefix}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink/70">
                      {formatDate(key.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink/70">
                      {key.revokedAt
                        ? `Revoked ${formatDate(key.revokedAt)}`
                        : key.lastUsedAt
                          ? formatDate(key.lastUsedAt)
                          : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {key.revokedAt ? (
                        <span className="text-xs text-ink/40">Revoked</span>
                      ) : (
                        <RevokeButton id={key.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function RevokeButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<IntegrationActionState, FormData>(
    revokeApiKeyAction,
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
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {state?.error ? <p className="text-xs text-rose-800">{state.error}</p> : null}
    </form>
  );
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
