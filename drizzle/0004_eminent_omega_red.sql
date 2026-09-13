CREATE TABLE "survey_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "survey_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "template_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb,
	"position" integer NOT NULL,
	"required" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "template_questions" ADD CONSTRAINT "template_questions_template_id_survey_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."survey_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "template_questions_template_id_idx" ON "template_questions" USING btree ("template_id");