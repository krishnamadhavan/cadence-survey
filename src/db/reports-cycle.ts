import type { SurveyStatus } from "@/db/schema";

export function isReportCycle(status: SurveyStatus) {
  return status === "open" || status === "closed";
}

export function pickPreviousCycle<
  T extends { publicToken: string; status: SurveyStatus },
>(newestFirst: T[], selectedToken: string): { cycles: T[]; previous: T | null } {
  const cycles = newestFirst.filter((survey) => isReportCycle(survey.status));
  const index = cycles.findIndex((survey) => survey.publicToken === selectedToken);
  return {
    cycles,
    previous: index >= 0 ? (cycles[index + 1] ?? null) : null,
  };
}
