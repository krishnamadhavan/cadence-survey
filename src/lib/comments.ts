import type { TeamPublishPlan } from "@/lib/min-cell";

export type WrittenComment = {
  question: string;
  teamName: string;
  text: string;
};

export type CommentDraft = {
  question: string;
  teamKey: string;
  teamName: string;
  text: string;
};

/**
 * Comments are export-only. Named teams keep their label.
 * Suppressed teams are omitted so a leftover of 1–2 cannot be read.
 * When the plan cannot publish a bucket at all, nothing is exported.
 */
export function isPublishedComment(
  draft: CommentDraft,
  plan: TeamPublishPlan,
): boolean {
  if (plan.namedKeys.length === 0 || !draft.text.trim()) {
    return false;
  }
  return plan.namedKeys.includes(draft.teamKey);
}

export function collectPublishedComments(
  drafts: CommentDraft[],
  plan: TeamPublishPlan,
): WrittenComment[] {
  const comments: WrittenComment[] = [];
  for (const draft of drafts) {
    if (!isPublishedComment(draft, plan)) {
      continue;
    }
    comments.push({
      question: draft.question,
      teamName: draft.teamName,
      text: draft.text.trim(),
    });
  }
  return comments;
}
