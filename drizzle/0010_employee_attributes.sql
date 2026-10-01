CREATE TYPE "public"."employee_tenure_band" AS ENUM('lt_1', 'y1_3', 'gte_3');--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "tenure_band" "employee_tenure_band";