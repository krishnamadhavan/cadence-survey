import Link from "next/link";
import { notFound } from "next/navigation";
import { ExportButtons } from "@/app/admin/(app)/s/[token]/export-buttons";
import { getSurveyReportDetail } from "@/db/reports";
import {
  MIN_TEAM_RESPONSES,
  SUPPRESSED_TEAM_NAME,
  type QuestionResults,
  type TeamHealth,
  type TeamSummary,
} from "@/db/results";

export const dynamic = "force-dynamic";

type ReportDetailPageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: ReportDetailPageProps) {
  const { token } = await params;
  return { title: `Report · ${token} · Cadence` };
}

export default async function ReportDetailPage({
  params,
}: ReportDetailPageProps) {
  const { token } = await params;
  let detail: Awaited<ReturnType<typeof getSurveyReportDetail>> | null = null;
  let dbError = false;

  try {
    detail = await getSurveyReportDetail(token);
  } catch {
    dbError = true;
  }

  if (dbError) {
    return <p className="text-ink/70">Could not reach Postgres.</p>;
  }
  if (!detail) {
    notFound();
  }

  const { selected, previous, results, previousResults, surveys, employeeCount } =
    detail;
  const participation =
    employeeCount > 0
      ? Math.min(
          100,
          Math.round((results.survey.responseCount / employeeCount) * 100),
        )
      : null;
  const previousParticipation =
    previous && employeeCount > 0
      ? Math.min(100, Math.round((previous.responseCount / employeeCount) * 100))
      : null;
  const watching = results.teams.filter(
    (team) =>
      team.health !== "ok" &&
      team.responseCount > 0 &&
      team.teamName !== SUPPRESSED_TEAM_NAME,
  );
  const namedTeams = results.teams.filter(
    (team) => team.teamName !== SUPPRESSED_TEAM_NAME,
  );
  const scaleQuestions = results.questions.filter(
    (question) => question.scale,
  );
  const lowQuestions = scaleQuestions.filter((question) => {
    const average = question.scale?.average;
    return average !== null && average !== undefined && average < 3.5;
  });
  const commentCount = results.questions.reduce(
    (sum, question) => sum + (question.text?.count ?? 0),
    0,
  );
  const hasCycles = surveys.length >= 2;

  return (
    <div className="w-full">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin/reports"
            className="text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            All reports
          </Link>
          <h1 className="mt-3 font-serif text-4xl text-ink">
            {results.survey.title}
          </h1>
          <p className="mt-2 text-sm text-ink/50">
            <StatusPill status={results.survey.status} />
            <span className="ml-2">
              Created {formatDate(selected.createdAt)}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <ExportButtons token={selected.publicToken} />
          <p className="text-xs text-ink/45 sm:text-right">
            Written comments are only in the file, and only for teams that meet
            the anonymity floor.
          </p>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Filters / segments
        </h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            disabled
            className="h-10 rounded-full border border-ink/10 bg-white/50 px-4 text-sm text-ink/40"
            aria-label="Team segment"
          >
            <option>All teams</option>
          </select>
          <select
            disabled
            className="h-10 rounded-full border border-ink/10 bg-white/50 px-4 text-sm text-ink/40"
            aria-label="Role segment"
          >
            <option>All roles</option>
          </select>
          <select
            disabled
            className="h-10 rounded-full border border-ink/10 bg-white/50 px-4 text-sm text-ink/40"
            aria-label="Tenure segment"
          >
            <option>All tenure</option>
          </select>
          <p className="text-xs text-ink/40">
            Segments land when the roster has those attributes.
          </p>
        </div>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Responses"
          value={String(results.survey.responseCount)}
          hint={
            participation === null
              ? "Submitted answers"
              : `${participation}% of the roster`
          }
        />
        <Stat
          label="Average score"
          value={formatScore(results.survey.averageScore)}
          hint="Scale questions only"
        />
        <Stat
          label="Participation"
          value={participation === null ? "—" : `${participation}%`}
          hint={`${results.survey.responseCount} of ${employeeCount || "—"} people`}
        />
        <Stat
          label="Teams to watch"
          value={String(watching.length)}
          hint={
            watching.length > 0
              ? watching.map((team) => team.teamName).join(", ")
              : "None right now"
          }
        />
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Needs attention
        </h2>
        {watching.length === 0 && lowQuestions.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
            No named teams or scale questions sit below the watch line.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {watching.map((team) => (
              <li
                key={team.teamId ?? team.teamName}
                className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm"
              >
                <span className="font-medium text-ink">{team.teamName}</span>
                <span className="flex items-center gap-2 text-ink/60">
                  {formatScore(team.averageScore)}
                  <HealthBadge team={team} />
                </span>
              </li>
            ))}
            {lowQuestions.map((question) => (
              <li
                key={question.id}
                className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm"
              >
                <span className="min-w-0 truncate font-medium text-ink">
                  Q{question.position}. {question.prompt}
                </span>
                <span className="ml-3 shrink-0 text-ink/60">
                  {formatScore(question.scale?.average ?? null)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Compare vs last cycle
        </h2>
        {!hasCycles || !previous || !previousResults ? (
          <NeedsCycles />
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <CompareCard
              label="Average score"
              current={formatScore(results.survey.averageScore)}
              previous={formatScore(previous.averageScore)}
              delta={delta(results.survey.averageScore, previous.averageScore)}
              vs={previous.title}
            />
            <CompareCard
              label="Responses"
              current={String(results.survey.responseCount)}
              previous={String(previous.responseCount)}
              delta={
                results.survey.responseCount - previous.responseCount
              }
              vs={previous.title}
            />
            <CompareCard
              label="Participation"
              current={
                participation === null ? "—" : `${participation}%`
              }
              previous={
                previousParticipation === null
                  ? "—"
                  : `${previousParticipation}%`
              }
              delta={
                participation !== null && previousParticipation !== null
                  ? participation - previousParticipation
                  : null
              }
              vs={previous.title}
            />
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Trend over time
        </h2>
        {!hasCycles ? (
          <NeedsCycles />
        ) : (
          <TrendList
            label="Average score"
            items={surveys.map((survey) => ({
              id: survey.id,
              title: survey.title,
              value: survey.averageScore,
              display: formatScore(survey.averageScore),
            }))}
          />
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Participation over time
        </h2>
        {!hasCycles ? (
          <NeedsCycles />
        ) : (
          <TrendList
            label="Participation"
            items={surveys.map((survey) => ({
              id: survey.id,
              title: survey.title,
              value: survey.participation,
              display:
                survey.participation === null
                  ? "—"
                  : `${survey.participation}%`,
            }))}
          />
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Score by question
        </h2>
        <div className="mt-4 flex flex-col gap-6">
          {results.questions.map((question) => (
            <QuestionCard key={question.id} question={question} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Heatmap
        </h2>
        <p className="mt-1 text-sm text-ink/55">
          Team × scale question. Colour follows the same low / watch / ok
          bands. Small teams stay hidden.
        </p>
        {namedTeams.length === 0 || scaleQuestions.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
            Not enough published team scores to draw a heatmap.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-ink/10 text-ink/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Team</th>
                  {scaleQuestions.map((question) => (
                    <th key={question.id} className="px-3 py-3 font-medium">
                      Q{question.position}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {namedTeams.map((team) => (
                  <tr
                    key={team.teamId ?? team.teamName}
                    className="border-t border-ink/5"
                  >
                    <td className="px-4 py-2 font-medium text-ink">
                      {team.teamName}
                    </td>
                    {scaleQuestions.map((question) => {
                      const cell = question.scale?.byTeam.find(
                        (row) =>
                          (row.teamId ?? row.teamName) ===
                          (team.teamId ?? team.teamName),
                      );
                      return (
                        <td key={question.id} className="px-2 py-2">
                          <HeatCell value={cell?.average ?? null} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          By team
        </h2>
        <p className="mt-1 text-sm text-ink/55">
          Sorted worst first. Teams with fewer than {MIN_TEAM_RESPONSES}{" "}
          responses are hidden so one person cannot be identified.
        </p>
        {namedTeams.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
            Not enough responses per team to show a breakdown.
          </p>
        ) : (
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
                {namedTeams.map((team) => (
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
        )}
      </section>

      <section className="mt-10 rounded-2xl border border-ink/10 bg-white/70 px-5 py-5">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Comments
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink/60">
          {commentCount} written{" "}
          {commentCount === 1 ? "answer" : "answers"} on this pulse. The words
          themselves stay in the CSV/Excel download, and only for named teams
          that meet the floor.
        </p>
      </section>
    </div>
  );
}

function NeedsCycles() {
  return (
    <p className="mt-3 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
      Needs 2+ cycles. Run another pulse to compare and chart over time.
    </p>
  );
}

function CompareCard({
  label,
  current,
  previous,
  delta,
  vs,
}: {
  label: string;
  current: string;
  previous: string;
  delta: number | null;
  vs: string;
}) {
  const sign =
    delta === null || delta === 0 ? "" : delta > 0 ? "+" : "";
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/70 px-5 py-4">
      <p className="text-xs tracking-wide text-ink/45 uppercase">{label}</p>
      <p className="mt-2 font-serif text-3xl text-ink">{current}</p>
      <p className="mt-1 text-xs text-ink/50">
        {delta === null ? "—" : `${sign}${delta}`} vs {previous} ({vs})
      </p>
    </div>
  );
}

function TrendList({
  items,
}: {
  label: string;
  items: { id: string; title: string; value: number | null; display: string }[];
}) {
  const numeric = items
    .map((item) => item.value)
    .filter((value): value is number => value !== null);
  const max = numeric.length > 0 ? Math.max(...numeric, 1) : 1;
  return (
    <ul className="mt-3 flex flex-col gap-2 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4">
      {[...items].reverse().map((item) => (
        <li key={item.id}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-ink">{item.title}</span>
            <span className="text-ink/60">{item.display}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-accent"
              style={{
                width: `${item.value === null ? 0 : Math.max(6, Math.round((item.value / max) * 100))}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function HeatCell({ value }: { value: number | null }) {
  const tone =
    value === null ? "empty" : value < 3 ? "low" : value < 3.5 ? "watch" : "ok";
  const color =
    tone === "empty"
      ? "bg-ink/5 text-ink/30"
      : tone === "low"
        ? "bg-rose-200 text-rose-900"
        : tone === "watch"
          ? "bg-amber-200 text-amber-950"
          : "bg-emerald-200 text-emerald-900";
  return (
    <span
      className={`inline-flex min-w-12 items-center justify-center rounded-lg px-2 py-1 text-xs font-medium ${color}`}
    >
      {formatScore(value)}
    </span>
  );
}

function QuestionCard({ question }: { question: QuestionResults }) {
  return (
    <article className="rounded-2xl border border-ink/10 bg-white/70 px-5 py-5">
      <p className="text-xs text-ink/40">Question {question.position}</p>
      <h3 className="mt-1 text-lg font-medium text-ink">{question.prompt}</h3>
      {question.scale ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-ink/60">
            Average {formatScore(question.scale.average)} of {question.scale.max}{" "}
            · {question.scale.count} answers
          </p>
          <ul className="flex flex-col gap-3">
            {question.scale.byTeam.map((team) => (
              <li key={team.teamId ?? team.teamName}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-ink">{team.teamName}</span>
                  <span className="text-ink/60">
                    {formatScore(team.average)} · {team.count}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className={`h-full rounded-full ${
                      team.average !== null && team.average < 3
                        ? "bg-rose-500"
                        : team.average !== null && team.average < 3.5
                          ? "bg-amber-500"
                          : "bg-accent"
                    }`}
                    style={{
                      width: `${
                        team.average === null
                          ? 0
                          : Math.max(
                              6,
                              Math.round(
                                (team.average / (question.scale?.max ?? 5)) *
                                  100,
                              ),
                            )
                      }%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {question.choice ? (
        <p className="mt-3 text-sm text-ink/60">
          {question.choice.count} answers across{" "}
          {question.choice.options.join(", ")}.
        </p>
      ) : null}
      {question.text ? (
        <p className="mt-3 text-sm text-ink/60">
          {question.text.count} written answers. Text is in the export.
        </p>
      ) : null}
    </article>
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

function StatusPill({ status }: { status: string }) {
  const label =
    status === "open" ? "Live" : status === "closed" ? "Closed" : "Draft";
  return (
    <span className="rounded-full border border-ink/10 px-2.5 py-0.5 text-xs font-medium text-ink/60">
      {label}
    </span>
  );
}

function formatScore(value: number | null) {
  if (value === null) {
    return "—";
  }
  return value.toFixed(1);
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function delta(current: number | null, previous: number | null) {
  if (current === null || previous === null) {
    return null;
  }
  return Math.round((current - previous) * 10) / 10;
}

function HealthBadge({ team }: { team: TeamSummary }) {
  if (team.responseCount === 0) {
    return <span className="text-ink/40">No data</span>;
  }
  return (
    <span className={healthClass(team.health)}>{healthLabel(team.health)}</span>
  );
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
