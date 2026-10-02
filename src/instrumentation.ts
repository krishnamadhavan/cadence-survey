export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { startSurveyScheduleTimer } = await import("@/lib/survey-schedule-timer");
  startSurveyScheduleTimer();
}
