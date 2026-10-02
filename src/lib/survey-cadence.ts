export const surveyCadences = ["weekly", "biweekly", "monthly"] as const;
export type SurveyCadence = (typeof surveyCadences)[number];

export function parseSurveyCadence(value: string): SurveyCadence | null {
  if (value === "weekly" || value === "biweekly" || value === "monthly") {
    return value;
  }
  return null;
}

const maxCadenceSteps = 20000;

export function addSurveyCadence(date: Date, cadence: SurveyCadence, steps = 1): Date {
  const next = new Date(date.getTime());
  if (cadence === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7 * steps);
    return next;
  }
  if (cadence === "biweekly") {
    next.setUTCDate(next.getUTCDate() + 14 * steps);
    return next;
  }
  const day = date.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + steps);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

function stepsUntilFutureClose(closesAt: Date, cadence: SurveyCadence, now: Date): number | null {
  let steps = 1;
  if (closesAt <= now) {
    if (cadence === "monthly") {
      steps =
        (now.getUTCFullYear() - closesAt.getUTCFullYear()) * 12 +
        (now.getUTCMonth() - closesAt.getUTCMonth());
    } else {
      const intervalMs = (cadence === "weekly" ? 7 : 14) * 86_400_000;
      steps = Math.floor((now.getTime() - closesAt.getTime()) / intervalMs) + 1;
    }
  }
  steps = Math.max(1, steps);
  if (steps > maxCadenceSteps) return null;
  while (steps < maxCadenceSteps && addSurveyCadence(closesAt, cadence, steps) <= now) {
    steps += 1;
  }
  while (steps > 1 && addSurveyCadence(closesAt, cadence, steps - 1) > now) {
    steps -= 1;
  }
  if (addSurveyCadence(closesAt, cadence, steps) <= now) return null;
  return steps;
}

export function nextSurveyWindow(
  opensAt: Date,
  closesAt: Date,
  cadence: SurveyCadence,
  now: Date,
): { opensAt: Date; closesAt: Date } | null {
  const steps = stepsUntilFutureClose(closesAt, cadence, now);
  if (steps === null) return null;
  const nextCloses = addSurveyCadence(closesAt, cadence, steps);
  if (nextCloses <= now) return null;
  return {
    opensAt: addSurveyCadence(opensAt, cadence, steps),
    closesAt: nextCloses,
  };
}
