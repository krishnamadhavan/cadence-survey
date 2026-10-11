import {
  completionPercent,
  completionStanding,
  type PulseParticipation,
} from "@/lib/pulse-participation";

type PulseCompletionProps = {
  participation: PulseParticipation | null;
  error: boolean;
  filtered?: boolean;
};

export function PulseCompletion({
  participation,
  error,
  filtered = false,
}: PulseCompletionProps) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
        Completion
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-ink/60">
        How much of the pulse is done, overall and by team. Lowest completion
        is first, so those are the teams to follow up with. Under half is
        marked low. This is who has answered, not their score.
        {filtered ? " This is the whole pulse, not the filters above." : ""}
      </p>
      {error || !participation ? (
        <p className="mt-4 text-sm text-ink/70">Could not load completion.</p>
      ) : !participation.issued ? (
        <p className="mt-4 text-sm text-ink/60">
          Completion shows once this pulse is open.
        </p>
      ) : participation.total === 0 ? (
        <p className="mt-4 text-sm text-ink/60">
          No one is on the roster for this pulse yet.
        </p>
      ) : (
        <CompletionBody participation={participation} />
      )}
    </section>
  );
}

function CompletionBody({ participation }: { participation: PulseParticipation }) {
  const { responded, total } = participation;
  const percent = completionPercent(responded, total);
  return (
    <>
      <div className="mt-4 rounded-2xl border border-ink/10 bg-white/70 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-ink">
            {responded} of {total} answered · {percent}%
          </p>
          <StandingBadge responded={responded} total={total} />
        </div>
        <Meter responded={responded} total={total} label="Overall completion" />
      </div>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="border-b border-ink/10 text-ink/45">
            <tr>
              <th className="px-4 py-3 font-medium">Team</th>
              <th className="px-4 py-3 font-medium">Answered</th>
              <th className="px-4 py-3 font-medium">Completion</th>
              <th className="px-4 py-3 font-medium">Follow up</th>
            </tr>
          </thead>
          <tbody>
            {participation.teams.map((team) => (
              <tr key={team.teamId} className="border-t border-ink/5">
                <td className="px-4 py-3 font-medium text-ink">{team.teamName}</td>
                <td className="px-4 py-3 text-ink/70">
                  {team.responded} of {team.total}
                </td>
                <td className="px-4 py-3 text-ink">
                  {completionPercent(team.responded, team.total)}%
                </td>
                <td className="px-4 py-3">
                  <StandingBadge responded={team.responded} total={team.total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Meter({
  responded,
  total,
  label,
}: {
  responded: number;
  total: number;
  label: string;
}) {
  const width = completionPercent(responded, total);
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

function StandingBadge({ responded, total }: { responded: number; total: number }) {
  const standing = completionStanding(responded, total);
  if (standing === "complete") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Complete
      </span>
    );
  }
  if (standing === "low") {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
        Low
      </span>
    );
  }
  return <span className="text-sm text-ink/40">—</span>;
}
