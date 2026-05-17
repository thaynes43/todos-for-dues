-- Migration 0003's `assert_min_one_admin` trigger fired on every INSERT OR
-- UPDATE OF role OR DELETE and unconditionally asserted `count(admins) >= 1`.
-- On a fresh chapter instance the very first user is necessarily inserted
-- with a non-Admin role (mapProfileToUser returns 'Alumni' for SSO sign-ups,
-- and the bootstrap-admin hook only fires AFTER the user row + session row
-- exist) — so the INSERT itself fired the trigger, found zero admins, and
-- aborted the row. Symptom: first Workspace SSO bounces back to /login;
-- pod log shows "min-Admin invariant violated: chapter must have at least
-- one Admin" with no preceding user row created.
--
-- The PRD-001 Q-08 invariant is "you cannot leave a chapter with zero
-- Admins", i.e. it guards demotion and deletion. INSERT can never reduce
-- the Admin count, so it should never be gated by this trigger.
--
-- This migration replaces the trigger function so it only enforces on the
-- two operations that can drop Admin count: UPDATE OF role transitioning
-- an Admin AWAY from Admin, and DELETE of an Admin. INSERT is now an
-- unconditional pass at the trigger level (the existing CHECK constraint
-- in 0002_init still enforces role ∈ ROLES on insert).
--
-- Effect on existing tests:
-- - packages/db/__tests__/min-admin-invariant.test.ts uses an existing
--   Admin and demotes them — UPDATE-demotion path, still enforced.
-- - packages/domain/__tests__/role-transitions.test.ts same.
-- - packages/auth/__tests__/integration/bootstrap-admin*.test.ts now also
--   passes from a fresh DB (previously masked because the test fixture
--   pre-seeded an Admin row in setup).

CREATE OR REPLACE FUNCTION assert_min_one_admin() RETURNS trigger AS $$
DECLARE
  admin_count int;
BEGIN
  -- Only check on operations that can REDUCE the admin count.
  IF (TG_OP = 'UPDATE' AND OLD.role = 'Admin' AND NEW.role <> 'Admin')
     OR (TG_OP = 'DELETE' AND OLD.role = 'Admin') THEN
    SELECT COUNT(*) INTO admin_count FROM users WHERE role = 'Admin';
    IF admin_count < 1 THEN
      RAISE EXCEPTION 'min-Admin invariant violated: chapter must have at least one Admin'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
