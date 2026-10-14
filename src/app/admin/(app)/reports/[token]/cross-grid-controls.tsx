"use client";

import { useRouter } from "next/navigation";
import type { CrossAxis } from "@/lib/cross-grid";

type CrossGridControlsProps = {
  token: string;
  office: string;
  teamId: string;
  role: string;
  tenure: string;
  rows: CrossAxis;
  cols: CrossAxis;
  axes: { value: CrossAxis; label: string }[];
};

export function CrossGridControls({
  token,
  office,
  teamId,
  role,
  tenure,
  rows,
  cols,
  axes,
}: CrossGridControlsProps) {
  const router = useRouter();

  function push(nextRows: string, nextCols: string) {
    const params = new URLSearchParams();
    if (office) {
      params.set("office", office);
    }
    if (teamId) {
      params.set("team", teamId);
    }
    if (role) {
      params.set("role", role);
    }
    if (tenure) {
      params.set("tenure", tenure);
    }
    if (nextRows) {
      params.set("rows", nextRows);
    }
    if (nextCols) {
      params.set("cols", nextCols);
    }
    const query = params.toString();
    const path = `/admin/reports/${encodeURIComponent(token)}`;
    router.push(query ? `${path}?${query}` : path);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <label className="flex items-center gap-2 text-xs text-ink/50">
        Rows
        <select
          aria-label="Cross breakdown rows"
          className="h-10 rounded-full border border-ink/15 bg-white px-4 text-sm text-ink"
          value={rows}
          onChange={(event) => {
            const next = event.target.value;
            if (next === cols) {
              push(cols, rows);
              return;
            }
            push(next, cols);
          }}
        >
          {axes.map((axis) => (
            <option key={axis.value} value={axis.value}>
              {axis.label}
            </option>
          ))}
        </select>
      </label>
      <span className="text-xs text-ink/40">by</span>
      <label className="flex items-center gap-2 text-xs text-ink/50">
        Columns
        <select
          aria-label="Cross breakdown columns"
          className="h-10 rounded-full border border-ink/15 bg-white px-4 text-sm text-ink"
          value={cols}
          onChange={(event) => {
            const next = event.target.value;
            if (next === rows) {
              push(cols, rows);
              return;
            }
            push(rows, next);
          }}
        >
          {axes.map((axis) => (
            <option key={axis.value} value={axis.value}>
              {axis.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
