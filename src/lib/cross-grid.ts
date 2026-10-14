import { tenureBandLabel, type TenureBand } from "@/lib/employee-attributes";
import { MIN_TEAM_RESPONSES, teamPublishKey } from "@/lib/min-cell";

export const CROSS_AXES = ["office", "team", "role", "tenure"] as const;

export type CrossAxis = (typeof CROSS_AXES)[number];

export const NO_ROLE_KEY = "__no_role__";
export const NO_TENURE_KEY = "__no_tenure__";
export const NO_OFFICE_KEY = "__no_office__";

const PARTNER_ORDER: CrossAxis[] = ["role", "tenure", "team", "office"];
const PREFERRED_PAIRS: [CrossAxis, CrossAxis][] = [
  ["tenure", "role"],
  ["tenure", "team"],
  ["role", "team"],
  ["tenure", "office"],
  ["role", "office"],
  ["team", "office"],
];
const TENURE_ORDER = ["lt_1", "y1_3", "gte_3", NO_TENURE_KEY];

export type CrossPins = Record<CrossAxis, boolean>;

export type CrossCellCount = {
  rowKey: string;
  colKey: string;
  count: number;
};

export type CrossCellComplement = {
  rowKey: string;
  colKey: string;
  complement: number;
};

type SliceFilter = {
  teamId: string | null;
  role: string | null;
  tenure: TenureBand | null;
  office: string | null;
};

/**
 * Proper subsets of the active filters, including the unfiltered report.
 * The full slice is left out. Order matches the coarser parents used when
 * a filtered report decides which teams can be named.
 */
export function coarserCrossFilters(slice: SliceFilter): SliceFilter[] {
  const dims: Array<"team" | "role" | "tenure" | "office"> = [];
  if (slice.teamId) {
    dims.push("team");
  }
  if (slice.role) {
    dims.push("role");
  }
  if (slice.tenure) {
    dims.push("tenure");
  }
  if (slice.office) {
    dims.push("office");
  }
  const filters: SliceFilter[] = [];
  const full = (1 << dims.length) - 1;
  for (let mask = 0; mask < full; mask += 1) {
    const filter: SliceFilter = {
      teamId: null,
      role: null,
      tenure: null,
      office: null,
    };
    dims.forEach((dim, index) => {
      if ((mask & (1 << index)) === 0) {
        return;
      }
      if (dim === "team") {
        filter.teamId = slice.teamId;
      }
      if (dim === "role") {
        filter.role = slice.role;
      }
      if (dim === "tenure") {
        filter.tenure = slice.tenure;
      }
      if (dim === "office") {
        filter.office = slice.office;
      }
    });
    filters.push(filter);
  }
  return filters;
}

export function parseCrossAxis(raw: string | null | undefined): CrossAxis | null {
  if (raw === "office" || raw === "team" || raw === "role" || raw === "tenure") {
    return raw;
  }
  return null;
}

export function crossAxisLabel(axis: CrossAxis): string {
  switch (axis) {
    case "office":
      return "Office";
    case "team":
      return "Team";
    case "role":
      return "Role";
    case "tenure":
      return "Tenure";
  }
}

export function crossAxisNoun(axis: CrossAxis): string {
  switch (axis) {
    case "office":
      return "office";
    case "team":
      return "team";
    case "role":
      return "role";
    case "tenure":
      return "tenure band";
  }
}

export function pinnedCrossAxes(slice: SliceFilter): CrossPins {
  return {
    office: slice.office !== null,
    team: slice.teamId !== null,
    role: slice.role !== null,
    tenure: slice.tenure !== null,
  };
}

/**
 * Tenure by role, unless the URL asks for another free pair. A dimension
 * already pinned by the report filter is not an axis. Null when fewer than
 * two dimensions are still free.
 */
export function chooseCrossAxes(
  input: { rows?: string | null; cols?: string | null },
  pinned: CrossPins,
): { rows: CrossAxis; cols: CrossAxis } | null {
  const free = new Set(CROSS_AXES.filter((axis) => !pinned[axis]));
  const rows = parseCrossAxis(input.rows);
  const cols = parseCrossAxis(input.cols);
  if (rows && cols && rows !== cols && free.has(rows) && free.has(cols)) {
    return { rows, cols };
  }
  if (rows && free.has(rows)) {
    const partner = PARTNER_ORDER.find((axis) => axis !== rows && free.has(axis));
    if (partner) {
      return { rows, cols: partner };
    }
  }
  for (const [row, col] of PREFERRED_PAIRS) {
    if (free.has(row) && free.has(col)) {
      return { rows: row, cols: col };
    }
  }
  return null;
}

export function crossValueKey(
  axis: CrossAxis,
  value: {
    teamId: string | null;
    role: string | null;
    tenure: TenureBand | null;
    office: string | null;
  },
): string {
  switch (axis) {
    case "team":
      return teamPublishKey(value.teamId);
    case "role":
      return value.role ?? NO_ROLE_KEY;
    case "tenure":
      return value.tenure ?? NO_TENURE_KEY;
    case "office":
      return value.office ? value.office : NO_OFFICE_KEY;
  }
}

export function crossValueLabel(
  axis: CrossAxis,
  key: string,
  teamNames: Map<string, string>,
): string {
  switch (axis) {
    case "team":
      if (key === "unassigned") {
        return "Unassigned";
      }
      return teamNames.get(key) ?? "Unassigned";
    case "role":
      return key === NO_ROLE_KEY ? "No role" : key;
    case "tenure":
      if (key === NO_TENURE_KEY) {
        return "No tenure";
      }
      return tenureBandLabel(key as TenureBand) || key;
    case "office":
      return key === NO_OFFICE_KEY ? "No office" : key;
  }
}

export function compareCrossKeys(
  axis: CrossAxis,
  a: string,
  b: string,
  labelOf: (key: string) => string,
): number {
  if (axis === "tenure") {
    const aIndex = TENURE_ORDER.indexOf(a);
    const bIndex = TENURE_ORDER.indexOf(b);
    return (aIndex === -1 ? TENURE_ORDER.length : aIndex) -
      (bIndex === -1 ? TENURE_ORDER.length : bIndex);
  }
  const blank = blankKey(axis);
  if (a === blank) {
    return 1;
  }
  if (b === blank) {
    return -1;
  }
  return labelOf(a).localeCompare(labelOf(b));
}

/**
 * Which pockets can show a score. A pocket under the floor stays hidden.
 * So does a pocket that would leave 1..floor-1 people recoverable by
 * subtracting published cells from a row, a column, the table, or a
 * coarser report. A pocket whose own gap is already too small is folded
 * before a neighbour, so the neighbour can stay once that gap is inside
 * a large enough remainder. parents are per-cell complements against
 * each coarser filter: people in that pocket but outside this slice.
 */
export function planCrossGrid(
  cells: CrossCellCount[],
  minResponses: number = MIN_TEAM_RESPONSES,
  parents: CrossCellComplement[][] = [],
): { rowKey: string; colKey: string }[] {
  const minimum =
    Number.isInteger(minResponses) && minResponses >= MIN_TEAM_RESPONSES
      ? minResponses
      : MIN_TEAM_RESPONSES;

  const slice = new Map<string, { rowKey: string; colKey: string; count: number }>();
  for (const cell of cells) {
    const count = nonNegative(cell.count);
    if (count <= 0) {
      continue;
    }
    const id = cellId(cell.rowKey, cell.colKey);
    const current = slice.get(id);
    if (current) {
      current.count += count;
    } else {
      slice.set(id, { rowKey: cell.rowKey, colKey: cell.colKey, count });
    }
  }

  const published = new Set<string>();
  for (const [id, cell] of slice) {
    if (cell.count >= minimum) {
      published.add(id);
    }
  }

  const parentMaps: Map<string, number>[] = [new Map()];
  const extra = new Map<string, { rowKey: string; colKey: string }>();
  for (const parent of parents) {
    const complements = new Map<string, number>();
    for (const cell of parent) {
      const complement = nonNegative(cell.complement);
      if (complement <= 0) {
        continue;
      }
      const id = cellId(cell.rowKey, cell.colKey);
      complements.set(id, (complements.get(id) ?? 0) + complement);
      if (!slice.has(id)) {
        extra.set(id, { rowKey: cell.rowKey, colKey: cell.colKey });
      }
    }
    let total = 0;
    for (const complement of complements.values()) {
      total += complement;
    }
    if (total > 0 && total < minimum) {
      return [];
    }
    if (total > 0) {
      parentMaps.push(complements);
    }
  }

  const rowGroups = new Map<string, string[]>();
  const colGroups = new Map<string, string[]>();
  const allIds: string[] = [];
  const seen = new Set<string>();
  for (const [id, cell] of [...slice, ...extra]) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    allIds.push(id);
    pushGroup(rowGroups, cell.rowKey, id);
    pushGroup(colGroups, cell.colKey, id);
  }
  const groups: string[][] = [
    allIds,
    ...rowGroups.values(),
    ...colGroups.values(),
    ...allIds.map((id) => [id]),
  ];

  while (published.size > 0) {
    const unsafe = new Set<string>();
    for (const complements of parentMaps) {
      for (const ids of groups) {
        const shown: string[] = [];
        let hidden = 0;
        let complement = 0;
        for (const id of ids) {
          complement += complements.get(id) ?? 0;
          if (published.has(id)) {
            shown.push(id);
          } else {
            hidden += slice.get(id)?.count ?? 0;
          }
        }
        if (shown.length === 0) {
          continue;
        }
        const diff = hidden + complement;
        if (diff > 0 && diff < minimum) {
          for (const id of shown) {
            unsafe.add(id);
          }
        }
      }
    }
    if (unsafe.size === 0) {
      break;
    }
    const victim = [...unsafe].sort((a, b) => {
      const aOwn = ownGapIsSmall(a, parentMaps, minimum) ? 0 : 1;
      const bOwn = ownGapIsSmall(b, parentMaps, minimum) ? 0 : 1;
      if (aOwn !== bOwn) {
        return aOwn - bOwn;
      }
      const left = slice.get(a);
      const right = slice.get(b);
      const byCount = (left?.count ?? 0) - (right?.count ?? 0);
      if (byCount !== 0) {
        return byCount;
      }
      const byRow = (left?.rowKey ?? "").localeCompare(right?.rowKey ?? "");
      if (byRow !== 0) {
        return byRow;
      }
      return (left?.colKey ?? "").localeCompare(right?.colKey ?? "");
    })[0];
    if (!victim || !published.delete(victim)) {
      break;
    }
  }

  const named: { rowKey: string; colKey: string }[] = [];
  for (const id of published) {
    const cell = slice.get(id);
    if (cell) {
      named.push({ rowKey: cell.rowKey, colKey: cell.colKey });
    }
  }
  named.sort(
    (a, b) => a.rowKey.localeCompare(b.rowKey) || a.colKey.localeCompare(b.colKey),
  );
  return named;
}

function ownGapIsSmall(
  id: string,
  parentMaps: Map<string, number>[],
  minimum: number,
): boolean {
  for (const complements of parentMaps) {
    const complement = complements.get(id) ?? 0;
    if (complement > 0 && complement < minimum) {
      return true;
    }
  }
  return false;
}

function blankKey(axis: CrossAxis): string {
  switch (axis) {
    case "team":
      return "unassigned";
    case "role":
      return NO_ROLE_KEY;
    case "tenure":
      return NO_TENURE_KEY;
    case "office":
      return NO_OFFICE_KEY;
  }
}

function cellId(rowKey: string, colKey: string): string {
  return `${rowKey.length}:${rowKey}\0${colKey}`;
}

function pushGroup(groups: Map<string, string[]>, key: string, id: string) {
  const list = groups.get(key) ?? [];
  list.push(id);
  groups.set(key, list);
}

function nonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}
