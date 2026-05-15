-- DESIGN-001 §4.2's users.password_hash / oidc_subject / oidc_provider columns and
-- the users_account_kind CHECK are superseded by Better Auth's account table
-- (created in 0005). DESIGN-001 §2.2 already cedes Better Auth's internal table
-- layout to DESIGN-004, so removing these dead columns + the now-incorrect CHECK
-- is the right reconciliation. See PLAN-004 §9 Q-PLN-03.

ALTER TABLE "users" DROP CONSTRAINT "users_account_kind";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "oidc_subject";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "oidc_provider";
