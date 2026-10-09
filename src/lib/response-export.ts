import { MIN_TEAM_RESPONSES, planTeamPublish, type TeamPublishPlan } from "@/lib/min-cell";
import { sanitizeFilenameToken, sanitizeSpreadsheetValue } from "@/lib/spreadsheet";

export type ExportCell = string | number | null;

export type ExportResponse = {
  id: string;
  submittedAt: number;
  teamKey: string;
  teamName: string;
  values: ExportCell[];
};

export type ResponseExportPlan = {
  state: "empty" | "hidden" | "ready";
  rows: { teamName: string; values: ExportCell[] }[];
};

// Named teams only, after the same fold the published report uses. A team
// that was folded in to hide a smaller group is left out with that group.
export function selectResponseRows(
  responses: ExportResponse[],
  floor: number,
): ResponseExportPlan {
  if (responses.length === 0) {
    return { state: "empty", rows: [] };
  }
  const counts = new Map<string, number>();
  for (const response of responses) {
    counts.set(response.teamKey, (counts.get(response.teamKey) ?? 0) + 1);
  }
  const plan = planTeamPublish(
    [...counts.entries()].map(([key, count]) => ({ key, count })),
    floor,
  );
  return {
    state: plan.namedKeys.length === 0 ? "hidden" : "ready",
    rows: rowsForNamedTeams(responses, plan),
  };
}

function rowsForNamedTeams(responses: ExportResponse[], plan: TeamPublishPlan) {
  const named = new Set(plan.namedKeys);
  return responses
    .filter((response) => named.has(response.teamKey))
    .sort((a, b) => {
      const team = a.teamName.localeCompare(b.teamName);
      if (team !== 0) {
        return team;
      }
      if (a.submittedAt !== b.submittedAt) {
        return a.submittedAt - b.submittedAt;
      }
      return a.id.localeCompare(b.id);
    })
    .map((response) => ({ teamName: response.teamName, values: response.values }));
}

export function responseQuestionHeaders(
  questions: { prompt: string; position: number }[],
): string[] {
  const counts = new Map<string, number>();
  for (const question of questions) {
    counts.set(question.prompt, (counts.get(question.prompt) ?? 0) + 1);
  }
  return questions.map((question) =>
    (counts.get(question.prompt) ?? 0) > 1
      ? `${question.prompt} (${question.position})`
      : question.prompt,
  );
}

export function buildResponseCsv(
  questions: { prompt: string; position: number }[],
  rows: { teamName: string; values: ExportCell[] }[],
): string {
  const lines = [
    csvLine(["Team", ...responseQuestionHeaders(questions)]),
    ...rows.map((row) => csvLine([row.teamName, ...row.values])),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function responseExportFilename(token: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `${sanitizeFilenameToken(token)}-responses-${day}.csv`;
}

export function anonymityFloor(floor: number | undefined, configured: number): number {
  if (typeof floor === "number" && Number.isInteger(floor) && floor >= MIN_TEAM_RESPONSES) {
    return floor;
  }
  return Number.isInteger(configured) && configured >= MIN_TEAM_RESPONSES
    ? configured
    : MIN_TEAM_RESPONSES;
}

function csvCell(value: ExportCell | undefined): string {
  const sanitized = sanitizeSpreadsheetValue(value);
  const text = String(sanitized);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function csvLine(cells: (ExportCell | undefined)[]): string {
  return cells.map(csvCell).join(",");
}
