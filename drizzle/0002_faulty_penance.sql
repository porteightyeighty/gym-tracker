ALTER TABLE "sets" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "rpe" numeric(3, 1);--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "is_warmup" boolean DEFAULT false NOT NULL;