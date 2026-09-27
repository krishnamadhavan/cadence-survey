CREATE TABLE "workspace_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"anonymity_floor" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
INSERT INTO "workspace_settings" ("id", "anonymity_floor") VALUES ('default', 3) ON CONFLICT ("id") DO NOTHING;
