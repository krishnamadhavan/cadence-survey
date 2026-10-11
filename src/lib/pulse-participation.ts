export type ParticipationRow = {
  teamId: string;
  teamName: string;
  name: string;
  email: string;
  answered: boolean;
  token: string | null;
};

export type ParticipationWaiting = {
  name: string;
  email: string;
  token: string | null;
};

export type ParticipationTeam = {
  teamId: string;
  teamName: string;
  responded: number;
  total: number;
  waiting: ParticipationWaiting[];
};

export type PulseParticipation = {
  issued: boolean;
  responded: number;
  total: number;
  teams: ParticipationTeam[];
};

// Teams furthest behind come first. A lower share answered wins, then the
// larger number of people still waiting, then the team name.
export function groupParticipation(rows: ParticipationRow[]): {
  responded: number;
  total: number;
  teams: ParticipationTeam[];
} {
  const teams = new Map<string, ParticipationTeam>();
  let responded = 0;

  for (const row of rows) {
    let team = teams.get(row.teamId);
    if (!team) {
      team = {
        teamId: row.teamId,
        teamName: row.teamName,
        responded: 0,
        total: 0,
        waiting: [],
      };
      teams.set(row.teamId, team);
    }
    team.total += 1;
    if (row.answered) {
      team.responded += 1;
      responded += 1;
      continue;
    }
    team.waiting.push({
      name: row.name,
      email: row.email,
      token: row.token,
    });
  }

  for (const team of teams.values()) {
    team.waiting.sort(
      (a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email),
    );
  }

  const ordered = [...teams.values()].sort((a, b) => {
    const rateA = a.total === 0 ? 1 : a.responded / a.total;
    const rateB = b.total === 0 ? 1 : b.responded / b.total;
    if (rateA !== rateB) {
      return rateA - rateB;
    }
    const waitingA = a.total - a.responded;
    const waitingB = b.total - b.responded;
    if (waitingA !== waitingB) {
      return waitingB - waitingA;
    }
    return a.teamName.localeCompare(b.teamName) || a.teamId.localeCompare(b.teamId);
  });

  return { responded, total: rows.length, teams: ordered };
}

export function completionPercent(responded: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((responded / total) * 100);
}

// Under half the team is the follow-up line. A team at exactly half is not low.
export function completionStanding(
  responded: number,
  total: number,
): "complete" | "low" | "underway" {
  if (total > 0 && responded >= total) {
    return "complete";
  }
  if (total > 0 && responded * 2 < total) {
    return "low";
  }
  return "underway";
}
