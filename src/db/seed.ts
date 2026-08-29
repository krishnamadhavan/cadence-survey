import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { questions, surveys } from "./schema";

config({ path: ".env" });

const DATABASE_URL = process.env.DATABASE_URL ?? "";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed");
}

const WEEKLY_PULSE_TOKEN = "weekly-pulse";

async function seed() {
  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  const existing = await db
    .select({ id: surveys.id })
    .from(surveys)
    .where(eq(surveys.publicToken, WEEKLY_PULSE_TOKEN))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Seed already present (token: ${WEEKLY_PULSE_TOKEN}).`);
    await client.end();
    return;
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
    .returning({ id: surveys.id });

  if (!survey) {
    throw new Error("Failed to insert survey");
  }

  await db.insert(questions).values([
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
  ]);

  console.log("Seeded weekly pulse survey.");
  console.log(`  Public link: /s/${WEEKLY_PULSE_TOKEN}`);

  await client.end();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
