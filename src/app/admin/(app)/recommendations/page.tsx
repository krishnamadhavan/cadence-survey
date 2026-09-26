import { listOpenPlanKeys } from "@/db/action-plans";
import {
  listRecommendationSurveys,
  listRecommendations,
} from "@/db/recommendations";
import { RecommendationsPanel } from "./recommendations-panel";

export const dynamic = "force-dynamic";

export default async function AdminRecommendationsPage() {
  let recommendations: Awaited<ReturnType<typeof listRecommendations>> = [];
  let surveys: Awaited<ReturnType<typeof listRecommendationSurveys>> = [];
  let openPlanKeys: string[] = [];
  let dbError = false;

  try {
    [recommendations, surveys, openPlanKeys] = await Promise.all([
      listRecommendations(),
      listRecommendationSurveys(),
      listOpenPlanKeys(),
    ]);
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <RecommendationsPanel
        recommendations={recommendations}
        surveys={surveys}
        openPlanKeys={openPlanKeys}
        dbError={dbError}
      />
    </div>
  );
}
