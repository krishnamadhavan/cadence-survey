ALTER TABLE "admins" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "totp_last_step" integer;