ALTER TABLE "responses" ADD COLUMN "tenure_band" "employee_tenure_band";--> statement-breakpoint
CREATE INDEX "responses_survey_tenure_idx" ON "responses" USING btree ("survey_id","tenure_band");