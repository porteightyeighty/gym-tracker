CREATE TABLE "exercise_analyses" (
	"exercise_id" uuid PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"sessions" integer NOT NULL,
	"best_value" numeric(8, 2),
	"sessions_since_best" integer NOT NULL,
	"plateau" boolean NOT NULL,
	"target_weight_kg" numeric(6, 2),
	"target_reps" integer,
	"rep_range_low" integer,
	"rep_range_high" integer,
	"target_reason" text,
	"last_session_at" timestamp with time zone,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "personal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reps" integer NOT NULL,
	"weight_kg" numeric(6, 2) NOT NULL,
	"value" numeric(8, 2) NOT NULL,
	"performed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercise_analyses" ADD CONSTRAINT "exercise_analyses_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("processed_at","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_records_set_kind_idx" ON "personal_records" USING btree ("set_id","kind");--> statement-breakpoint
CREATE INDEX "personal_records_exercise_idx" ON "personal_records" USING btree ("exercise_id");