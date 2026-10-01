"use client";

import { useRouter } from "next/navigation";

type RoleSegmentProps = {
  token: string;
  roles: string[];
  selected: string | null;
};

export function RoleSegment({ token, roles, selected }: RoleSegmentProps) {
  const router = useRouter();
  const options =
    selected && !roles.includes(selected)
      ? [...roles, selected].sort((a, b) => a.localeCompare(b))
      : roles;

  return (
    <select
      aria-label="Role segment"
      className="h-10 rounded-full border border-ink/15 bg-white px-4 text-sm text-ink"
      value={selected ?? ""}
      onChange={(event) => {
        const role = event.target.value;
        const path = `/admin/reports/${encodeURIComponent(token)}`;
        router.push(role ? `${path}?role=${encodeURIComponent(role)}` : path);
      }}
    >
      <option value="">All roles</option>
      {options.map((role) => (
        <option key={role} value={role}>
          {role}
        </option>
      ))}
    </select>
  );
}
