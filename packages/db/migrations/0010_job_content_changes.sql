-- PRD-011 / PLAN-017: audit-log table for job content edits.
-- One row per successful jobs.edit mutation; captures actor + JSON diff +
-- the state the job was in at the moment of the edit. ADR-009 pattern.

CREATE TABLE "job_content_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "actor_id" uuid NOT NULL REFERENCES "users"("id"),
  "diff" jsonb NOT NULL,
  "state_at_edit" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_job_content_changes_job_id"
  ON "job_content_changes" ("job_id", "created_at" DESC);
