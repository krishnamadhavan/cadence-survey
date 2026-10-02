ALTER TABLE "surveys" ADD COLUMN "cadence" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "next_survey_id" uuid;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_next_survey_id_unique" UNIQUE("next_survey_id");