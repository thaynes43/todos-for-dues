---
id: DESIGN-001
title: Database schema (Postgres + Drizzle)
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
related:
  prds: [PRD-001, PRD-002, PRD-003, PRD-004, PRD-005, PRD-006, PRD-007, PRD-008]
  adrs: [ADR-002, ADR-004, ADR-008, ADR-009, ADR-010, ADR-011]
  bounded_contexts: [BCC-01, BCC-02, BCC-03]
  aggregates: [ADC-01, ADC-02]
  flows: []
  designs: []
  parent_design: null
  supersedes: null
---

## 1. Purpose

Defines the complete Postgres schema for the walking-skeleton subset (BCC-01 Identity & Access, BCC-02 Job Lifecycle, BCC-03 Role Management read-only path) plus the cross-cutting infrastructure (chapter_settings, audit-log tables). Implements ADR-004 (Postgres + Drizzle), ADR-009 (audit-log table shape), ADR-010 (chapter_settings table), ADR-011 (role partition + min-Admin invariant trigger).

> **Realises:** PRD-001 R-07 (state machine persistence), R-15 (audit log), R-16 (min-Admin invariant); PRD-002 R-01 / R-05 (job creation + audit); PRD-004 R-02..R-12 (enrollment, lock, cancel); PRD-005 R-01..R-08 (completion, payment-sent); PRD-006 R-01..R-12 (loop closure, dispute); PRD-007 R-07..R-09 (chapter_settings); PRD-008 R-01..R-10 (role transitions + audit); ADC-01 §3-6; ADC-02 §3-6.
> **Definition of success:** an implementation agent can run `drizzle-kit generate` against the schema declarations in §4 and produce migrations that, applied to a fresh Postgres 16 database, satisfy every cited PRD AC at the persistence layer.

## 2. Scope

### 2.1 In scope

- All tables required for the walking-skeleton happy-path job loop end-to-end.
- All constraints + indexes + triggers required by ADR-011 (deferred-CHECK min-Admin) and ADR-009 (audit-log shape).
- Drizzle schema declarations (TypeScript) for each table.
- Initial migration SQL (the output `drizzle-kit` would generate).
- `drizzle-zod` derivations called out where they apply.

### 2.2 Out of scope

| Concern | Owned by | Reason |
|---------|----------|--------|
| Table-write code paths (FSM helper, tRPC procedures) | DESIGN-002, DESIGN-003 | Schema is data-at-rest only. |
| Better Auth's internal session table layout | DESIGN-004 | Wrapped library; we extend `users` but don't redesign auth tables. |
| Test-DB lifecycle (testcontainers, seeding) | DESIGN (testing TBD) | Test infra. |
| Backup / replication / failover | ADR-006 + haynes-ops cluster | Cluster-level concern. |

## 3. Architecture

```
postgres (CloudNative-PG cluster16, dedicated DB per ADR-006)
└── public schema
    ├── users                       (BCC-01 ADC-02 — chapter identity fields; credentials live in `account`)
    ├── invite_tokens               (BCC-01)
    ├── session                     (Better Auth — declared in our schema; library writes)
    ├── account                     (Better Auth — credentials per provider; library writes)
    ├── verification                (Better Auth — email-verification + reset tokens; library writes)
    ├── jobs                        (BCC-02 ADC-01)
    ├── job_enrollments             (BCC-02 — child of jobs)
    ├── job_state_transitions       (cross-cutting audit; BCC-02 writes; PRD-007 reads)
    ├── user_role_transitions       (cross-cutting audit; BCC-03 writes; PRD-007 reads)
    └── chapter_settings            (cross-cutting infra; ADR-010)
```

> Better Auth's `session` / `account` / `verification` tables are declared in our Drizzle schema (§4.10) because Better Auth's `drizzleAdapter` does NOT auto-create tables — it expects the schema to exist. The library writes to them at runtime; the source of truth for the table shape is Better Auth's docs at the installed version.

Drizzle schema declarations live in `packages/db/schema/` (one file per table, plus an `index.ts` barrel):

```
packages/db/schema/
  index.ts                       (barrel export)
  users.ts
  invite-tokens.ts
  better-auth.ts                 (session, account, verification — §4.10)
  jobs.ts
  job-enrollments.ts
  job-state-transitions.ts
  user-role-transitions.ts
  chapter-settings.ts
  enums.ts                       (job state enum, role enum)
```

Migrations live in `packages/db/migrations/` (Drizzle convention) with both the generated SQL and the meta journal.

## 4. Detailed design

### 4.1 `packages/db/schema/enums.ts`

- **Purpose:** centralised enum definitions reused across tables.
- **Public interface:**

  ```ts
  // ADC-01 state machine — must match ADR-008 transitions map
  export const JOB_STATES = [
    'awaiting_moderation',
    'approved',
    'enrollment_open',
    'locked',
    'completed',
    'payment_sent',
    'closed',
    'disputed',
    'rejected',
    'cancelled',
  ] as const;
  export type JobState = (typeof JOB_STATES)[number];

  // PRD-001 R-02 + ADR-011 — must match packages/domain/roles.ts
  export const ROLES = ['Active', 'Alumni', 'Moderator', 'Admin'] as const;
  export type Role = (typeof ROLES)[number];

  // PRD-007 R-04 + ADR-009 — actor_kind for audit log rows
  export const ACTOR_KINDS = ['user', 'system'] as const;
  export type ActorKind = (typeof ACTOR_KINDS)[number];

  // BCC-03 user_role_transitions
  export const ROLE_INITIATOR_KINDS = ['user', 'admin', 'system'] as const;
  export type RoleInitiatorKind = (typeof ROLE_INITIATOR_KINDS)[number];
  ```

- **Key behaviours:** the `JOB_STATES` array is the single source of truth that `packages/domain/job-state-machine.ts` (DESIGN-002) imports for FSM type-narrowing. Any new state must be added here AND to ADR-008's transitions map AND to a new migration that updates the CHECK constraint on `jobs.state`.

> **Note on naming (canonical wire form vs. display form):** the DB / TypeScript / tRPC payload form is `snake_case` — `awaiting_moderation`, `enrollment_open`, `payment_sent`. PRD-001 R-07 lists the same states in human-readable form with spaces and hyphens (`awaiting moderation`, `enrollment-open`, `payment-sent`); that is the **display** form. The two are kept in sync via the `stateDisplayName()` formatter spec'd in DESIGN-006 §4.6 (the single conversion point used by all UI badges, audit-log rendering, and email subjects). Code, queries, JSON payloads, and FSM event constants always use snake_case; only the presentation layer normalizes to PRD-001's display form.

### 4.2 `packages/db/schema/users.ts`

- **Purpose:** the User aggregate (ADC-02). The `users` table holds chapter-specific identity fields (`id`, `email`, `displayName`, `role`) and `emailVerified` (consumed by Better Auth's account-linking check). Per the wrapped-library boundary already declared in §2.2, credentials (password hash for app-managed users, OIDC subject/provider linkage for SSO users) are NOT on `users` — they live on Better Auth's `account` table (§4.10).

  > **Reconciliation note (2026-05-14, after PLAN-004 execution):** an earlier draft of this section had `password_hash` + `oidc_subject` + `oidc_provider` columns on `users` plus a `users_account_kind` CHECK constraint. That was a scope-boundary leak — Better Auth 1.6.x stores credentials in its own `account` table per provider, and never writes to those `users` columns. The columns + CHECK have been dropped during PLAN-004; the `users.email_verified` column was added in the same reshape. §2.2's "Better Auth's internal session table layout is owned by DESIGN-004" already ceded this region; this update makes §4.2 consistent with that boundary.

- **Drizzle declaration:**

  ```ts
  import { pgTable, uuid, text, timestamp, boolean, check } from 'drizzle-orm/pg-core';
  import { sql } from 'drizzle-orm';
  import { ROLES, type Role } from './enums';

  export const users = pgTable(
    'users',
    {
      id: uuid('id').primaryKey().defaultRandom(),                           // gen_random_uuid()
      email: text('email').notNull().unique(),                                // ADC-02 INV-01 (unique)
      displayName: text('display_name').notNull(),                            // ADC-02 INV-05
      role: text('role').$type<Role>().notNull().default('Active'),           // ADR-011 + ADC-02 INV-02
      emailVerified: boolean('email_verified').notNull().default(false),      // Better Auth account-linking gate (PRD-003 R-09)
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      check('users_role_enum', sql`${table.role} = ANY (ARRAY['Active','Alumni','Moderator','Admin'])`),
    ]
  );
  ```

- **Key behaviours:**
  1. `role` defaults to `'Active'` so SSO-created accounts (no token to pre-select role) get a safe non-privileged default — the Admin can promote via PRD-008.
  2. **ADC-02 INV-04** (app-managed has password, SSO has linkage) is now satisfied by the presence of at least one `account` row per user, NOT by a CHECK on the `users` table. The new Better Auth integration tests in `packages/auth/__tests__/integration/` assert: invite-token signup → user row + `account` row with `providerId: 'credential'`; SSO sign-in → user row + `account` row with `providerId: 'google-workspace'`; account linking → one user row + TWO `account` rows. The `users_account_kind` CHECK from the earlier draft has been dropped.
  3. `emailVerified` is consumed by Better Auth's transparent account-linking (PRD-003 R-09): the existing user must have `emailVerified = true` before an SSO sign-in for the same email auto-links to the existing row. Without this column we'd be forced onto Better Auth's deprecated `accountLinking.requireLocalEmailVerified: false` flag.
  4. Display name is required at the row level to match PRD-003 R-10 + downstream assumptions in ADC-02 INV-05.
- **Dependencies:** `enums.ts`, Drizzle ORM. Better Auth's `session`, `account`, `verification` tables are declared in `packages/db/src/schema/` alongside this file (see §4.10) — same Drizzle barrel — so the rest of the codebase has typed access.
- **Notes:**
  - The min-Admin invariant trigger lives in §5.3 (migration), not here — Drizzle doesn't model triggers directly.
  - `drizzle-zod` derives a `userInsertSchema` and `userSelectSchema` from this declaration; tRPC procedures import them directly.

### 4.3 `packages/db/schema/invite-tokens.ts`

- **Purpose:** invite-token credentials gating app-managed signup, scoped per-role (Active or Alumni link).
- **Drizzle declaration:**

  ```ts
  import { pgTable, uuid, text, timestamp, check } from 'drizzle-orm/pg-core';
  import { sql } from 'drizzle-orm';
  import { ROLES, type Role } from './enums';

  export const inviteTokens = pgTable(
    'invite_tokens',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      token: text('token').notNull().unique(),                                // the secret value used in the URL
      preselectedRole: text('preselected_role').$type<Role>().notNull(),      // Active or Alumni — never privileged
      createdBy: uuid('created_by').notNull().references(() => users.id),     // the Admin who generated it
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      revokedAt: timestamp('revoked_at', { withTimezone: true }),             // nullable; revocation = soft-delete
    },
    (table) => [
      check('invite_tokens_role_non_privileged', sql`${table.preselectedRole} = ANY (ARRAY['Active','Alumni'])`),  // PRD-001 R-02 / R-09
    ]
  );
  ```

- **Key behaviours:**
  1. `preselectedRole` is constrained to non-privileged values only (PRD-001 R-02 / PRD-008 R-04 — no self-elevation to privilege).
  2. The `token` value is opaque (UUID v4 hex or a longer base64); the URL contains it. Validity = exists + not revoked.
  3. **Tokens are not single-use in MVP** — multiple users can sign up via the same link (Discord-style per PRD-001 R-01). Revocation is the only invalidation mechanism.
- **Dependencies:** `enums.ts`, `users.ts`, Drizzle ORM.

### 4.4 `packages/db/schema/jobs.ts`

- **Purpose:** the Job aggregate (ADC-01). Holds posting fields, the FSM state column, the work date, and the dues-amount fields.
- **Drizzle declaration:**

  ```ts
  import { pgTable, uuid, text, timestamp, integer, numeric, jsonb, check, index } from 'drizzle-orm/pg-core';
  import { sql } from 'drizzle-orm';
  import { JOB_STATES, type JobState } from './enums';
  import { users } from './users';

  export const jobs = pgTable(
    'jobs',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      postedBy: uuid('posted_by').notNull().references(() => users.id),
      description: text('description').notNull(),                             // ADC-01 INV-03 (non-empty enforced at app + check)
      duesAmount: numeric('dues_amount', { precision: 10, scale: 2 }).notNull(),  // ADC-01 INV-01 (>0 via CHECK)
      recommendedPeopleCount: integer('recommended_people_count').notNull(),  // ADC-01 INV-02 (>=1)
      state: text('state').$type<JobState>().notNull().default('awaiting_moderation'),
      workDate: timestamp('work_date', { withTimezone: true }),               // null when not locked; ADC-01 INV-10 (future when locked)
      perActiveDuesCredit: jsonb('per_active_dues_credit'),                   // {<user_id>: numeric_string}; null until completed
      rejectionReason: text('rejection_reason'),                              // null unless state=rejected; non-empty when set
      cancellationReason: text('cancellation_reason'),                        // null unless state=cancelled; non-empty when set
      disputeReason: text('dispute_reason'),                                  // null unless state=disputed; non-empty when set; cleared on resolution
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      check('jobs_state_enum', sql`${table.state} = ANY (ARRAY['awaiting_moderation','approved','enrollment_open','locked','completed','payment_sent','closed','disputed','rejected','cancelled'])`),
      check('jobs_dues_positive', sql`${table.duesAmount} > 0`),               // INV-01
      check('jobs_count_positive', sql`${table.recommendedPeopleCount} >= 1`), // INV-02
      check('jobs_description_non_empty', sql`length(trim(${table.description})) > 0`),  // INV-03
      index('jobs_state_idx').on(table.state),                                 // PRD-007 R-02 aggregate counts
      index('jobs_posted_by_created_at_idx').on(table.postedBy, table.createdAt.desc()),  // PRD-002 R-11 my-postings list
    ]
  );
  ```

- **Key behaviours:**
  1. The `state` column is the single source of truth for FSM state. All transitions go through `transitionJob()` (DESIGN-002).
  2. `perActiveDuesCredit` is a `jsonb` map keyed by user_id (string UUID) → cents-rounded amount as a numeric string. Computed once at `completed` per ADC-01 INV-05; persisted for audit + display.
  3. Reason columns are nullable + populated by their respective transition. The CHECK constraints don't enforce non-empty when populated (the app layer does — moves complexity out of SQL); the only DB-level reason-related constraint is "set when transitioning to that state" which is best caught in the transition helper.
  4. INV-08 / INV-09 (reason / resolution-note required at transition) are app-layer enforced via `transitionJob()`.
  5. INV-10 (locked → future date) and INV-11 (locked → ≥1 enrollee) are app-layer enforced. Could add as constraints but they reference other tables (job_enrollments) and other rows, so a trigger would be more complex than the equivalent app code.
- **Dependencies:** `enums.ts`, `users.ts`.
- **Notes:**
  - Once `state` enum stabilises post-walking-skeleton, consider promoting to a Postgres `enum` type for tighter constraints. For MVP, `text + CHECK` is fine and easier to migrate.

### 4.5 `packages/db/schema/job-enrollments.ts`

- **Purpose:** the (Job, Active) relationship for enrolled Actives. Conceptually part of ADC-01 (no separate aggregate — see ADC-01 §2 alternative-considered).
- **Drizzle declaration:**

  ```ts
  import { pgTable, uuid, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
  import { jobs } from './jobs';
  import { users } from './users';

  export const jobEnrollments = pgTable(
    'job_enrollments',
    {
      jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
      activeId: uuid('active_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
      enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
      confirmedAttendee: timestamp('confirmed_attendee_at', { withTimezone: true }),  // non-null after CompleteJob; null otherwise
    },
    (table) => [
      primaryKey({ columns: [table.jobId, table.activeId] }),                  // ADC-01 INV-14 (one enrollment per Active per Job)
      index('job_enrollments_active_idx').on(table.activeId),                  // PRD-004 R-06 my-enrolled-jobs list
    ]
  );
  ```

- **Key behaviours:**
  1. Composite primary key enforces ADC-01 INV-14 (no double-enroll); re-enroll via tRPC is a no-op via `ON CONFLICT DO NOTHING` (CMD-04 handler).
  2. `confirmedAttendee` is set during CompleteJob (CMD-09) for the subset the Alumni confirms. Cleared on RevertCompletion (CMD-10) per PRD-005 R-05.
  3. ON DELETE CASCADE: if a Job or User is deleted, their enrollment rows go too. (User deletion is post-MVP per PRD-003 Q-02; included for completeness.)
- **Dependencies:** `jobs.ts`, `users.ts`.

### 4.6 `packages/db/schema/job-state-transitions.ts`

- **Purpose:** the per-job audit log table per ADR-009.
- **Drizzle declaration:**

  ```ts
  import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
  import { jobs } from './jobs';
  import { users } from './users';
  import { ACTOR_KINDS, type ActorKind } from './enums';

  export const jobStateTransitions = pgTable(
    'job_state_transitions',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
      fromState: text('from_state'),                                            // null for inception (PostJob)
      toState: text('to_state').notNull(),
      actorId: uuid('actor_id').references(() => users.id),                     // null for system actor
      actorKind: text('actor_kind').$type<ActorKind>().notNull(),
      note: text('note'),                                                       // free-text; dispute reason, resolution note, prior work date on reschedule, etc.
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      index('job_state_transitions_job_created_idx').on(table.jobId, table.createdAt),  // PRD-007 R-06 per-job timeline
      index('job_state_transitions_disputed_idx').on(table.createdAt).where(sql`${table.toState} = 'disputed'`),  // PRD-007 R-04 disputes drill-in
    ]
  );
  ```

- **Key behaviours:**
  1. Append-only by convention (no UPDATE / DELETE in app code). Forever-retention per ADR-009 Q-02 resolution.
  2. `fromState` is nullable to handle the inception event (PostJob, where there is no prior state).
  3. `actorId` is nullable to handle system actors (`actor_kind = 'system'`, e.g., the auto `approved → enrollment_open` transition in ADC-01 ST-05).
  4. The partial index on `to_state = 'disputed'` is the explicit optimisation called out in ADR-009 — keeps the disputes drill-in (PRD-007 R-04) fast even as the table grows.
- **Dependencies:** `jobs.ts`, `users.ts`, `enums.ts`.

### 4.7 `packages/db/schema/user-role-transitions.ts`

- **Purpose:** the role-change audit log per PRD-008 R-07. Mirrors the shape of `job_state_transitions` but for role changes.
- **Drizzle declaration:**

  ```ts
  import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
  import { users } from './users';
  import { ROLE_INITIATOR_KINDS, type RoleInitiatorKind, type Role } from './enums';

  export const userRoleTransitions = pgTable(
    'user_role_transitions',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),       // target
      fromRole: text('from_role').$type<Role>(),                                                    // null at signup (initial role assignment)
      toRole: text('to_role').$type<Role>().notNull(),
      initiatorId: uuid('initiator_id').references(() => users.id),                                 // null for system (BOOTSTRAP_ADMIN_EMAIL)
      initiatorKind: text('initiator_kind').$type<RoleInitiatorKind>().notNull(),
      note: text('note'),                                                                            // optional free text
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      index('user_role_transitions_user_created_idx').on(table.userId, table.createdAt.desc()),    // PRD-008 R-10 user history
    ]
  );
  ```

- **Key behaviours:** mirror of `job_state_transitions` shape; populated by a separate `transitionRole()` helper (DESIGN-002 §4.x).

### 4.8 `packages/db/schema/chapter-settings.ts`

- **Purpose:** the cross-cutting settings key-value store per ADR-010.
- **Drizzle declaration:**

  ```ts
  import { pgTable, text, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';
  import { users } from './users';

  export const chapterSettings = pgTable('chapter_settings', {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    updatedBy: uuid('updated_by').references(() => users.id),                  // null for env-var-derived initial inserts
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  });
  ```

- **Key behaviours:**
  1. Single-row-per-key pattern (key is PRIMARY KEY).
  2. `value` is jsonb so future settings can be structured (objects, arrays) without altering the table.
  3. Per ADR-010, app code reads via `getSetting(key)` which checks DB first, falls back to env var. The DB row "wins" once written.
- **Dependencies:** `users.ts`.

### 4.9 `packages/db/schema/index.ts`

- **Purpose:** barrel export.

  ```ts
  export * from './enums';
  export * from './users';
  export * from './invite-tokens';
  export * from './jobs';
  export * from './job-enrollments';
  export * from './job-state-transitions';
  export * from './user-role-transitions';
  export * from './chapter-settings';
  export * from './better-auth';     // session, account, verification — see §4.10
  ```

### 4.10 `packages/db/schema/better-auth.ts` — `session`, `account`, `verification`

- **Purpose:** Better Auth's three managed tables, declared in Drizzle so the rest of the codebase has typed access (especially `account` for credential introspection during the integration tests in `packages/auth/__tests__/integration/`).
- **Why declared here:** Better Auth's `drizzleAdapter` does NOT auto-create tables — it expects the schema to exist. Declaring them in `packages/db/src/schema/better-auth.ts` keeps the source of truth in one place and lets `drizzle-kit generate` emit the migrations.
- **Shape:** matches Better Auth 1.6.x's drizzle adapter exactly — refer to Better Auth's current docs at the version installed; do NOT improvise field names. Both `session.user_id` and `account.user_id` are `uuid REFERENCES users(id) ON DELETE CASCADE` so user deletion cleans up. `account.provider_id` is the discriminator (`'credential'` for app-managed users, `'google-workspace'` for SSO users); `account.account_id` is the provider-side identifier (the OIDC subject for SSO, the user's own id for app-managed); `account.password` holds the hash for `providerId: 'credential'` rows.
- **Key behaviours:**
  1. ADC-02 INV-04 (app-managed has password, SSO has linkage) is satisfied by the presence of an `account` row per user, NOT by any CHECK on `users`. PLAN-004's integration tests assert this.
  2. PRD-003 R-09 transparent account-linking: a returning SSO user whose email matches an existing app-managed user gets a new `account` row added (same `user_id`), provided the existing user's `users.email_verified` is `true`.
  3. `verification` holds Better Auth's email-verification + password-reset tokens; we don't read from it directly.
- **Dependencies:** `users.ts` (for the `user_id` FKs).

## 5. Migration / data shape

Migrations land in `packages/db/migrations/` per Drizzle convention. Generated by `drizzle-kit generate` from the schema declarations in §4, plus hand-written migrations for the trigger from ADR-011 (which Drizzle can't generate).

### 5.1 Initial migration (drizzle-kit generated)

`0001_init.sql` — creates all tables in §4 with their CHECK constraints and indexes. Generated automatically; reviewers verify it matches §4.

### 5.2 Required Postgres extensions

`0002_extensions.sql` — runs as a separate migration before any table creation:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- ADR-004 mentions; not yet used in §4 but reserved
```

### 5.3 Min-Admin invariant trigger (hand-written)

`0003_min_admin_trigger.sql` — implements ADR-011's deferred-CHECK trigger:

```sql
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
  AFTER INSERT OR UPDATE OF role OR DELETE ON users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_min_one_admin();
```

> **Important:** the trigger is `INITIALLY DEFERRED` so atomic-swap transactions (promote-then-demote in one BEGIN/COMMIT) succeed — see ADC-02 §4 + AC-05 in PRD-008.

### 5.4 Bootstrap migration

`0004_bootstrap_admin.sql` — empty placeholder. The actual Admin bootstrap happens at app boot via `BOOTSTRAP_ADMIN_EMAIL` env var (per ADR-002 + ADR-011 INV-03 recovery). Migration kept empty so it doesn't drift environments.

### 5.5 chapter_settings bootstrap

`0005_bootstrap_chapter_settings.sql` — seeds the five PRD-007 R-07 keys from env vars on first apply, so `getSetting()` calls in DESIGN-005 helpers never crash on a fresh deploy. Idempotent via `ON CONFLICT (key) DO NOTHING` — subsequent applies (e.g., re-runs in tests) are no-ops, and Admin edits via the Settings UI take precedence forever after.

```sql
-- Seeds chapter_settings from BOOTSTRAP_* env vars at first deploy.
-- ON CONFLICT DO NOTHING keeps Admin edits (made post-bootstrap) authoritative.
INSERT INTO chapter_settings (key, value) VALUES
  ('admin_recipient_email',      to_jsonb(coalesce(current_setting('app.bootstrap_admin_recipient_email',      true), 'admins@example.invalid'))),
  ('treasurer_recipient_email',  to_jsonb(coalesce(current_setting('app.bootstrap_treasurer_recipient_email',  true), 'treasurer@example.invalid'))),
  ('moderators_recipient_email', to_jsonb(coalesce(current_setting('app.bootstrap_moderators_recipient_email', true), 'mods@example.invalid'))),
  ('chapter_timezone',           to_jsonb(coalesce(current_setting('app.bootstrap_chapter_timezone',           true), 'America/New_York'))),
  ('chapter_display_name',       to_jsonb(coalesce(current_setting('app.bootstrap_chapter_display_name',       true), 'Your Chapter')))
ON CONFLICT (key) DO NOTHING;
```

> **Env-var → `current_setting()` plumbing:** drizzle-kit migrations run via a connection that sets the five `app.bootstrap_*` GUCs from process env vars (`BOOTSTRAP_ADMIN_RECIPIENT_EMAIL`, `BOOTSTRAP_TREASURER_RECIPIENT_EMAIL`, `BOOTSTRAP_MODERATORS_RECIPIENT_EMAIL`, `BOOTSTRAP_CHAPTER_TIMEZONE`, `BOOTSTRAP_CHAPTER_DISPLAY_NAME`) before applying. PLAN-002 owns this wiring. Bootstrap defaults (the `*.invalid` strings, `America/New_York`, `Your Chapter`) are deliberately recognizable as placeholders so a misconfigured deploy fails loudly on first email send rather than silently sending to a real address.

## 6. API contracts

N/A for this design — schema is data-at-rest only. APIs that read/write these tables are owned by:

- DESIGN-002 (FSM helper): all writes to `jobs.state` + `job_state_transitions`
- DESIGN-003 (tRPC procedures): all reads + writes via the API layer
- DESIGN-004 (auth wiring): writes to `users` + `invite_tokens` via Better Auth + invite-token verification middleware

## 7. Error handling

| Error | Source | Surface |
|-------|--------|---------|
| `users_role_enum` CHECK violation | bug — role-helper module is the typed source of truth | 500 with logged stack; tests should catch this |
| `users_account_kind` CHECK violation | bug — Better Auth + invite-token signup paths must always populate password OR oidc | 500 with logged stack |
| `min-Admin invariant violated` (ERRCODE `23514`) | legitimate — Admin attempting last-Admin demotion | 422 `MIN_ADMIN_INVARIANT_VIOLATED` per PRD-008 R-05; UI shows R-06 message + link |
| `jobs_state_enum` CHECK violation | bug — FSM helper should never produce an off-enum state | 500 with logged stack |
| `jobs_dues_positive` / `jobs_count_positive` / `jobs_description_non_empty` | legitimate — bypassed app validation | 400 with field-cited validation error (rare; app layer is the primary defender per PRD-002 R-02..R-04) |
| Foreign-key violation on `job_state_transitions.job_id` | bug — orphaned audit log row | 500 with logged stack; transaction rollback should prevent this |

## 8. Testing approach

- **Schema migrations applied successfully:** integration test in `packages/db/__tests__/migrations.test.ts` — applies all migrations to a fresh testcontainers PG16 instance and asserts no errors.
- **Constraint enforcement:** integration tests in `packages/db/__tests__/constraints.test.ts` — attempts known-bad inserts/updates and asserts the expected ERRCODEs (e.g., 23514 for min-Admin, 23514 for CHECK violations, 23505 for unique violations).
- **Idempotency:** the min-Admin trigger handles transactions correctly — a transaction that promotes B then demotes A succeeds at commit.
- **Atomic rollback:** failed transition transactions leave neither the state column nor the audit-log row mutated.

Per the project test-DB rule (`feedback_doc_conventions.md` / handoff): **no SQLite or MySQL substitution.** Tests run against PG16 via testcontainers.

## 9. Open questions

| ID | Question | Owner | Needed by |
|----|----------|-------|-----------|
| Q-DSG-01 | Should `jobs.state` migrate to a Postgres enum type post-walking-skeleton? Lean: **yes** once states stabilise — better introspection in psql, slightly tighter constraints. Migration is a few lines. | Design | Post-walking-skeleton |
| Q-DSG-02 | ~~Should the Better Auth tables (`sessions`, `accounts`, `verification`) live in a separate schema (e.g., `auth.*`) for clarity, or in `public.*` for simplicity?~~ **Resolved 2026-05-14 during PLAN-004 execution: `public.*`** — Better Auth's drizzleAdapter doesn't auto-namespace, our integration tests need direct access to `account` rows, and the table-count is small enough that schema isolation buys nothing. Declared in `packages/db/schema/better-auth.ts` (§4.10). | Design | ✅ Resolved 2026-05-14 |
| Q-DSG-03 | The `chapter_settings` table is currently chapter-wide with no chapter-scoping column. When we add multi-chapter support (post-MVP), this needs a `chapter_id` column or per-chapter schema. **Out of MVP scope** but flagged. | Design | When second chapter onboards |
| Q-DSG-04 | `jobs.per_active_dues_credit` as `jsonb` map vs. promoting to a join table (`job_dues_credits` rows)? Mirror of ADC-01 Q-AGG-04. Lean: **join table** for queryability ("show me all credits for Active A"). Will revise §4.4 if/when this lands. | Design | Before implementing PRD-005 |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Schema for the walking-skeleton subset across BCC-01 + BCC-02 + BCC-03 + cross-cutting tables. 8 tables, all CHECK constraints, indexes for the major query patterns (R-02 aggregate counts, R-04 disputes, R-06 / R-11 user lists, R-06 audit timeline). Min-Admin deferred-CHECK trigger from ADR-011 included as a hand-written migration. 4 design follow-up questions. |
| 2026-05-14 | Tom Haynes | §4.1: strengthened naming note to make the snake_case (wire/code) vs. hyphenated (PRD-001 R-07 display) convention explicit and to point at DESIGN-006 §4.6's `stateDisplayName()` formatter as the single conversion point. §5.5: added `0005_bootstrap_chapter_settings.sql` migration so the five PRD-007 R-07 settings are seeded from env vars on first deploy — closes the gap where `getSetting()` would crash on a fresh instance. |
| 2026-05-14 | Tom Haynes | **§4.2 reconciliation with Better Auth's actual data model.** Earlier draft had `password_hash` + `oidc_subject` + `oidc_provider` columns on `users` plus a `users_account_kind` CHECK — a scope-boundary leak past §2.2 which already cedes Better Auth's internal table layout to DESIGN-004. PLAN-004's execution surfaced that Better Auth 1.6.x stores credentials in its own `account` table (per provider row) and never writes to those `users` columns, so the CHECK would fail on every signup. Reshape: drop the three legacy columns + the CHECK; add `users.email_verified` (consumed by Better Auth's transparent account-linking check per PRD-003 R-09); declare Better Auth's `session` / `account` / `verification` tables in `packages/db/schema/better-auth.ts` (new §4.10) since the drizzleAdapter does NOT auto-create tables. ADC-02 INV-04 (app-managed has password, SSO has linkage) is now satisfied by the presence of an `account` row per user, asserted by PLAN-004's `packages/auth/__tests__/integration/`. §3 architecture diagram + schema-folder listing updated. Q-DSG-02 resolved (public.* schema for Better Auth tables). |
