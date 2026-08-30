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
export function collectPublishedComments(
  drafts: CommentDraft[],
  plan: TeamPublishPlan,
): WrittenComment[] {
  if (!plan.showSuppressedBucket) {
    return [];
  }

  const named = new Set(plan.namedKeys);
  const comments: WrittenComment[] = [];

  for (const draft of drafts) {
    const text = draft.text.trim();
    if (!text || !named.has(draft.teamKey)) {
      continue;
    }
    comments.push({
      question: draft.question,
      teamName: draft.teamName,
      text,
    });
  }

  return comments;
}
