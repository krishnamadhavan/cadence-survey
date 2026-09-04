import Link from "next/link";
import { getDashboardSnapshot } from "@/db/dashboard";
import {
  SUPPRESSED_TEAM_NAME,
  type TeamHealth,
  type TeamSummary,
} from "@/db/results";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  let snapshot: Awaited<ReturnType<typeof getDashboardSnapshot>> | null = null;
  let dbError = false;

  try {
    snapshot = await getDashboardSnapshot();
  } catch {
    dbError = true;
  }

  const active = snapshot?.active ?? null;
  const roster = snapshot?.employeeCount ?? 0;
  const participation =
    active && roster > 0
      ? Math.min(100, Math.round((active.survey.responseCount / roster) * 100))
      : null;
  const watching =
    active?.teams.filter(
      (team) =>
        team.health !== "ok" &&
        team.responseCount > 0 &&
        team.teamName !== SUPPRESSED_TEAM_NAME,
    ) ?? [];
  const publishedTeams =
    active?.teams.filter((team) => team.teamName !== SUPPRESSED_TEAM_NAME) ?? [];

  return (
    <div className="w-full">
      <header>
        <h1 className="font-serif text-4xl text-ink">Dashboard</h1>
        <p className="mt-2 text-ink/60">
          Pulse scores, participation, and what needs attention.
        </p>
      </header>

      {dbError ? (
        <p className="mt-10 text-ink/70">Could not reach Postgres.</p>
      ) : snapshot ? (
        <>
          <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Open pulses"
              value={String(snapshot.openCount)}
              hint={
                snapshot.openCount === 1
                  ? "One survey is collecting answers"
                  : "Surveys currently accepting answers"
              }
            />
            <Stat
              label="Responses"
              value={
                active ? String(active.survey.responseCount) : "—"
              }
              hint={
                !active
                  ? "No live pulse"
                  : participation === null
                    ? "On the active cycle"
                    : `${participation}% of the roster`
              }
            />
            <Stat
              label="Average score"
              value={formatScore(active?.survey.averageScore ?? null)}
              hint={
                active
                  ? "Scale questions on the active cycle"
                  : "No live pulse"
              }
            />
            <Stat
              label="Roster"
              value={String(snapshot.employeeCount)}
              hint={`${snapshot.teamCount} ${snapshot.teamCount === 1 ? "team" : "teams"}`}
            />
          </section>

          <div className="mt-10 grid gap-6 xl:grid-cols-5">
            <section className="rounded-2xl border border-ink/10 bg-white/70 px-5 py-5 xl:col-span-3">
              <p className="text-xs font-medium tracking-wide text-ink/45 uppercase">
                Active cycle
              </p>
              {active ? (
                <>
                  <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="font-serif text-3xl text-ink">
                      {active.survey.title}
                    </h2>
                    <StatusPill status={active.survey.status} />
                  </div>
                  <p className="mt-3 text-sm text-ink/60">
                    {active.survey.responseCount}{" "}
                    {active.survey.responseCount === 1
                      ? "response"
                      : "responses"}
                    {participation === null
                      ? ""
                      : ` · ${participation}% of roster`}
                    {" · "}
                    average {formatScore(active.survey.averageScore)}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href={`/admin/s/${active.survey.publicToken}`}
                      className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper"
                    >
                      View results
                    </Link>
                    <Link
                      href={`/s/${active.survey.publicToken}`}
                      className="inline-flex h-10 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 hover:bg-ink/5 hover:text-ink"
                    >
                      Public link
                    </Link>
                  </div>
                </>
              ) : snapshot.surveys.length === 0 ? (
                <p className="mt-3 text-sm text-ink/70">
                  No surveys yet. Seed the weekly pulse or create one from
                  Surveys.
                </p>
              ) : (
                <p className="mt-3 text-sm text-ink/70">
                  No live pulse right now. Closed and draft surveys are listed
                  below.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-ink/10 bg-white/70 px-5 py-5 xl:col-span-2">
              <p className="text-xs font-medium tracking-wide text-ink/45 uppercase">
                Needs attention
              </p>
              {watching.length === 0 ? (
                <p className="mt-3 text-sm text-ink/70">
                  No named teams are below the watch line right now.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {watching.map((team) => (
                    <li
                      key={team.teamId ?? team.teamName}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="font-medium text-ink">{team.teamName}</span>
                      <span className="flex items-center gap-2 text-ink/60">
                        {formatScore(team.averageScore)}
                        <HealthBadge team={team} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {active ? (
                <Link
                  href={`/admin/s/${active.survey.publicToken}`}
                  className="mt-4 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
                >
                  Open team breakdown
                </Link>
              ) : null}
            </section>
          </div>

          <section className="mt-10">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
                Pulses
              </h2>
              <Link
                href="/admin"
                className="text-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                All surveys
              </Link>
            </div>
            {snapshot.surveys.length === 0 ? (
              <p className="mt-4 text-sm text-ink/70">No surveys yet.</p>
            ) : (
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {snapshot.surveys.map((survey) => (
                  <li key={survey.id}>
                    <Link
                      href={`/admin/s/${survey.publicToken}`}
                      className="block rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 transition-colors hover:border-accent/40"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-medium text-ink">{survey.title}</p>
                        <StatusPill status={survey.status} />
                      </div>
                      <p className="mt-1 text-sm text-ink/50">
                        {survey.responseCount}{" "}
                        {survey.responseCount === 1 ? "response" : "responses"}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {publishedTeams.length > 0 ? (
            <section className="mt-10">
              <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
                Team snapshot
              </h2>
              <p className="mt-1 text-sm text-ink/55">
                Named teams that meet the anonymity floor on the active cycle.
              </p>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead className="border-b border-ink/10 text-ink/45">
                    <tr>
                      <th className="px-4 py-3 font-medium">Team</th>
                      <th className="px-4 py-3 font-medium">Responses</th>
                      <th className="px-4 py-3 font-medium">Avg score</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publishedTeams.map((team) => (
                      <tr
                        key={team.teamId ?? team.teamName}
                        className="border-t border-ink/5"
                      >
                        <td className="px-4 py-3 font-medium text-ink">
                          {team.teamName}
                        </td>
                        <td className="px-4 py-3 text-ink/70">
                          {team.responseCount}
                        </td>
                        <td className="px-4 py-3 text-ink">
                          {formatScore(team.averageScore)}
                        </td>
                        <td className="px-4 py-3">
                          <HealthBadge team={team} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="mt-10">
            <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
              Shortcuts
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Shortcut
                href="/admin/employees"
                title="Employees"
                body="Load or search the roster."
              />
              <Shortcut
                href="/admin/teams"
                title="Teams"
                body="Create and rename the org map."
              />
              <Shortcut
                href="/admin/action-plans"
                title="Action plans"
                body="Follow-ups after a pulse. Coming soon."
              />
              <Shortcut
                href="/admin/recommendations"
                title="Recommendations"
                body="Suggested next steps. Coming soon."
              />
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/70 px-5 py-4">
      <p className="text-xs tracking-wide text-ink/45 uppercase">{label}</p>
      <p className="mt-2 font-serif text-3xl text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink/50">{hint}</p> : null}
    </div>
  );
}

function Shortcut({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 transition-colors hover:border-accent/40"
      >
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm text-ink/55">{body}</p>
      </Link>
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  const label =
    status === "open" ? "Live" : status === "closed" ? "Closed" : "Draft";
  return (
    <span className="rounded-full border border-ink/10 px-2.5 py-0.5 text-xs font-medium text-ink/60">
      {label}
    </span>
  );
}

function formatScore(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(1);
}

function HealthBadge({ team }: { team: TeamSummary }) {
  if (team.responseCount === 0) {
    return <span className="text-ink/40">No data</span>;
  }
  return <span className={healthClass(team.health)}>{healthLabel(team.health)}</span>;
}

function healthLabel(health: TeamHealth): string {
  if (health === "low") {
    return "Low";
  }
  if (health === "watch") {
    return "Watch";
  }
  return "Ok";
}

function healthClass(health: TeamHealth): string {
  if (health === "low") {
    return "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800";
  }
  if (health === "watch") {
    return "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900";
  }
  return "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800";
}
