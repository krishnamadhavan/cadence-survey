import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const surveyStatuses = ["draft", "open", "closed"] as const;
export type SurveyStatus = (typeof surveyStatuses)[number];

export const questionTypes = ["scale", "text", "choice"] as const;
export type QuestionType = (typeof questionTypes)[number];

export type ScaleOptions = {
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
};

export type ChoiceOptions = {
  choices: string[];
};

export type QuestionOptions = ScaleOptions | ChoiceOptions | null;

export type AnswerValue = {
  value: string | number;
};

export const admins = pgTable("admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
});

export const surveys = pgTable("surveys", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  publicToken: text("public_token").notNull().unique(),
  status: text("status").notNull().$type<SurveyStatus>().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    surveyId: uuid("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    type: text("type").notNull().$type<QuestionType>(),
    options: jsonb("options").$type<QuestionOptions>(),
    position: integer("position").notNull(),
    required: boolean("required").notNull().default(true),
  },
  (table) => [index("questions_survey_id_idx").on(table.surveyId)],
);

export const responses = pgTable(
  "responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    surveyId: uuid("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "restrict",
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("responses_survey_id_idx").on(table.surveyId),
    index("responses_team_id_idx").on(table.teamId),
  ],
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<AnswerValue>().notNull(),
  },
  (table) => [index("answers_response_id_idx").on(table.responseId)],
);

export const teamsRelations = relations(teams, ({ many }) => ({
  responses: many(responses),
}));

export const surveysRelations = relations(surveys, ({ many }) => ({
  questions: many(questions),
  responses: many(responses),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  survey: one(surveys, {
    fields: [questions.surveyId],
    references: [surveys.id],
  }),
  answers: many(answers),
}));

export const responsesRelations = relations(responses, ({ one, many }) => ({
  survey: one(surveys, {
    fields: [responses.surveyId],
    references: [surveys.id],
  }),
  team: one(teams, {
    fields: [responses.teamId],
    references: [teams.id],
  }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  response: one(responses, {
    fields: [answers.responseId],
    references: [responses.id],
  }),
  question: one(questions, {
    fields: [answers.questionId],
    references: [questions.id],
  }),
}));
