import { notFound } from "next/navigation";
import { readSharedResults, type PublicQuestionScore } from "@/db/result-shares";
import type { TeamHealth } from "@/db/results";

export const dynamic = "force-dynamic";

type SharedResultsPageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: SharedResultsPageProps) {
  const { token } = await params;
  try {
    const shared = await readSharedResults(token);
    if (shared.state !== "ready") {
      return { title: "Report · Cadence" };
    }
    return { title: `${shared.report.title} · Cadence` };
  } catch {
    return { title: "Cadence" };
  }
}

export default async function SharedResultsPage({ params }: SharedResultsPageProps) {
  const { token } = await params;
  let shared: Awaited<ReturnType<typeof readSharedResults>>;
  try {
    shared = await readSharedResults(token);
  } catch {
    return (
      <Shell>
        <p className="text-ink/70">Could not reach Postgres.</p>
      </Shell>
    );
  }

  if (shared.state === "missing") {
    notFound();
  }
  if (shared.state === "unavailable") {
    return (
      <Shell>
        <p className="text-sm tracking-wide text-accent uppercase">Cadence</p>
        <h1 className="mt-3 font-serif text-4xl text-ink">Report unavailable</h1>
        <p className="mt-4 text-ink/70">
          This link has no published report right now. Results are shared while
          the pulse is closed.
        </p>
      </Shell>
    );
  }

  const report = shared.report;

  return (
    <Shell>
      <p className="text-sm tracking-wide text-accent uppercase">Shared results</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">{report.title}</h1>
      <p className="mt-3 text-sm text-ink/60">
        Teams with fewer than {report.anonymityFloor} responses are hidden.
        Written comments are not on this page.
      </p>

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <Stat label="Responses" value={String(report.responseCount)} />
        <Stat label="Average score" value={formatScore(report.averageScore)} />
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          By team
        </h2>
        {report.teams.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
            Not enough responses per team to show a breakdown.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
            <table className="w-full min-w-[24rem] text-left text-sm">
              <thead className="border-b border-ink/10 text-ink/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Team</th>
                  <th className="px-4 py-3 font-medium">Responses</th>
                  <th className="px-4 py-3 font-medium">Avg score</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.teams.map((team) => (
                  <tr key={team.teamName} className="border-t border-ink/5">
                    <td className="px-4 py-3 font-medium text-ink">{team.teamName}</td>
                    <td className="px-4 py-3 text-ink/70">{team.responseCount}</td>
                    <td className="px-4 py-3 text-ink">{formatScore(team.averageScore)}</td>
                    <td className="px-4 py-3">
                      <HealthBadge health={team.health} count={team.responseCount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10 flex flex-col gap-6">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Per question
        </h2>
        {report.questions.map((question) => (
          <QuestionBlock key={question.position} question={question} />
        ))}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16">
      {children}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/70 px-5 py-4">
      <p className="text-xs tracking-wide text-ink/45 uppercase">{label}</p>
      <p className="mt-2 font-serif text-3xl text-ink">{value}</p>
    </div>
  );
}

function QuestionBlock({ question }: { question: PublicQuestionScore }) {
  return (
    <article className="rounded-2xl border border-ink/10 bg-white/70 px-5 py-5">
      <p className="text-xs text-ink/40">Question {question.position}</p>
      <h3 className="mt-1 text-lg font-medium text-ink">{question.prompt}</h3>
      {question.scale ? (
        <div className="mt-4">
          <p className="text-sm text-ink/60">
            Average {formatScore(question.scale.average)} of {question.scale.max} ·{" "}
            {question.scale.count} answers
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {question.scale.byTeam.map((team) => (
              <li key={team.teamName} className="flex justify-between text-sm">
                <span className="text-ink">{team.teamName}</span>
                <span className="text-ink/60">
                  {formatScore(team.average)} · {team.count}
                </span>
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
                <tr key={team.teamName} className="border-t border-ink/5">
                  <td className="py-2 pr-3 font-medium">{team.teamName}</td>
                  {question.choice?.options.map((option) => (
                    <td key={option} className="py-2 pr-3 text-ink/70">
                      {team.counts[option] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {question.writtenCount !== null ? (
        <p className="mt-3 text-sm text-ink/60">
          {question.writtenCount} written answers. The text stays off this page.
        </p>
      ) : null}
    </article>
  );
}

function HealthBadge({ health, count }: { health: TeamHealth; count: number }) {
  if (count === 0) {
    return <span className="text-ink/40">No data</span>;
  }
  const label = health === "low" ? "Low" : health === "watch" ? "Watch" : "Ok";
  const className =
    health === "low"
      ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800"
      : health === "watch"
        ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
        : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800";
  return <span className={className}>{label}</span>;
}

function formatScore(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(1);
}
