ALTER TABLE "pulse_links" ADD COLUMN "response_id" uuid;--> statement-breakpoint
ALTER TABLE "pulse_links" ADD CONSTRAINT "pulse_links_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_links" ADD CONSTRAINT "pulse_links_response_id_unique" UNIQUE("response_id");