export function arrangeDashboardSurveys<T extends { status: string }>(
  oldestFirst: T[],
): { newestFirst: T[]; featured: T | null } {
  const newestFirst = [...oldestFirst].reverse();
  const featured =
    newestFirst.find((survey) => survey.status === "open") ?? null;
  return { newestFirst, featured };
}
