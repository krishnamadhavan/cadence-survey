import { applyDueSurveySchedules } from "@/db/surveys";

const TIMER_KEY = Symbol.for("cadence.surveyScheduleTimer");

type TimerGlobal = typeof globalThis & {
  [TIMER_KEY]?: boolean;
};

const MINUTE_MS = 60_000;

export function startSurveyScheduleTimer(
  tick: () => Promise<void> = () => applyDueSurveySchedules(),
  intervalMs = MINUTE_MS,
): ReturnType<typeof setInterval> | null {
  const scope = globalThis as TimerGlobal;
  if (scope[TIMER_KEY]) {
    return null;
  }
  scope[TIMER_KEY] = true;
  console.info("Survey schedule timer started");

  const run = () => {
    void tick().catch((error: unknown) => {
      console.error("Survey schedule tick failed", error);
    });
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

export function resetSurveyScheduleTimerForTests() {
  delete (globalThis as TimerGlobal)[TIMER_KEY];
}
