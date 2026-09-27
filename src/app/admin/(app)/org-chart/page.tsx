import { getOrgChart } from "@/db/org-chart";

export const dynamic = "force-dynamic";

export default async function AdminOrgChartPage() {
  let groups: Awaited<ReturnType<typeof getOrgChart>> = [];
  let dbError = false;
  try {
    groups = await getOrgChart();
  } catch {
    dbError = true;
  }

  const managed = groups.filter((group) => group.managerId);
  const unassigned = groups.find((group) => group.managerId === null);

  return (
    <div className="w-full">
      <div className="min-w-0">
        <h1 className="font-serif text-4xl text-ink">Org chart</h1>
        <p className="mt-2 max-w-2xl text-ink/60">
          Each manager, the team they run, and the people on that team.
        </p>
      </div>

      {dbError ? (
        <p className="mt-8 text-ink/70">Could not reach Postgres.</p>
      ) : groups.length === 0 ? (
        <p className="mt-8 text-ink/70">No teams yet.</p>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          {managed.map((group) => (
            <OrgGroupCard key={group.managerId} group={group} />
          ))}
          {unassigned ? (
            <OrgGroupCard key="unassigned" group={unassigned} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function OrgGroupCard({
  group,
}: {
  group: Awaited<ReturnType<typeof getOrgChart>>[number];
}) {
  return (
    <section className="rounded-2xl border border-ink/10 bg-white/70">
      <div className="border-b border-ink/10 px-5 py-4">
        <p className="text-sm font-medium text-ink">{group.managerName}</p>
        {group.managerEmail ? (
          <p className="mt-0.5 text-sm text-ink/50">{group.managerEmail}</p>
        ) : (
          <p className="mt-0.5 text-sm text-ink/45">These teams have no manager.</p>
        )}
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        {group.teams.map((team) => (
          <div key={team.teamId}>
            <p className="text-sm font-medium text-ink/80">{team.teamName}</p>
            {team.people.length === 0 ? (
              <p className="mt-1 text-sm text-ink/45">No one else on this team.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {team.people.map((person) => (
                  <li key={person.id} className="text-sm text-ink/70">
                    <span className="text-ink">{person.name}</span>
                    <span className="text-ink/40"> · {person.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
