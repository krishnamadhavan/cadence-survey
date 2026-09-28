export const surveyCadences = ["weekly", "biweekly", "monthly"] as const;
export type SurveyCadence = (typeof surveyCadences)[number];

export function parseSurveyCadence(value: string): SurveyCadence | null {
  if (value === "weekly" || value === "biweekly" || value === "monthly") {
    return value;
  }
  return null;
}

export function addSurveyCadence(date: Date, cadence: SurveyCadence): Date {
  const next = new Date(date.getTime());
  if (cadence === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  if (cadence === "biweekly") {
    next.setUTCDate(next.getUTCDate() + 14);
    return next;
  }
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export function nextSurveyWindow(
  opensAt: Date,
  closesAt: Date,
  cadence: SurveyCadence,
  now: Date,
): { opensAt: Date; closesAt: Date } {
  let nextOpens = addSurveyCadence(opensAt, cadence);
  let nextCloses = addSurveyCadence(closesAt, cadence);
  for (let step = 0; step < 36 && nextCloses <= now; step += 1) {
    nextOpens = addSurveyCadence(nextOpens, cadence);
    nextCloses = addSurveyCadence(nextCloses, cadence);
  }
  return { opensAt: nextOpens, closesAt: nextCloses };
}
