/** Teams smaller than this are not named on results. */
export const MIN_TEAM_RESPONSES = 3;

export const SUPPRESSED_TEAM_KEY = "__suppressed__";
export const SUPPRESSED_TEAM_NAME = "Too few to show";

export type TeamPublishPlan = {
  namedKeys: string[];
  suppressedKeys: string[];
  showSuppressedBucket: boolean;
};

/**
 * Decide which teams can be named. Groups with fewer than
 * MIN_TEAM_RESPONSES are hidden. If that leftover is still
 * smaller than the minimum, the smallest named teams are
 * folded in so a remainder of 1–2 cannot be subtracted out.
 */
export function planTeamPublish(
  teams: { key: string; count: number }[],
  minResponses: number = MIN_TEAM_RESPONSES,
): TeamPublishPlan {
  const minimum =
    Number.isInteger(minResponses) && minResponses >= MIN_TEAM_RESPONSES
      ? minResponses
      : MIN_TEAM_RESPONSES;
  const withData = teams.filter((team) => team.count > 0);
  const named = withData.filter((team) => team.count >= minimum);
  const suppressed = withData.filter((team) => team.count < minimum);

  let suppressedCount = suppressed.reduce((sum, team) => sum + team.count, 0);

  named.sort((a, b) => a.count - b.count || a.key.localeCompare(b.key));

  while (
    suppressedCount > 0 &&
    suppressedCount < minimum &&
    named.length > 0
  ) {
    const next = named.shift();
    if (!next) {
      break;
    }
    suppressed.push(next);
    suppressedCount += next.count;
  }

  if (suppressedCount > 0 && suppressedCount < minimum) {
    return {
      namedKeys: [],
      suppressedKeys: suppressed.map((team) => team.key),
      showSuppressedBucket: false,
    };
  }

  return {
    namedKeys: named.map((team) => team.key),
    suppressedKeys: suppressed.map((team) => team.key),
    showSuppressedBucket: suppressedCount >= minimum,
  };
}

export function teamPublishKey(teamId: string | null): string {
  return teamId ?? "unassigned";
}

export type RoleSegmentPlan = {
  /** The role's numbers would expose a group smaller than the floor. */
  hideSlice: boolean;
  namedKeys: string[];
  suppressedKeys: string[];
  showSuppressedBucket: boolean;
};

/**
 * Decide which teams can be named for one role.
 * The role's own count has to meet the floor, and so does everyone
 * outside that role on the same team and across the survey. A gap of
 * 1..floor-1 can be subtracted from the unfiltered report, so those
 * teams are folded like a small remainder. When folding cannot close
 * the gap, hideSlice is set and the role publishes nothing.
 */
export function planRoleSegment(
  teams: { key: string; roleCount: number; totalCount: number }[],
  minResponses: number = MIN_TEAM_RESPONSES,
): RoleSegmentPlan {
  const minimum =
    Number.isInteger(minResponses) && minResponses >= MIN_TEAM_RESPONSES
      ? minResponses
      : MIN_TEAM_RESPONSES;

  const merged = new Map<string, { roleCount: number; totalCount: number }>();
  for (const team of teams) {
    const roleCount = nonNegative(team.roleCount);
    const totalCount = nonNegative(team.totalCount);
    const current = merged.get(team.key) ?? { roleCount: 0, totalCount: 0 };
    current.roleCount += roleCount;
    current.totalCount += totalCount;
    merged.set(team.key, current);
  }

  const withRole: RoleTeam[] = [];
  let surveyComplement = 0;
  for (const [key, counts] of merged) {
    const totalCount = Math.max(counts.totalCount, counts.roleCount);
    const complement = totalCount - counts.roleCount;
    surveyComplement += complement;
    if (counts.roleCount > 0) {
      withRole.push({ key, roleCount: counts.roleCount, complement });
    }
  }

  if (complementIsSmall(surveyComplement, minimum)) {
    return {
      hideSlice: true,
      namedKeys: [],
      suppressedKeys: [],
      showSuppressedBucket: false,
    };
  }

  const named: RoleTeam[] = [];
  const suppressed: RoleTeam[] = [];
  for (const team of withRole) {
    if (
      team.roleCount >= minimum &&
      !complementIsSmall(team.complement, minimum)
    ) {
      named.push(team);
    } else {
      suppressed.push(team);
    }
  }

  let suppressedCount = suppressed.reduce((sum, team) => sum + team.roleCount, 0);
  let suppressedComplement = suppressed.reduce(
    (sum, team) => sum + team.complement,
    0,
  );

  named.sort((a, b) => a.roleCount - b.roleCount || a.key.localeCompare(b.key));

  while (
    named.length > 0 &&
    ((suppressedCount > 0 && suppressedCount < minimum) ||
      complementIsSmall(suppressedComplement, minimum))
  ) {
    const next = named.shift();
    if (!next) {
      break;
    }
    suppressed.push(next);
    suppressedCount += next.roleCount;
    suppressedComplement += next.complement;
  }

  if (complementIsSmall(suppressedComplement, minimum)) {
    return {
      hideSlice: true,
      namedKeys: [],
      suppressedKeys: suppressed.map((team) => team.key),
      showSuppressedBucket: false,
    };
  }

  if (suppressedCount > 0 && suppressedCount < minimum) {
    return {
      hideSlice: false,
      namedKeys: [],
      suppressedKeys: suppressed.map((team) => team.key),
      showSuppressedBucket: false,
    };
  }

  return {
    hideSlice: false,
    namedKeys: named.map((team) => team.key),
    suppressedKeys: suppressed.map((team) => team.key),
    showSuppressedBucket: suppressedCount >= minimum,
  };
}

type SliceTeam = {
  key: string;
  sliceCount: number;
  parents: number[];
};

/**
 * Decide which teams can be named for one combined slice.
 * surveyParents are the coarser filters an admin can also open, including
 * the unfiltered report. parents on each team are those filters counted on
 * that team only. A complement of 1..floor-1 can be subtracted from a
 * coarser report, so that cell is folded. When folding cannot close the
 * gap, hideSlice is set and the slice publishes nothing.
 */
export function planCombinedSegment(
  teams: SliceTeam[],
  surveyParents: number[],
  sliceTotal: number,
  minResponses: number = MIN_TEAM_RESPONSES,
): RoleSegmentPlan {
  const minimum =
    Number.isInteger(minResponses) && minResponses >= MIN_TEAM_RESPONSES
      ? minResponses
      : MIN_TEAM_RESPONSES;
  const total = nonNegative(sliceTotal);
  const surveyComplements = surveyParents.map(
    (parent) => Math.max(nonNegative(parent), total) - total,
  );
  if (surveyComplements.some((complement) => complementIsSmall(complement, minimum))) {
    return {
      hideSlice: true,
      namedKeys: [],
      suppressedKeys: [],
      showSuppressedBucket: false,
    };
  }

  const merged = new Map<string, { sliceCount: number; parents: number[] }>();
  for (const team of teams) {
    const sliceCount = nonNegative(team.sliceCount);
    const parents = team.parents.map((parent) => nonNegative(parent));
    const current = merged.get(team.key);
    if (!current) {
      merged.set(team.key, { sliceCount, parents });
      continue;
    }
    current.sliceCount += sliceCount;
    const width = Math.max(current.parents.length, parents.length);
    const nextParents: number[] = [];
    for (let index = 0; index < width; index += 1) {
      nextParents.push(Math.max(current.parents[index] ?? 0, parents[index] ?? 0));
    }
    current.parents = nextParents;
  }

  const named: WorkingSlice[] = [];
  const suppressed: WorkingSlice[] = [];
  for (const [key, counts] of merged) {
    if (counts.sliceCount <= 0) {
      continue;
    }
    const complements = counts.parents.map(
      (parent) => Math.max(parent, counts.sliceCount) - counts.sliceCount,
    );
    const team = { key, sliceCount: counts.sliceCount, complements };
    if (
      counts.sliceCount >= minimum &&
      !complements.some((complement) => complementIsSmall(complement, minimum))
    ) {
      named.push(team);
    } else {
      suppressed.push(team);
    }
  }

  named.sort((a, b) => a.sliceCount - b.sliceCount || a.key.localeCompare(b.key));

  let suppressedCount = suppressed.reduce((sum, team) => sum + team.sliceCount, 0);
  while (
    named.length > 0 &&
    ((suppressedCount > 0 && suppressedCount < minimum) ||
      summedComplements(suppressed).some((complement) =>
        complementIsSmall(complement, minimum),
      ))
  ) {
    const next = named.shift();
    if (!next) {
      break;
    }
    suppressed.push(next);
    suppressedCount += next.sliceCount;
  }

  if (
    summedComplements(suppressed).some((complement) =>
      complementIsSmall(complement, minimum),
    )
  ) {
    return {
      hideSlice: true,
      namedKeys: [],
      suppressedKeys: suppressed.map((team) => team.key),
      showSuppressedBucket: false,
    };
  }

  if (suppressedCount > 0 && suppressedCount < minimum) {
    return {
      hideSlice: false,
      namedKeys: [],
      suppressedKeys: suppressed.map((team) => team.key),
      showSuppressedBucket: false,
    };
  }

  return {
    hideSlice: false,
    namedKeys: named.map((team) => team.key),
    suppressedKeys: suppressed.map((team) => team.key),
    showSuppressedBucket: suppressedCount >= minimum,
  };
}

type WorkingSlice = {
  key: string;
  sliceCount: number;
  complements: number[];
};

function summedComplements(teams: WorkingSlice[]): number[] {
  const width = teams.reduce((max, team) => Math.max(max, team.complements.length), 0);
  const sums = Array.from({ length: width }, () => 0);
  for (const team of teams) {
    for (let index = 0; index < width; index += 1) {
      sums[index] += team.complements[index] ?? 0;
    }
  }
  return sums;
}

type RoleTeam = {
  key: string;
  roleCount: number;
  complement: number;
};

function nonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}

/** A complement of 0 is safe. 1..floor-1 can be recovered by subtraction. */
function complementIsSmall(complement: number, minimum: number): boolean {
  return complement > 0 && complement < minimum;
}
