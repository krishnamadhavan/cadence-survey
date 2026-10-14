"use client";

import { useRouter } from "next/navigation";
import { TENURE_BANDS } from "@/lib/employee-attributes";

type ReportFiltersProps = {
  token: string;
  teams: { id: string; name: string }[];
  roles: string[];
  offices: string[];
  teamId: string;
  role: string;
  tenure: string;
  office: string;
};

export function ReportFilters({
  token,
  teams,
  roles,
  offices,
  teamId,
  role,
  tenure,
  office,
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
  const officeOptions =
    office && !offices.includes(office)
      ? [...offices, office].sort((a, b) => a.localeCompare(b))
      : offices;

  function push(next: { team: string; role: string; tenure: string; office: string }) {
    const params = new URLSearchParams();
    if (next.office) {
      params.set("office", next.office);
    }
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
        aria-label="Office segment"
        className="h-10 rounded-full border border-ink/15 bg-white px-4 text-sm text-ink"
        value={office}
        onChange={(event) => {
          push({ office: event.target.value, team: teamId, role, tenure });
        }}
      >
        <option value="">All offices</option>
        {officeOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        aria-label="Team segment"
        className="h-10 rounded-full border border-ink/15 bg-white px-4 text-sm text-ink"
        value={teamId}
        onChange={(event) => {
          push({ office, team: event.target.value, role, tenure });
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
          push({ office, team: teamId, role: event.target.value, tenure });
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
          push({ office, team: teamId, role, tenure: event.target.value });
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
