ALTER TABLE "workspace_settings" ADD COLUMN "logo" "bytea";--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "logo_content_type" text;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN "logo_updated_at" timestamp with time zone;