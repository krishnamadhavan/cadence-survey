import type { SurveyStatus } from "@/db/schema";

export function formatSurveyStatus(status: SurveyStatus): string {
  if (status === "open") {
    return "Live";
  }
  if (status === "closed") {
    return "Closed";
  }
  return "Draft";
}

export function allowedSurveyTransitions(
  current: SurveyStatus,
  questionCount: number,
): SurveyStatus[] {
  if (current === "draft") {
    return questionCount > 0 ? ["open"] : [];
  }
  if (current === "open") {
    return ["closed"];
  }
  return ["open"];
}

export function surveyTransitionError(
  current: SurveyStatus,
  next: SurveyStatus,
  questionCount: number,
): string | null {
  if (current === next) {
    return `That pulse is already ${formatSurveyStatus(next).toLowerCase()}.`;
  }
  if (allowedSurveyTransitions(current, questionCount).includes(next)) {
    return null;
  }
  if (next === "open" && current === "draft" && questionCount === 0) {
    return "Add a question before opening this pulse.";
  }
  if (next === "closed" && current === "draft") {
    return "Open the pulse before closing it.";
  }
  if (next === "draft") {
    return "Pulses cannot go back to draft.";
  }
  return "That status change is not allowed.";
}
