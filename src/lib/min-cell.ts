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
): TeamPublishPlan {
  const withData = teams.filter((team) => team.count > 0);
  const named = withData.filter((team) => team.count >= MIN_TEAM_RESPONSES);
  const suppressed = withData.filter((team) => team.count < MIN_TEAM_RESPONSES);

  let suppressedCount = suppressed.reduce((sum, team) => sum + team.count, 0);

  named.sort((a, b) => a.count - b.count || a.key.localeCompare(b.key));

  while (
    suppressedCount > 0 &&
    suppressedCount < MIN_TEAM_RESPONSES &&
    named.length > 0
  ) {
    const next = named.shift();
    if (!next) {
      break;
    }
    suppressed.push(next);
    suppressedCount += next.count;
  }

  if (suppressedCount > 0 && suppressedCount < MIN_TEAM_RESPONSES) {
    return {
      namedKeys: [],
      suppressedKeys: suppressed.map((team) => team.key),
      showSuppressedBucket: false,
    };
  }

  return {
    namedKeys: named.map((team) => team.key),
    suppressedKeys: suppressed.map((team) => team.key),
    showSuppressedBucket: suppressedCount >= MIN_TEAM_RESPONSES,
  };
}

export function teamPublishKey(teamId: string | null): string {
  return teamId ?? "unassigned";
}

export function publishedTeamName(
  key: string,
  realName: string,
  namedKeys: Set<string>,
): string {
  if (namedKeys.has(key)) {
    return realName;
  }
  return SUPPRESSED_TEAM_NAME;
}
