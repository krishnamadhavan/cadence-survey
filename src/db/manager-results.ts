import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { getAnonymityFloor } from "@/db/settings";
import {
  answers,
  questions,
  responses,
  surveys,
  teams,
  type QuestionOptions,
  type SurveyStatus,
} from "@/db/schema";

const LOW_THRESHOLD = 3;
const WATCH_THRESHOLD = 3.5;

export type ManagerPulseHealth = "ok" | "watch" | "low";

export type ManagerPulseQuestion = {
  id: string;
  prompt: string;
  position: number;
  scale: {
    min: number;
    max: number;
    average: number | null;
    count: number;
  } | null;
  choice: {
    count: number;
    options: { label: string; count: number }[];
  } | null;
  text: { count: number } | null;
};

export type ManagerPulseComment = {
  questionId: string;
  question: string;
  text: string;
};

export type ManagerTeamPulse = {
  teamId: string;
  teamName: string;
  responseCount: number;
  published: boolean;
  averageScore: number | null;
  health: ManagerPulseHealth;
  questions: ManagerPulseQuestion[];
  comments: ManagerPulseComment[];
};

export type ManagerPulseResults = {
  anonymityFloor: number;
  survey: {
    id: string;
    title: string;
    status: Exclude<SurveyStatus, "draft">;
  } | null;
  teams: ManagerTeamPulse[];
};

type AnswerRow = {
  responseId: string;
  submittedAt: Date | string | null;
  teamId: string | null;
  questionId: string | null;
  questionType: string | null;
  value: { value: string | number } | null;
};

export async function getManagerPulseResults(
  teamIds: string[],
): Promise<ManagerPulseResults> {
  const anonymityFloor = await getAnonymityFloor();
  const orderedIds = [...new Set(teamIds)];
  const [survey] = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      status: surveys.status,
    })
    .from(surveys)
    .where(inArray(surveys.status, ["open", "closed"]))
    .orderBy(desc(surveys.createdAt), desc(surveys.id))
    .limit(1);

  if (!survey || (survey.status !== "open" && survey.status !== "closed")) {
    return { anonymityFloor, survey: null, teams: [] };
  }

  if (orderedIds.length === 0) {
    return {
      anonymityFloor,
      survey: { id: survey.id, title: survey.title, status: survey.status },
      teams: [],
    };
  }

  const [surveyQuestions, teamRows, answerRows] = await Promise.all([
    db
      .select({
        id: questions.id,
        prompt: questions.prompt,
        type: questions.type,
        options: questions.options,
        position: questions.position,
      })
      .from(questions)
      .where(eq(questions.surveyId, survey.id))
      .orderBy(questions.position),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(inArray(teams.id, orderedIds)),
    db
      .select({
        responseId: responses.id,
        submittedAt: responses.submittedAt,
        teamId: responses.teamId,
        questionId: questions.id,
        questionType: questions.type,
        value: answers.value,
      })
      .from(responses)
      .leftJoin(answers, eq(answers.responseId, responses.id))
      .leftJoin(questions, eq(answers.questionId, questions.id))
      .where(
        and(eq(responses.surveyId, survey.id), inArray(responses.teamId, orderedIds)),
      ),
  ]);

  const names = new Map(teamRows.map((team) => [team.id, team.name]));
  const byTeam = new Map<string, AnswerRow[]>();
  for (const row of answerRows) {
    if (!row.teamId) {
      continue;
    }
    const list = byTeam.get(row.teamId) ?? [];
    list.push(row);
    byTeam.set(row.teamId, list);
  }

  return {
    anonymityFloor,
    survey: { id: survey.id, title: survey.title, status: survey.status },
    teams: orderedIds.flatMap((teamId) => {
      const teamName = names.get(teamId);
      if (!teamName) {
        return [];
      }
      return [
        teamPulse(
          teamId,
          teamName,
          byTeam.get(teamId) ?? [],
          surveyQuestions,
          anonymityFloor,
        ),
      ];
    }),
  };
}

function teamPulse(
  teamId: string,
  teamName: string,
  rows: AnswerRow[],
  surveyQuestions: {
    id: string;
    prompt: string;
    type: string;
    options: QuestionOptions;
    position: number;
  }[],
  anonymityFloor: number,
): ManagerTeamPulse {
  const responseIds = new Set(rows.map((row) => row.responseId));
  const responseCount = responseIds.size;
  const published = responseCount >= anonymityFloor;
  if (!published) {
    return {
      teamId,
      teamName,
      responseCount,
      published: false,
      averageScore: null,
      health: "ok",
      questions: [],
      comments: [],
    };
  }

  const rowsByQuestion = new Map<string, AnswerRow[]>();
  for (const row of rows) {
    if (!row.questionId) {
      continue;
    }
    const list = rowsByQuestion.get(row.questionId) ?? [];
    list.push(row);
    rowsByQuestion.set(row.questionId, list);
  }

  const scaleValues: number[] = [];
  const questionScores: ManagerPulseQuestion[] = surveyQuestions.map((question) => {
    const questionRows = rowsByQuestion.get(question.id) ?? [];
    if (question.type === "scale") {
      const { min, max } = scaleBounds(question.options);
      const values = questionRows.flatMap((row) => {
        const n = numericValue(row.value?.value);
        return n === null ? [] : [n];
      });
      scaleValues.push(...values);
      return {
        id: question.id,
        prompt: question.prompt,
        position: question.position,
        scale: { min, max, average: average(values), count: values.length },
        choice: null,
        text: null,
      };
    }
    if (question.type === "choice") {
      const labels = choiceLabels(question.options);
      const counts = new Map(labels.map((label) => [label, 0]));
      let count = 0;
      for (const row of questionRows) {
        const choice = stringValue(row.value?.value);
        if (!choice) {
          continue;
        }
        counts.set(choice, (counts.get(choice) ?? 0) + 1);
        count += 1;
      }
      const options = [...counts.entries()].map(([label, optionCount]) => ({
        label,
        count: optionCount,
      }));
      return {
        id: question.id,
        prompt: question.prompt,
        position: question.position,
        scale: null,
        choice: { count, options },
        text: null,
      };
    }
    return {
      id: question.id,
      prompt: question.prompt,
      position: question.position,
      scale: null,
      choice: null,
      text: { count: questionRows.length },
    };
  });

  const comments: ManagerPulseComment[] = [];
  for (const question of surveyQuestions) {
    if (question.type !== "text") {
      continue;
    }
    const texts = (rowsByQuestion.get(question.id) ?? [])
      .flatMap((row) => {
        const text = stringValue(row.value?.value).trim();
        if (!text) {
          return [];
        }
        return [
          {
            text,
            submittedAt: timeValue(row.submittedAt),
            responseId: row.responseId,
          },
        ];
      })
      .sort(
        (left, right) =>
          left.submittedAt - right.submittedAt ||
          left.responseId.localeCompare(right.responseId),
      );
    for (const item of texts) {
      comments.push({
        questionId: question.id,
        question: question.prompt,
        text: item.text,
      });
    }
  }

  const averageScore = average(scaleValues);
  return {
    teamId,
    teamName,
    responseCount,
    published: true,
    averageScore,
    health: healthFor(averageScore),
    questions: questionScores,
    comments,
  };
}

function scaleBounds(options: QuestionOptions): { min: number; max: number } {
  if (options && "min" in options && "max" in options) {
    return { min: options.min, max: options.max };
  }
  return { min: 1, max: 5 };
}

function choiceLabels(options: QuestionOptions): string[] {
  if (options && "choices" in options) {
    return options.choices;
  }
  return [];
}

function numericValue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function timeValue(value: Date | string | null): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
}

function healthFor(avg: number | null): ManagerPulseHealth {
  if (avg === null || avg >= WATCH_THRESHOLD) {
    return "ok";
  }
  if (avg < LOW_THRESHOLD) {
    return "low";
  }
  return "watch";
}
