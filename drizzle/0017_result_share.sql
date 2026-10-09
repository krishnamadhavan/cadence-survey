ALTER TABLE "surveys" ADD COLUMN "results_token" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_results_token_unique" UNIQUE("results_token");