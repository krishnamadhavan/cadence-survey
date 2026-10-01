ALTER TABLE "responses" ADD COLUMN "role" text;--> statement-breakpoint
CREATE INDEX "responses_survey_role_idx" ON "responses" USING btree ("survey_id","role");