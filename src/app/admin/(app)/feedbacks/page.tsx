import { listFeedbackSurveys, listPublishedFeedback } from "@/db/feedbacks";
import { FeedbacksPanel } from "./feedbacks-panel";

export const dynamic = "force-dynamic";

export default async function AdminFeedbacksPage() {
  let feedback: Awaited<ReturnType<typeof listPublishedFeedback>> = [];
  let surveys: Awaited<ReturnType<typeof listFeedbackSurveys>> = [];
  let dbError = false;

  try {
    [feedback, surveys] = await Promise.all([
      listPublishedFeedback(),
      listFeedbackSurveys(),
    ]);
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <FeedbacksPanel feedback={feedback} surveys={surveys} dbError={dbError} />
    </div>
  );
}
