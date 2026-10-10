import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const surveyStatuses = ["draft", "open", "closed"] as const;
export type SurveyStatus = (typeof surveyStatuses)[number];

export const actionPlanStatuses = ["open", "done"] as const;
export type ActionPlanStatus = (typeof actionPlanStatuses)[number];

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

export const workspaceSettings = pgTable("workspace_settings", {
  id: text("id").primaryKey().default("default"),
  anonymityFloor: integer("anonymity_floor").notNull().default(3),
  // Published results summary is POSTed here when a pulse closes. Null sends nothing.
  webhookUrl: text("webhook_url"),
  // HMAC key for Cadence-Signature. Cleared with the URL.
  webhookSecret: text("webhook_secret"),
});

export const admins = pgTable("admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  totpLastStep: integer("totp_last_step"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => admins.id, { onDelete: "set null" }),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("audit_events_created_at_idx").on(table.createdAt)],
);

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const employeeTenureBand = pgEnum("employee_tenure_band", [
  "lt_1",
  "y1_3",
  "gte_3",
]);

export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
});

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    role: text("role"),
    tenureBand: employeeTenureBand("tenure_band"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("employees_team_id_idx").on(table.teamId)],
);

export const teamManagers = pgTable(
  "team_managers",
  {
    teamId: uuid("team_id")
      .primaryKey()
      .references(() => teams.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("team_managers_employee_id_idx").on(table.employeeId)],
);

export const managerAccounts = pgTable("manager_accounts", {
  employeeId: uuid("employee_id")
    .primaryKey()
    .references(() => employees.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const surveys = pgTable("surveys", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  publicToken: text("public_token").notNull().unique(),
  // Unguessable results link. Null until an admin creates it on a closed pulse.
  // Cleared when an admin turns it off, or when the pulse is reopened.
  // This is not the survey address.
  resultsToken: text("results_token").unique(),
  status: text("status").notNull().$type<SurveyStatus>().default("draft"),
  opensAt: timestamp("opens_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  cadence: text("cadence").$type<"weekly" | "biweekly" | "monthly">(),
  seriesId: uuid("series_id"),
  nextSurveyId: uuid("next_survey_id").unique(),
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
    // Snapshot of the role chosen at submit. Not a foreign key: answers must not join back to a person.
    role: text("role"),
    // Snapshot of the roster tenure band at submit. A band value, not a link to the employee.
    tenureBand: employeeTenureBand("tenure_band"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("responses_survey_id_idx").on(table.surveyId),
    index("responses_team_id_idx").on(table.teamId),
    index("responses_survey_role_idx").on(table.surveyId, table.role),
    index("responses_survey_tenure_idx").on(table.surveyId, table.tenureBand),
  ],
);

// One personal link per employee per pulse. `response_id` points at the single
// response that link wrote, so a later visit can replace it while the pulse
// is open. The response row stores the team and a tenure band snapshot, not
// the employee. Reports and the admin link list do not read `response_id`.
// There is no redeemed time.
export const pulseLinks = pgTable(
  "pulse_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    surveyId: uuid("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    redeemed: boolean("redeemed").notNull().default(false),
    responseId: uuid("response_id")
      .unique()
      .references(() => responses.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("pulse_links_survey_employee_idx").on(table.surveyId, table.employeeId),
    index("pulse_links_survey_id_idx").on(table.surveyId),
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
  employees: many(employees),
}));

export const employeesRelations = relations(employees, ({ one }) => ({
  team: one(teams, {
    fields: [employees.teamId],
    references: [teams.id],
  }),
  managerAccount: one(managerAccounts, {
    fields: [employees.id],
    references: [managerAccounts.employeeId],
  }),
}));

export const surveyTemplates = pgTable("survey_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const templateQuestions = pgTable(
  "template_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => surveyTemplates.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    type: text("type").notNull().$type<QuestionType>(),
    options: jsonb("options").$type<QuestionOptions>(),
    position: integer("position").notNull(),
    required: boolean("required").notNull().default(true),
  },
  (table) => [index("template_questions_template_id_idx").on(table.templateId)],
);

export const actionPlans = pgTable(
  "action_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    surveyId: uuid("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "restrict" }),
    teamKey: text("team_key").notNull(),
    teamName: text("team_name").notNull(),
    followUp: text("follow_up").notNull(),
    status: text("status").notNull().$type<ActionPlanStatus>().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("action_plans_survey_id_idx").on(table.surveyId),
    uniqueIndex("action_plans_open_survey_team_idx")
      .on(table.surveyId, table.teamKey)
      .where(sql`${table.status} = 'open'`),
  ],
);

export const surveysRelations = relations(surveys, ({ many }) => ({
  questions: many(questions),
  responses: many(responses),
}));

export const surveyTemplatesRelations = relations(
  surveyTemplates,
  ({ many }) => ({
    questions: many(templateQuestions),
  }),
);

export const templateQuestionsRelations = relations(
  templateQuestions,
  ({ one }) => ({
    template: one(surveyTemplates, {
      fields: [templateQuestions.templateId],
      references: [surveyTemplates.id],
    }),
  }),
);

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
