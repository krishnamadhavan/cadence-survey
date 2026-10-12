import type { SurveyStatus } from "@/db/schema";
import type { PulseParticipation } from "@/lib/pulse-participation";
import { CopyLinkButton } from "./copy-link-button";

type ParticipationProps = {
  participation: PulseParticipation | null;
  error: boolean;
  publicToken: string;
  status: SurveyStatus;
};

export function Participation({
  participation,
  error,
  publicToken,
  status,
}: ParticipationProps) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
        Participation
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-ink/60">
        How many people have answered, by the team they are on now. Teams that
        are furthest behind come first. People who have already answered are
        counted here, and their personal links stay hidden. They can still
        change that answer from the link they already have, until the pulse
        closes. This count is separate from the score breakdown, which still
        hides a team that is too small to show.
      </p>
      {error || !participation ? (
        <p className="mt-4 text-sm text-ink/70">Could not load participation.</p>
      ) : !participation.issued ? (
        <p className="mt-4 text-sm text-ink/60">
          Links are created when this pulse opens. Participation shows up then,
          by team.
        </p>
      ) : participation.total === 0 ? (
        <p className="mt-4 text-sm text-ink/60">
          No one is on the roster yet. Add people on the employees page.
        </p>
      ) : (
        <ParticipationBody
          participation={participation}
          publicToken={publicToken}
          status={status}
        />
      )}
    </section>
  );
}

function ParticipationBody({
  participation,
  publicToken,
  status,
}: {
  participation: PulseParticipation;
  publicToken: string;
  status: SurveyStatus;
}) {
  const { responded, total } = participation;
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="rounded-2xl border border-ink/10 bg-white/70 px-4 py-4">
        <p className="text-sm font-medium text-ink">
          {responded} of {total} {total === 1 ? "person has" : "people have"} answered
        </p>
        <ParticipationMeter responded={responded} total={total} label="All teams" />
        {status === "open" ? (
          <p className="mt-3 text-sm text-ink/60">
            Copy a link to nudge someone who has not answered yet.
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink/60">
            This pulse is closed, so the people still listed can no longer answer.
          </p>
        )}
      </div>
      {participation.teams.map((team) => {
        const complete = team.responded === team.total;
        return (
          <article
            key={team.teamId}
            className="rounded-2xl border border-ink/10 bg-white/70 px-4 py-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-ink">{team.teamName}</h3>
                <p className="mt-1 text-sm text-ink/60">
                  {team.responded} of {team.total} answered
                </p>
              </div>
              <TeamBadge responded={team.responded} total={team.total} />
            </div>
            <ParticipationMeter
              responded={team.responded}
              total={team.total}
              label={team.teamName}
            />
            {complete ? (
              <p className="mt-3 text-sm text-ink/60">
                Everyone on this team has answered.
              </p>
            ) : (
              <>
                <p className="mt-4 text-xs font-medium tracking-wide text-ink/45 uppercase">
                  Still to answer
                </p>
                <ul className="mt-2 flex max-h-80 flex-col gap-2 overflow-y-auto">
                  {team.waiting.map((person) => (
                    <li
                      key={person.email}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/5 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{person.name}</p>
                        <p className="truncate text-sm text-ink/50">{person.email}</p>
                      </div>
                      {status === "open" && person.token ? (
                        <CopyLinkButton
                          path={`/s/${publicToken}/${person.token}`}
                        />
                      ) : (
                        <p className="text-sm text-ink/45">Has not answered</p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ParticipationMeter({
  responded,
  total,
  label,
}: {
  responded: number;
  total: number;
  label: string;
}) {
  const width = total === 0 ? 0 : Math.round((responded / total) * 100);
  return (
    <div
      className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={responded}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
    </div>
  );
}

function TeamBadge({ responded, total }: { responded: number; total: number }) {
  if (responded === total) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Complete
      </span>
    );
  }
  if (responded === 0) {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
        Not started
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
      Behind
    </span>
  );
}
