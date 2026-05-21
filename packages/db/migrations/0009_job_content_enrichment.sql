-- PRD-010 / PLAN-016: job content enrichment.
-- Add poster contact, location, duration, and optional notes to jobs.
-- DEFAULTs are present so the migration applies cleanly on a populated DB
-- (launch chapter is fresh, so this is a one-time safety net only). The
-- tRPC layer (`jobs.post`) enforces explicit values for all new posts;
-- code MUST NOT rely on these defaults.

ALTER TABLE "jobs" ADD COLUMN "poster_contact_kind" text NOT NULL DEFAULT 'email';
ALTER TABLE "jobs" ADD COLUMN "poster_contact_value" text NOT NULL DEFAULT 'unknown';
ALTER TABLE "jobs" ADD COLUMN "location" text NOT NULL DEFAULT 'unknown';
ALTER TABLE "jobs" ADD COLUMN "estimated_duration_hours" numeric(4, 2) NOT NULL DEFAULT 1.0;
ALTER TABLE "jobs" ADD COLUMN "additional_notes" text;

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_poster_contact_kind_enum"
  CHECK ("poster_contact_kind" IN ('email', 'phone'));
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_estimated_duration_range"
  CHECK ("estimated_duration_hours" > 0 AND "estimated_duration_hours" <= 24);
