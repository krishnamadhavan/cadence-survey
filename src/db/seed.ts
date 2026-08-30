import { config } from "dotenv";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hash } from "bcryptjs";
import { normalizeEmail } from "../lib/email";
import { admins, answers, questions, responses, surveys, teams } from "./schema";

config({ path: ".env" });

const DATABASE_URL = process.env.DATABASE_URL ?? "";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed");
}

const WEEKLY_PULSE_TOKEN = "weekly-pulse";

const TEAM_SEED = [
  { name: "Engineering", slug: "engineering" },
  { name: "Product", slug: "product" },
  { name: "Design", slug: "design" },
  { name: "Operations", slug: "operations" },
] as const;

type SeedDb = ReturnType<typeof drizzle>;

async function ensureTeams(db: SeedDb) {
  const existing = await db.select().from(teams);
  const bySlug = new Map(existing.map((team) => [team.slug, team]));

  for (const team of TEAM_SEED) {
    if (!bySlug.has(team.slug)) {
      const [inserted] = await db.insert(teams).values(team).returning();
      if (inserted) {
        bySlug.set(inserted.slug, inserted);
      }
    }
  }

  return bySlug;
}

async function ensureAdmin(db: SeedDb) {
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required to seed an admin");
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }

  const [existing] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1);

  if (existing) {
    console.log(`Admin already present (${email}).`);
    return;
  }

  const passwordHash = await hash(password, 12);
  await db.insert(admins).values({ email, passwordHash });
  console.log(`Seeded admin ${email}.`);
}

async function ensureSurvey(db: SeedDb) {
  const [existing] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.publicToken, WEEKLY_PULSE_TOKEN))
    .limit(1);

  if (existing) {
    const surveyQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.surveyId, existing.id));
    return { survey: existing, questions: surveyQuestions, created: false };
  }

  const [survey] = await db
    .insert(surveys)
    .values({
      title: "Weekly pulse",
      description:
        "A two-minute check-in. How was the week, and what should we know?",
      publicToken: WEEKLY_PULSE_TOKEN,
      status: "open",
    })
    .returning();

  if (!survey) {
    throw new Error("Failed to insert survey");
  }

  const surveyQuestions = await db
    .insert(questions)
    .values([
      {
        surveyId: survey.id,
        prompt: "How was your week?",
        type: "scale",
        options: {
          min: 1,
          max: 5,
          minLabel: "Rough",
          maxLabel: "Great",
        },
        position: 1,
        required: true,
      },
      {
        surveyId: survey.id,
        prompt: "Anything blocking you right now?",
        type: "choice",
        options: {
          choices: ["No", "A little", "Yes — I need help"],
        },
        position: 2,
        required: true,
      },
      {
        surveyId: survey.id,
        prompt: "One thing we should start, stop, or keep doing?",
        type: "text",
        options: null,
        position: 3,
        required: false,
      },
    ])
    .returning();

  return { survey, questions: surveyQuestions, created: true };
}

async function seedDemoResponses(
  db: SeedDb,
  surveyId: string,
  surveyQuestions: { id: string; type: string }[],
  teamsBySlug: Map<string, { id: string; slug: string }>,
) {
  const [tagged] = await db
    .select({ value: count() })
    .from(responses)
    .where(and(eq(responses.surveyId, surveyId), isNotNull(responses.teamId)));

  if ((tagged?.value ?? 0) > 0) {
    console.log("Team-tagged responses already present; skipping demo rows.");
    return;
  }

  const scaleQ = surveyQuestions.find((question) => question.type === "scale");
  const choiceQ = surveyQuestions.find((question) => question.type === "choice");
  const textQ = surveyQuestions.find((question) => question.type === "text");

  if (!scaleQ || !choiceQ) {
    throw new Error("Expected scale and choice questions for demo seed");
  }

  const demo: {
    slug: string;
    week: number;
    block: string;
    note: string | null;
  }[] = [
    { slug: "engineering", week: 5, block: "No", note: "Keep Friday demos." },
    { slug: "engineering", week: 4, block: "No", note: null },
    { slug: "engineering", week: 4, block: "A little", note: "CI is flaky." },
    { slug: "product", week: 3, block: "A little", note: "Roadmap is fuzzy." },
    { slug: "product", week: 4, block: "No", note: null },
    { slug: "design", week: 4, block: "No", note: "More review time." },
    { slug: "design", week: 3, block: "A little", note: null },
    {
      slug: "operations",
      week: 2,
      block: "Yes — I need help",
      note: "On-call is brutal.",
    },
    {
      slug: "operations",
      week: 2,
      block: "Yes — I need help",
      note: "Understaffed this week.",
    },
    { slug: "operations", week: 3, block: "A little", note: null },
  ];

  for (const row of demo) {
    const team = teamsBySlug.get(row.slug);
    if (!team) {
      throw new Error(`Missing team ${row.slug}`);
    }

    const [response] = await db
      .insert(responses)
      .values({ surveyId, teamId: team.id })
      .returning({ id: responses.id });

    if (!response) {
      throw new Error("Failed to insert demo response");
    }

    const values = [
      {
        responseId: response.id,
        questionId: scaleQ.id,
        value: { value: row.week },
      },
      {
        responseId: response.id,
        questionId: choiceQ.id,
        value: { value: row.block },
      },
    ];

    if (textQ && row.note) {
      values.push({
        responseId: response.id,
        questionId: textQ.id,
        value: { value: row.note },
      });
    }

    await db.insert(answers).values(values);
  }

  console.log(`Seeded ${demo.length} demo responses across teams.`);
}

async function seed() {
  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  await ensureAdmin(db);
  const teamsBySlug = await ensureTeams(db);
  const { survey, questions: surveyQuestions, created } = await ensureSurvey(db);

  console.log(
    created
      ? "Seeded weekly pulse survey."
      : `Survey already present (token: ${WEEKLY_PULSE_TOKEN}).`,
  );

  await seedDemoResponses(db, survey.id, surveyQuestions, teamsBySlug);

  console.log(`  Public link: /s/${WEEKLY_PULSE_TOKEN}`);
  console.log("  Results:     /admin/s/weekly-pulse");
  console.log("  Admin login: /admin/login");

  await client.end();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
