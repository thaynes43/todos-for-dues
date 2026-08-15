-- 0012: member status orthogonal to roles (sigo-alumni backlog 07 ruling / ADR-015).
--
-- The Active/Alumni ROLE values are removed. Membership status (active|alumni)
-- is now a portal-only roster fact, fully orthogonal to roles. The remaining
-- roles are Member | Moderator | Admin — the ambiguous "Alumni" role is renamed
-- to the unambiguous "Member" (which also absorbs the retired "Active" role,
-- since role no longer encodes membership status). See ADR-015.
--
-- History is history: user_role_transitions rows (including the 2026-08-14
-- corrective Admin-restore for the owner) are NOT rewritten. That table carries
-- no role CHECK constraint, so legacy 'Active'/'Alumni' audit rows stay valid
-- alongside new 'Member' rows — only the live users.role projection is migrated.
--
-- The min-1-Admin trigger (0003/0008) is untouched: it keys on role = 'Admin',
-- which this migration never rewrites. On a data-migrate that matches zero rows
-- (fresh DB after the 0011 wipe) the FOR EACH ROW trigger never fires.

ALTER TABLE "users" DROP CONSTRAINT "users_role_enum";
--> statement-breakpoint
UPDATE "users" SET "role" = 'Member', "updated_at" = now()
  WHERE "role" IN ('Active', 'Alumni');
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'Member';
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_enum"
  CHECK ("users"."role" = ANY (ARRAY['Member','Moderator','Admin']));
