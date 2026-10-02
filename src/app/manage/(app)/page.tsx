import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutManager } from "@/app/manage/login/actions";
import {
  getManagerPulseResults,
  type ManagerPulseComment,
  type ManagerPulseHealth,
  type ManagerPulseQuestion,
  type ManagerPulseResults,
  type ManagerTeamPulse,
} from "@/db/manager-results";
import { getManagerSessionUser } from "@/lib/manager";

export const dynamic = "force-dynamic";

type ManagerHomeProps = {
  searchParams: Promise<{ team?: string | string[] }>;
};

export default async function ManagerHomePage({ searchParams }: ManagerHomeProps) {
  const manager = await getManagerSessionUser();
  if (!manager) {
    redirect("/manage/login");
  }

  const requested = requestedTeam((await searchParams).team);
  const active =
    manager.teams.find((team) => team.id === requested) ?? manager.teams[0];
  if (!active) {
    redirect("/manage/login");
  }
  if (requested && active.id !== requested) {
    redirect("/manage");
  }

  let pulse: ManagerPulseResults | null = null;
  let pulseError = false;
  try {
    pulse = await getManagerPulseResults(manager.teams.map((team) => team.id));
  } catch {
    pulseError = true;
  }
  const activePulse = pulse?.teams.find((team) => team.teamId === active.id) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16">
      <p className="text-sm tracking-wide text-accent uppercase">Cadence</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-4xl text-ink">{manager.name}</h1>
        <form action={logoutManager}>
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-full px-4 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </div>
      <p className="mt-2 text-ink/55">{manager.email}</p>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Latest pulse
        </h2>
        {pulseError ? (
          <p className="mt-3 text-sm text-ink/70">Could not reach Postgres.</p>
        ) : pulse?.survey ? (
          <p className="mt-2 text-ink/70">
            <span className="font-medium text-ink">{pulse.survey.title}</span>
            <span className="text-ink/40"> · {pulse.survey.status === "open" ? "Live" : "Closed"}</span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink/60">No pulse has opened yet.</p>
        )}

        {manager.teams.length > 1 ? (
          <nav aria-label="Teams you lead" className="mt-4 flex flex-wrap gap-2">
            {manager.teams.map((team) => {
              const selected = team.id === active.id;
              return (
                <Link
                  key={team.id}
                  href={teamHref(team.id, manager.teams[0]?.id)}
                  aria-current={selected ? "page" : undefined}
                  className={
                    selected
                      ? "inline-flex h-9 items-center rounded-full bg-ink px-3 text-sm text-paper"
                      : "inline-flex h-9 items-center rounded-full border border-ink/10 bg-white/70 px-3 text-sm text-ink transition-colors hover:bg-ink/5"
                  }
                >
                  {team.name}
                </Link>
              );
            })}
          </nav>
        ) : null}

        <article className="mt-4 rounded-2xl border border-ink/10 bg-white/70 px-5 py-5">
          <h3 className="font-medium text-ink">{active.name}</h3>
          <TeamPulse
            pulse={activePulse}
            floor={pulse?.anonymityFloor ?? null}
            showStats={Boolean(pulse?.survey) && !pulseError}
          />
          <div className="mt-5 border-t border-ink/10 pt-4">
            <h4 className="text-xs tracking-wide text-ink/40 uppercase">People</h4>
            {active.people.length === 0 ? (
              <p className="mt-2 text-sm text-ink/45">No one else on this team.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {active.people.map((person) => (
                  <li key={person.id} className="text-sm text-ink/70">
                    <span className="text-ink">{person.name}</span>
                    <span className="text-ink/40"> · {person.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </section>

      <p className="mt-12 text-sm text-ink/45">
        <Link href="/" className="underline-offset-4 hover:text-ink hover:underline">
          Home
        </Link>
      </p>
    </main>
  );
}

function TeamPulse({
  pulse,
  floor,
  showStats,
}: {
  pulse: ManagerTeamPulse | null;
  floor: number | null;
  showStats: boolean;
}) {
  if (!showStats || !pulse) {
    return null;
  }
  if (!pulse.published) {
    return (
      <p className="mt-3 text-sm leading-6 text-ink/60">
        {pulse.responseCount === 0
          ? "No responses from this team yet."
          : `Results stay hidden until ${floor ?? 3} people on this team have answered. ${pulse.responseCount} so far.`}
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Average" value={formatScore(pulse.averageScore)} />
        <Stat label="Responses" value={String(pulse.responseCount)} />
        <div>
          <p className="text-xs tracking-wide text-ink/45 uppercase">Health</p>
          <p className="mt-2">
            <HealthBadge health={pulse.health} />
          </p>
        </div>
      </div>
      <ul className="mt-5 flex flex-col gap-4">
        {pulse.questions.map((question) => (
          <li key={question.id}>
            <QuestionScore question={question} />
          </li>
        ))}
      </ul>
      <WrittenFeedback comments={pulse.comments} />
    </div>
  );
}

function WrittenFeedback({ comments }: { comments: ManagerPulseComment[] }) {
  const groups: { questionId: string; question: string; texts: string[] }[] = [];
  for (const comment of comments) {
    const last = groups[groups.length - 1];
    if (last && last.questionId === comment.questionId) {
      last.texts.push(comment.text);
    } else {
      groups.push({
        questionId: comment.questionId,
        question: comment.question,
        texts: [comment.text],
      });
    }
  }

  return (
    <div className="mt-6 border-t border-ink/10 pt-4">
      <h4 className="text-xs tracking-wide text-ink/45 uppercase">Written feedback</h4>
      {groups.length === 0 ? (
        <p className="mt-2 text-sm text-ink/55">No written feedback on this pulse.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.questionId}>
              <p className="text-sm font-medium text-ink">{group.question}</p>
              <ul className="mt-2 flex flex-col gap-2">
                {group.texts.map((text, index) => (
                  <li
                    key={`${group.questionId}-${index}`}
                    className="rounded-xl bg-ink/5 px-3 py-2 text-sm leading-6 text-ink/80"
                  >
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs tracking-wide text-ink/45 uppercase">{label}</p>
      <p className="mt-1 font-serif text-3xl text-ink">{value}</p>
    </div>
  );
}

function QuestionScore({ question }: { question: ManagerPulseQuestion }) {
  return (
    <div>
      <p className="text-sm font-medium text-ink">{question.prompt}</p>
      {question.scale ? (
        <div className="mt-2">
          <p className="mb-1.5 text-sm text-ink/60">
            {formatScore(question.scale.average)} of {question.scale.max}
            <span className="text-ink/40"> · {question.scale.count} answers</span>
          </p>
          <ScoreBar
            value={question.scale.average}
            max={question.scale.max}
            health={questionHealth(question.scale.average)}
          />
        </div>
      ) : null}
      {question.choice ? (
        <ul className="mt-2 flex flex-col gap-1">
          {question.choice.options.map((option) => {
            const pct = question.choice?.count
              ? Math.round((option.count / question.choice.count) * 100)
              : 0;
            return (
              <li key={option.label} className="flex justify-between gap-3 text-sm text-ink/70">
                <span className="text-ink">{option.label}</span>
                <span>
                  {option.count} ({pct}%)
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {question.text ? (
        <p className="mt-2 text-sm text-ink/55">
          {question.text.count} written {question.text.count === 1 ? "answer" : "answers"}
        </p>
      ) : null}
    </div>
  );
}

function ScoreBar({
  value,
  max,
  health,
}: {
  value: number | null;
  max: number;
  health: ManagerPulseHealth;
}) {
  const width =
    value === null || max <= 0 ? 0 : Math.max(6, Math.min(100, Math.round((value / max) * 100)));
  const color =
    health === "low" ? "bg-rose-500" : health === "watch" ? "bg-amber-500" : "bg-accent";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function HealthBadge({ health }: { health: ManagerPulseHealth }) {
  return <span className={healthClass(health)}>{healthLabel(health)}</span>;
}

function questionHealth(avg: number | null): ManagerPulseHealth {
  if (avg === null || avg >= 3.5) {
    return "ok";
  }
  if (avg < 3) {
    return "low";
  }
  return "watch";
}

function healthLabel(health: ManagerPulseHealth): string {
  if (health === "low") {
    return "Low";
  }
  if (health === "watch") {
    return "Watch";
  }
  return "Ok";
}

function healthClass(health: ManagerPulseHealth): string {
  if (health === "low") {
    return "inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800";
  }
  if (health === "watch") {
    return "inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900";
  }
  return "inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800";
}

function formatScore(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(1);
}

function requestedTeam(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value ? value : null;
}

function teamHref(teamId: string, defaultTeamId: string | undefined): string {
  if (teamId === defaultTeamId) {
    return "/manage";
  }
  return `/manage?team=${encodeURIComponent(teamId)}`;
}
