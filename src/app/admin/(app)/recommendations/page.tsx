import {
  listRecommendationSurveys,
  listRecommendations,
} from "@/db/recommendations";
import { RecommendationsPanel } from "./recommendations-panel";

export const dynamic = "force-dynamic";

export default async function AdminRecommendationsPage() {
  let recommendations: Awaited<ReturnType<typeof listRecommendations>> = [];
  let surveys: Awaited<ReturnType<typeof listRecommendationSurveys>> = [];
  let dbError = false;

  try {
    [recommendations, surveys] = await Promise.all([
      listRecommendations(),
      listRecommendationSurveys(),
    ]);
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <RecommendationsPanel
        recommendations={recommendations}
        surveys={surveys}
        dbError={dbError}
      />
    </div>
  );
}
