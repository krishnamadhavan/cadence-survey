"use client";

import { useRouter } from "next/navigation";
import { TENURE_BANDS } from "@/lib/employee-attributes";

type ReportFiltersProps = {
  token: string;
  teams: { id: string; name: string }[];
  roles: string[];
  teamId: string;
  role: string;
  tenure: string;
};

export function ReportFilters({
  token,
  teams,
  roles,
  teamId,
  role,
  tenure,
}: ReportFiltersProps) {
  const router = useRouter();
  const roleOptions =
    role && !roles.includes(role)
      ? [...roles, role].sort((a, b) => a.localeCompare(b))
      : roles;
  const teamOptions =
    teamId && !teams.some((team) => team.id === teamId)
      ? [...teams, { id: teamId, name: "That team" }]
      : teams;
  const tenureOptions = TENURE_BANDS.some((band) => band.value === tenure)
    ? TENURE_BANDS
    : tenure
      ? [...TENURE_BANDS, { value: tenure, label: tenure }]
      : TENURE_BANDS;

  function push(next: { team: string; role: string; tenure: string }) {
    const params = new URLSearchParams();
    if (next.team) {
      params.set("team", next.team);
    }
    if (next.role) {
      params.set("role", next.role);
    }
    if (next.tenure) {
      params.set("tenure", next.tenure);
    }
    const query = params.toString();
    const path = `/admin/reports/${encodeURIComponent(token)}`;
    router.push(query ? `${path}?${query}` : path);
  }

  return (
    <>
      <select
        aria-label="Team segment"
        className="h-10 rounded-full border border-ink/15 bg-white px-4 text-sm text-ink"
        value={teamId}
        onChange={(event) => {
          push({ team: event.target.value, role, tenure });
        }}
      >
        <option value="">All teams</option>
        {teamOptions.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Role segment"
        className="h-10 rounded-full border border-ink/15 bg-white px-4 text-sm text-ink"
        value={role}
        onChange={(event) => {
          push({ team: teamId, role: event.target.value, tenure });
        }}
      >
        <option value="">All roles</option>
        {roleOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        aria-label="Tenure segment"
        className="h-10 rounded-full border border-ink/15 bg-white px-4 text-sm text-ink"
        value={tenure}
        onChange={(event) => {
          push({ team: teamId, role, tenure: event.target.value });
        }}
      >
        <option value="">All tenure</option>
        {tenureOptions.map((band) => (
          <option key={band.value} value={band.value}>
            {band.label}
          </option>
        ))}
      </select>
    </>
  );
}
