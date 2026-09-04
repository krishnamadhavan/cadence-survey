import Link from "next/link";
import { notFound } from "next/navigation";
import { getSurveyResults, SUPPRESSED_TEAM_NAME } from "@/db/results";
import type { QuestionResults, TeamHealth, TeamSummary } from "@/db/results";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";
import { ExportButtons } from "./export-buttons";

export const dynamic = "force-dynamic";

type ResultsPageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: ResultsPageProps) {
  const { token } = await params;
  return { title: `Results · ${token} · Cadence` };
}

export default async function SurveyResultsPage({ params }: ResultsPageProps) {
  const { token } = await params;
  let results;

  try {
    results = await getSurveyResults(token);
  } catch {
    return (
      <div className="w-full">
        <p className="text-ink/70">Could not reach Postgres.</p>
      </div>
    );
  }

  if (!results) {
    notFound();
  }

  const struggling = results.teams.filter(
    (team) =>
      team.health !== "ok" &&
      team.responseCount > 0 &&
      team.teamName !== SUPPRESSED_TEAM_NAME,
  );

  return (
    <div className="flex w-full flex-col">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl text-ink">{results.survey.title}</h1>
          <p className="mt-2 text-sm text-ink/50">
            <Link
              href={`/s/${results.survey.publicToken}`}
              className="hover:text-ink"
            >
              Public link
            </Link>
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <ExportButtons token={results.survey.publicToken} />
          <p className="max-w-xs text-right text-xs text-ink/45">
            CSV and Excel include written comments from teams that meet the
            anonymity floor.
          </p>
        </div>
      </header>

      <section className="mt-10 grid gap-3 sm:grid-cols-3">
        <Stat label="Responses" value={String(results.survey.responseCount)} />
        <Stat
          label="Average score"
          value={formatScore(results.survey.averageScore)}
        />
        <Stat
          label="Teams to watch"
          value={String(struggling.length)}
          hint={
            struggling.length > 0
              ? struggling.map((team) => team.teamName).join(", ")
              : "None right now"
          }
        />
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          By team
        </h2>
        <p className="mt-1 text-sm text-ink/55">
          Sorted worst first. Low is under 3.0, watch is under 3.5. Teams with
          fewer than {MIN_TEAM_RESPONSES} responses are hidden so one person
          cannot be identified.
        </p>
        {results.teams.length === 0 ? (
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
                {results.teams.map((team) => (
                  <tr
                    key={team.teamId ?? "unassigned"}
                    className="border-t border-ink/5"
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      {team.teamName}
                    </td>
                    <td className="px-4 py-3 text-ink/70">{team.responseCount}</td>
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

      <section className="mt-12 flex flex-col gap-8">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Per question
        </h2>
        {results.questions.map((question) => (
          <QuestionCard key={question.id} question={question} />
        ))}
      </section>
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

function QuestionCard({ question }: { question: QuestionResults }) {
  return (
    <article className="rounded-2xl border border-ink/10 bg-white/70 px-5 py-5">
      <p className="text-xs text-ink/40">Question {question.position}</p>
      <h3 className="mt-1 text-lg font-medium text-ink">{question.prompt}</h3>

      {question.scale ? (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-ink/60">
            Average {formatScore(question.scale.average)} of {question.scale.max}{" "}
            · {question.scale.count} answers
          </p>
          <ul className="flex flex-col gap-3">
            {question.scale.byTeam.map((team) => (
              <li key={team.teamId ?? "unassigned"}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-ink">{team.teamName}</span>
                  <span className="text-ink/60">
                    {formatScore(team.average)} · {team.count}
                  </span>
                </div>
                <ScoreBar
                  value={team.average}
                  max={question.scale?.max ?? 5}
                  tone={
                    team.average !== null && team.average < 3
                      ? "low"
                      : team.average !== null && team.average < 3.5
                        ? "watch"
                        : "ok"
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {question.choice ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[24rem] text-left text-sm">
            <thead className="text-ink/45">
              <tr>
                <th className="py-2 pr-3 font-medium">Team</th>
                {question.choice.options.map((option) => (
                  <th key={option} className="py-2 pr-3 font-medium">
                    {option}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {question.choice.byTeam.map((team) => (
                <tr key={team.teamId ?? "unassigned"} className="border-t border-ink/5">
                  <td className="py-2 pr-3 font-medium">{team.teamName}</td>
                  {question.choice?.options.map((option) => {
                    const n = team.counts[option] ?? 0;
                    const pct = team.count ? Math.round((n / team.count) * 100) : 0;
                    const isWorst =
                      option ===
                      question.choice?.options[question.choice.options.length - 1];
                    return (
                      <td
                        key={option}
                        className={`py-2 pr-3 ${isWorst && n > 0 ? "text-rose-800" : "text-ink/70"}`}
                      >
                        {n} ({pct}%)
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {question.text ? (
        <p className="mt-3 text-sm text-ink/60">
          {question.text.count} written answers. Scores are on the scale
          questions.
        </p>
      ) : null}
    </article>
  );
}

function ScoreBar({
  value,
  max,
  tone,
}: {
  value: number | null;
  max: number;
  tone: TeamHealth;
}) {
  const width = value === null ? 0 : Math.max(6, Math.round((value / max) * 100));
  const color =
    tone === "low"
      ? "bg-rose-500"
      : tone === "watch"
        ? "bg-amber-500"
        : "bg-accent";

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}
