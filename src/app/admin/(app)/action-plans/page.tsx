import { listActionPlans } from "@/db/action-plans";
import { listRecommendationSurveys } from "@/db/recommendations";
import { ActionPlansPanel } from "./action-plans-panel";

export const dynamic = "force-dynamic";

export default async function AdminActionPlansPage() {
  let plans: Awaited<ReturnType<typeof listActionPlans>> = [];
  let surveys: Awaited<ReturnType<typeof listRecommendationSurveys>> = [];
  let dbError = false;

  try {
    [plans, surveys] = await Promise.all([
      listActionPlans(),
      listRecommendationSurveys(),
    ]);
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <ActionPlansPanel plans={plans} surveys={surveys} dbError={dbError} />
    </div>
  );
}
