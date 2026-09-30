CREATE TABLE "pulse_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"token" text NOT NULL,
	"redeemed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pulse_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "pulse_links" ADD CONSTRAINT "pulse_links_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_links" ADD CONSTRAINT "pulse_links_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pulse_links_survey_employee_idx" ON "pulse_links" USING btree ("survey_id","employee_id");--> statement-breakpoint
CREATE INDEX "pulse_links_survey_id_idx" ON "pulse_links" USING btree ("survey_id");