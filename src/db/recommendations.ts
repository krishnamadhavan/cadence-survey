import { asc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { surveys } from "@/db/schema";
import type { SurveyStatus } from "@/db/schema";
import { SUPPRESSED_TEAM_NAME, getSurveyResults } from "@/db/results";
import type { TeamHealth } from "@/db/results";
import { followUpFor } from "@/lib/recommendations";

export type RecommendationSurveyOption = {
  token: string;
  title: string;
  status: SurveyStatus;
};

export type Recommendation = {
  id: string;
  surveyToken: string;
  surveyTitle: string;
  teamId: string | null;
  teamName: string;
  averageScore: number;
  health: Exclude<TeamHealth, "ok">;
  followUp: string;
};

export async function listRecommendationSurveys(): Promise<
  RecommendationSurveyOption[]
> {
  return db
    .select({
      token: surveys.publicToken,
      title: surveys.title,
      status: surveys.status,
    })
    .from(surveys)
    .where(inArray(surveys.status, ["open", "closed"]))
    .orderBy(asc(surveys.title), asc(surveys.publicToken));
}

export async function listRecommendations(): Promise<Recommendation[]> {
  const surveyRows = await listRecommendationSurveys();
  const items: Recommendation[] = [];

  for (const survey of surveyRows) {
    const results = await getSurveyResults(survey.token);
    if (!results) {
      continue;
    }
    for (const team of results.teams) {
      if (team.teamName === SUPPRESSED_TEAM_NAME || team.averageScore === null) {
        continue;
      }
      const followUp = followUpFor(team.health);
      if (!followUp || (team.health !== "low" && team.health !== "watch")) {
        continue;
      }
      items.push({
        id: `${survey.token}:${team.teamId ?? "unassigned"}`,
        surveyToken: survey.token,
        surveyTitle: survey.title,
        teamId: team.teamId,
        teamName: team.teamName,
        averageScore: team.averageScore,
        health: team.health,
        followUp,
      });
    }
  }

  items.sort((left, right) => {
    if (left.health !== right.health) {
      return left.health === "low" ? -1 : 1;
    }
    if (left.averageScore !== right.averageScore) {
      return left.averageScore - right.averageScore;
    }
    return left.surveyTitle.localeCompare(right.surveyTitle) ||
      left.teamName.localeCompare(right.teamName);
  });
  return items;
}
