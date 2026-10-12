ALTER TABLE "employees" ADD COLUMN "office" text;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "office" text;--> statement-breakpoint
CREATE INDEX "responses_survey_office_idx" ON "responses" USING btree ("survey_id","office");--> statement-breakpoint
UPDATE "employees" AS e
SET "office" = t."office"
FROM "teams" AS t
WHERE e."team_id" = t."id"
  AND e."office" IS NULL
  AND t."office" IS NOT NULL;--> statement-breakpoint
UPDATE "responses" AS r
SET "office" = t."office"
FROM "teams" AS t
WHERE r."team_id" = t."id"
  AND r."office" IS NULL
  AND t."office" IS NOT NULL;
