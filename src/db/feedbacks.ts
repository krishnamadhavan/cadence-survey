import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import type { SurveyStatus } from "@/db/schema";
import { isPublishedComment, type CommentDraft } from "@/lib/comments";
import { getAnonymityFloor } from "@/db/settings";
import { planTeamPublish, teamPublishKey } from "@/lib/min-cell";

export type FeedbackSurveyOption = {
  token: string;
  title: string;
  status: SurveyStatus;
};

export type PublishedFeedback = {
  id: string;
  surveyToken: string;
  surveyTitle: string;
  question: string;
  teamName: string;
  text: string;
  submittedAt: string;
};

export async function listFeedbackSurveys(): Promise<FeedbackSurveyOption[]> {
  const rows = await db
    .select({
      token: surveys.publicToken,
      title: surveys.title,
      status: surveys.status,
    })
    .from(surveys)
    .where(inArray(surveys.status, ["open", "closed"]))
    .orderBy(asc(surveys.title), asc(surveys.publicToken));
  return rows;
}

export async function listPublishedFeedback(): Promise<PublishedFeedback[]> {
  const surveyRows = await listFeedbackSurveys();
  if (surveyRows.length === 0) {
    return [];
  }

  const tokens = surveyRows.map((survey) => survey.token);
  const rows = await db
    .select({
      surveyToken: surveys.publicToken,
      responseId: responses.id,
      submittedAt: responses.submittedAt,
      teamId: teams.id,
      teamName: teams.name,
      answerId: answers.id,
      questionType: questions.type,
      prompt: questions.prompt,
      value: answers.value,
    })
    .from(surveys)
    .innerJoin(responses, eq(responses.surveyId, surveys.id))
    .leftJoin(teams, eq(responses.teamId, teams.id))
    .leftJoin(answers, eq(answers.responseId, responses.id))
    .leftJoin(questions, eq(answers.questionId, questions.id))
    .where(inArray(surveys.publicToken, tokens));

  const bySurvey = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = bySurvey.get(row.surveyToken) ?? [];
    list.push(row);
    bySurvey.set(row.surveyToken, list);
  }

  const published: PublishedFeedback[] = [];
  const anonymityFloor = await getAnonymityFloor();
  for (const survey of surveyRows) {
    const surveyRowsForPlan = bySurvey.get(survey.token) ?? [];
    const teamResponseIds = new Map<string, Set<string>>();
    for (const row of surveyRowsForPlan) {
      const key = teamPublishKey(row.teamId);
      const set = teamResponseIds.get(key) ?? new Set<string>();
      set.add(row.responseId);
      teamResponseIds.set(key, set);
    }
    const plan = planTeamPublish(
      [...teamResponseIds.entries()].map(([key, ids]) => ({
        key,
        count: ids.size,
      })),
      anonymityFloor,
    );

    for (const row of surveyRowsForPlan) {
      if (row.questionType !== "text" || !row.answerId) {
        continue;
      }
      const draft: CommentDraft = {
        question: row.prompt ?? "",
        teamKey: teamPublishKey(row.teamId),
        teamName: row.teamName ?? "Unassigned",
        text: stringValue(row.value?.value),
      };
      if (!isPublishedComment(draft, plan)) {
        continue;
      }
      published.push({
        id: row.answerId,
        surveyToken: survey.token,
        surveyTitle: survey.title,
        question: draft.question,
        teamName: draft.teamName,
        text: draft.text.trim(),
        submittedAt: row.submittedAt.toISOString(),
      });
    }
  }

  published.sort(
    (left, right) =>
      new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime(),
  );
  return published;
}

function stringValue(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "number") {
    return String(raw);
  }
  return "";
}
