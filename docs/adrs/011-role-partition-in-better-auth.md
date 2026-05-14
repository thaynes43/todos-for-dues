---
id: ADR-011
title: Use a single role string column with partition computed in code, plus a deferred-CHECK min-Admin invariant
status: Proposed
date: 2026-05-14
deciders: [Tom Haynes]
consulted: []
informed: []
related:
  prds: [PRD-001, PRD-003, PRD-008]
  adrs: [ADR-002, ADR-004]
  flows: []
  designs: []
  supersedes: null
  superseded_by: null
---

## Context and problem statement

PRD-001 R-02 partitions roles into **non-privileged** {Active, Alumni} and **privileged** {Moderator, Admin}. PRD-001 R-09 says non-privileged transitions are self-service; privileged grants are Admin-only; Admin demotions (self or other-initiated) are subject to R-16's minimum-one-Admin invariant. PRD-008 owns the in-app UI for these transitions. The decision: how do these roles + the partition + the invariant land in the data model, given that ADR-002 commits us to Better Auth?

## Decision drivers

1. **One source of truth for "what's this user's role?"** No duplicated state across columns or tables that could drift.
2. **Partition logic shared between client + server.** Both UI and tRPC procedures need to ask "is this role privileged?"; the answer must be the same in both places.
3. **Min-Admin invariant enforced atomically with the role-change write.** Otherwise a concurrent demotion + delete can create a zero-Admin window.
4. **Compatibility with Better Auth's session shape.** The role must be retrievable from the current session without a per-request DB query.
5. **Forward-compatibility with Workspace SSO** (ADR-007). SSO-created accounts need a default role assigned at first login.
6. **Auditability of role changes.** PRD-008 §10 calls out a user-role-change audit log analog of PRD-001 R-15.

## Considered options

- **Option A** — Single `role` text column on the `users` table; the four values stored as strings; partition is a typed helper in code (`isPrivileged(role: Role): boolean`). Min-Admin enforced via a DEFERRABLE CHECK constraint that fires at transaction commit.
- **Option B** — Separate `role` (Active | Alumni | Moderator | Admin) and `is_privileged` (boolean) columns — denormalized partition. Min-Admin enforced via app-layer transaction lock + check.
- **Option C** — Roles as a many-to-many relation: `user_roles(user_id, role)`, allowing multiple roles per user (e.g., Alumni + Moderator). Partition derived from the join.
- **Option D** — Role hierarchy in Better Auth (Admin > Moderator > Alumni > Active), with privileged check as `level >= Moderator`. Min-Admin via app code.

## Decision outcome

**Chosen option:** *Option A — single role string column + code-side partition + deferred-CHECK min-Admin.*

Schema additions on Better Auth's `users` table (or in a `user_profile` table that joins to it, depending on Better Auth's extensibility — finalised in design):

```sql
ALTER TABLE users
  ADD COLUMN role text NOT NULL DEFAULT 'Active'
    CHECK (role IN ('Active', 'Alumni', 'Moderator', 'Admin'));

-- Min-Admin invariant: at least one Admin must exist, deferred to commit so
-- atomic-swap (promote-then-demote) operations succeed within a transaction.
CREATE OR REPLACE FUNCTION assert_min_one_admin() RETURNS trigger AS $$
DECLARE admin_count int;
BEGIN
  SELECT COUNT(*) INTO admin_count FROM users WHERE role = 'Admin';
  IF admin_count < 1 THEN
    RAISE EXCEPTION 'min-Admin invariant violated: chapter must have at least one Admin'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_min_one_admin
  AFTER INSERT OR UPDATE OR DELETE ON users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_min_one_admin();
```

(Postgres CHECK constraints can't reference other rows, so the invariant is a deferred constraint trigger — fires once at commit time, allowing intra-transaction swaps.)

Code-side:

```ts
// packages/domain/roles.ts
export const ROLES = ['Active', 'Alumni', 'Moderator', 'Admin'] as const;
export type Role = (typeof ROLES)[number];
const PRIVILEGED: ReadonlySet<Role> = new Set(['Moderator', 'Admin']);
export const isPrivileged = (r: Role): boolean => PRIVILEGED.has(r);
```

Better Auth session extension surfaces `role` in the session payload; tRPC middleware reads it and gates procedures accordingly. SSO-created accounts default to `Active` at first login (consistent with the Active invite-link path); Admin can promote per PRD-008.

Role-change events are recorded in a separate `user_role_transitions` table (analog of ADR-009's `job_state_transitions` — same shape, different rows) for the audit log called out in PRD-008 §10.

### Consequences

- **C-01 (good)** — One `role` column = one source of truth. No drift risk between role and a denormalised partition flag.
- **C-02 (good)** — `isPrivileged()` in shared code (`packages/domain/`) is imported by both client and server — the partition rule is identical in both places by construction.
- **C-03 (good)** — Deferred-CHECK trigger lets us atomically swap (e.g., "promote user B to Admin, then demote user A") in one transaction without violating the invariant mid-flight.
- **C-04 (good)** — Operator recovery via `BOOTSTRAP_ADMIN_EMAIL` (ADR-002) and direct DB access still works — bootstrap can `INSERT … ON CONFLICT … UPDATE role = 'Admin'` and the trigger-deferred check passes at commit.
- **C-05 (good)** — Trigger error code `23514` (check_violation) is recognisable in the app layer; tRPC middleware can map it to PRD-001 R-16's UI error message ("Cannot demote — this is the chapter's only Admin. Promote someone else to Admin first.").
- **C-06 (bad)** — Postgres-specific (deferred constraint triggers). Cross-engine portability is reduced — but ADR-004 already commits us to Postgres-only.
- **C-07 (bad)** — Adding a fifth role later requires altering the CHECK constraint and the `Role` type and the `PRIVILEGED` set — three coordinated changes. Acceptable for a stable role taxonomy.
- **C-08 (neutral)** — Multi-role users (e.g., "Moderator who is also organising as Alumni") aren't expressible. PRD-001 R-02 doesn't ask for this; if it surfaces, supersede with a new ADR adopting Option C.
- **C-09 (neutral)** — Better Auth's exact extension mechanism (custom `users` columns vs. a separate `user_profile` table) is finalised in design. Either works with this ADR; the ADR doesn't depend on the layout.

### Confirmation

- Unit test: `isPrivileged()` returns expected values for each of the four roles.
- Integration test: an attempt to demote the only Admin returns the trigger error; UI shows the R-16 message.
- Integration test: a transaction that demotes the current Admin AND promotes another user to Admin in the same Drizzle transaction succeeds.
- Integration test: `BOOTSTRAP_ADMIN_EMAIL` flow promotes a user even when no Admins currently exist (zero-Admin → one-Admin transition).
- AC in PRD-008 §5.1: every role-change AC verifies both the resulting role *and* a `user_role_transitions` row exists.

## Pros and cons of the options

### Option A — single role column + code-side partition

See §Decision outcome.

- Good — Single source of truth, shared partition logic, atomic invariant.
- Bad — Postgres-specific trigger; coordinated change to add a role.

### Option B — separate role + is_privileged columns

Stores the partition flag explicitly.

- Good — Faster filter queries on `is_privileged` (rare in our scale).
- Bad — Drift risk: a bad migration sets `role = 'Admin'` but forgets `is_privileged = true`.
- Bad — Doesn't help with the min-Admin invariant; that's still trigger / app-layer.

### Option C — many-to-many user_roles relation

Allows multiple roles per user.

- Good — Future-proof for "Alumni + Moderator simultaneously" use cases.
- Bad — Overkill — PRD-001 R-02 commits to one role per user; YAGNI.
- Bad — Every role-check becomes a join; session-token shape is complicated.
- Bad — Min-Admin invariant becomes a `COUNT(DISTINCT user_id) WHERE role = 'Admin'` — trigger logic is more complex.

### Option D — role hierarchy

Roles as ordered levels; `isPrivileged` = `level >= Moderator`.

- Good — Privileged check is a numeric comparison.
- Bad — Implies a strict hierarchy that doesn't match the domain (an Admin is NOT a "stronger Alumni"; the role partition is categorical, not ordinal).
- Bad — Misleads contributors into thinking a Moderator inherits Alumni capabilities (they don't necessarily).

## More information

- PRD-001 R-02 (role partition), R-09 (self-service vs. Admin-grant), R-16 (min-Admin invariant), US-15 (self-service role change story).
- PRD-008 — owns the role-change UI and §10 calls out the user-role-change audit log this ADR plans for.
- ADR-002 — Better Auth + `BOOTSTRAP_ADMIN_EMAIL` recovery path.
- ADR-004 — Postgres + Drizzle.
- [Postgres deferrable constraint triggers](https://www.postgresql.org/docs/current/sql-createtrigger.html) — for the constraint mechanism used here.

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial Proposed. Recommendation: Option A (single role string + code-side partition + deferred-CHECK trigger for min-Admin). |
