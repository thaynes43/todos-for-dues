CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'Active' NOT NULL,
	"password_hash" text,
	"oidc_subject" text,
	"oidc_provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_enum" CHECK ("users"."role" = ANY (ARRAY['Active','Alumni','Moderator','Admin'])),
	CONSTRAINT "users_account_kind" CHECK (("users"."password_hash" IS NOT NULL OR "users"."oidc_subject" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "invite_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"preselected_role" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invite_tokens_token_unique" UNIQUE("token"),
	CONSTRAINT "invite_tokens_role_non_privileged" CHECK ("invite_tokens"."preselected_role" = ANY (ARRAY['Active','Alumni']))
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"posted_by" uuid NOT NULL,
	"description" text NOT NULL,
	"dues_amount" numeric(10, 2) NOT NULL,
	"recommended_people_count" integer NOT NULL,
	"state" text DEFAULT 'awaiting_moderation' NOT NULL,
	"work_date" timestamp with time zone,
	"per_active_dues_credit" jsonb,
	"rejection_reason" text,
	"cancellation_reason" text,
	"dispute_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_state_enum" CHECK ("jobs"."state" = ANY (ARRAY['awaiting_moderation','approved','enrollment_open','locked','completed','payment_sent','closed','disputed','rejected','cancelled'])),
	CONSTRAINT "jobs_dues_positive" CHECK ("jobs"."dues_amount" > 0),
	CONSTRAINT "jobs_count_positive" CHECK ("jobs"."recommended_people_count" >= 1),
	CONSTRAINT "jobs_description_non_empty" CHECK (length(trim("jobs"."description")) > 0)
);
--> statement-breakpoint
CREATE TABLE "job_enrollments" (
	"job_id" uuid NOT NULL,
	"active_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_attendee_at" timestamp with time zone,
	CONSTRAINT "job_enrollments_job_id_active_id_pk" PRIMARY KEY("job_id","active_id")
);
--> statement-breakpoint
CREATE TABLE "job_state_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"actor_id" uuid,
	"actor_kind" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_role_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_role" text,
	"to_role" text NOT NULL,
	"initiator_id" uuid,
	"initiator_kind" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_enrollments" ADD CONSTRAINT "job_enrollments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_enrollments" ADD CONSTRAINT "job_enrollments_active_id_users_id_fk" FOREIGN KEY ("active_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_state_transitions" ADD CONSTRAINT "job_state_transitions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_state_transitions" ADD CONSTRAINT "job_state_transitions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_transitions" ADD CONSTRAINT "user_role_transitions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_transitions" ADD CONSTRAINT "user_role_transitions_initiator_id_users_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_settings" ADD CONSTRAINT "chapter_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_state_idx" ON "jobs" USING btree ("state");--> statement-breakpoint
CREATE INDEX "jobs_posted_by_created_at_idx" ON "jobs" USING btree ("posted_by","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_enrollments_active_idx" ON "job_enrollments" USING btree ("active_id");--> statement-breakpoint
CREATE INDEX "job_state_transitions_job_created_idx" ON "job_state_transitions" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "job_state_transitions_disputed_idx" ON "job_state_transitions" USING btree ("created_at") WHERE "job_state_transitions"."to_state" = 'disputed';--> statement-breakpoint
CREATE INDEX "user_role_transitions_user_created_idx" ON "user_role_transitions" USING btree ("user_id","created_at" DESC NULLS LAST);