-- ADR-013: the sigoalumni.org portal is the only identity source. The
-- invite-token onboarding system (PRD-003 R-11..R-14, PLAN-014, table created
-- in 0002_init) is removed — membership is granted at the portal, not here.

DROP TABLE "invite_tokens";
--> statement-breakpoint
-- Pre-SSO identity wipe (modernization plan §P2 / audit §0: prod data is
-- disposable, no real member/dues data exists — wipe-OK). Local-credential
-- and google-workspace identities cannot be mapped onto portal subjects, so
-- rather than strand rows that can never sign in again, reset the instance.
-- CASCADE truncates everything FK-chained to users: session, account, jobs,
-- job_enrollments, job_state_transitions, job_content_changes,
-- user_role_transitions — AND chapter_settings (updated_by → users), whose
-- rows are configuration, not identity data. Snapshot chapter_settings
-- around the truncate so the 0004 bootstrap values (and any live edits)
-- survive; updated_by is dropped to NULL because the referenced user is gone.
CREATE TEMPORARY TABLE "_chapter_settings_wipe_backup" AS
  SELECT "key", "value", "updated_at" FROM "chapter_settings";
--> statement-breakpoint
TRUNCATE TABLE "users" CASCADE;
--> statement-breakpoint
INSERT INTO "chapter_settings" ("key", "value", "updated_at")
  SELECT "key", "value", "updated_at" FROM "_chapter_settings_wipe_backup";
--> statement-breakpoint
DROP TABLE "_chapter_settings_wipe_backup";
