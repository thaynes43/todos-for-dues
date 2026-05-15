---
id: VALIDATION-002
title: Validation — PLAN-002 database schema implementation
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: S
related:
  prds: [PRD-001, PRD-002, PRD-003, PRD-004, PRD-005, PRD-006, PRD-007, PRD-008]
  adrs: [ADR-004, ADR-009, ADR-010, ADR-011]
  designs: [DESIGN-001]
  plans:
    pairs_with: PLAN-002
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-002's schema implementation: 8 tables with the constraints + indexes + the deferred-CHECK min-Admin trigger from DESIGN-001 applied cleanly to a fresh Postgres 16. Every CHECK constraint exercised; the trigger's atomic-swap edge case (PRD-008 AC-05) passes; the `chapter_settings` bootstrap migration seeds the 5 MVP keys.

## 2. Inputs

- **Paired implementation plan:** `docs/plans/002-database-schema-implementation.md`.
- **PRDs / designs:**
  - `docs/designs/001-database-schema.md` §4 (table-by-table contract), §5 (migrations).
  - `docs/prds/008-role-management.md` §5 R-05 + AC-04..AC-05 (min-Admin invariant + atomic swap — the load-bearing trigger test).
  - `docs/prds/001-todos-for-dues-overview.md` R-15 (audit-log row shape persistence), R-16 (min-Admin invariant).
  - `docs/domain-driven-design/aggregates/001-job-aggregate-canvas.md` §4 — INV-01, INV-02, INV-03, INV-14 are enforced at the DB layer here.
  - `docs/domain-driven-design/aggregates/002-user-aggregate-canvas.md` §4 — INV-01..INV-04.
- **Running artifacts:** the migrations PLAN-002 lands; testcontainers PG16 instance (ADR-004 test-DB rule).

## 3. Coverage matrix

| PRD R-NN / AC-NN / DESIGN-§ | Unit/integration test | Test file |
|---|---|---|
| PRD-001 R-15 (audit-log persistence) | applying migrations creates `job_state_transitions` with the columns from DESIGN-001 §4.6 | `packages/db/__tests__/migrations.test.ts` |
| PRD-001 R-16 (min-Admin invariant) | last-Admin demotion via direct UPDATE → ERRCODE `23514` | `packages/db/__tests__/min-admin-invariant.test.ts` |
| PRD-002 R-02 (positive dues) | `INSERT … dues_amount = 0` → ERRCODE `23514` (CHECK `jobs_dues_positive`) | `packages/db/__tests__/constraints.test.ts` |
| PRD-002 R-03 (non-empty description) | `INSERT … description = ''` → ERRCODE `23514` (CHECK `jobs_description_non_empty`) | same |
| PRD-002 R-04 (recommended count ≥ 1) | `INSERT … recommended_people_count = 0` → ERRCODE `23514` | same |
| PRD-003 R-09 (account linking — INV-04 from ADC-02) | `INSERT users WITH password_hash=NULL AND oidc_subject=NULL` → ERRCODE `23514` (`users_account_kind`) | same |
| PRD-003 R-10 (display name required) | `INSERT users WITH display_name=NULL` → NOT NULL violation `23502` | same |
| PRD-004 R-02 (idempotent enroll — INV-14) | `INSERT job_enrollments` twice with same `(job_id, active_id)` → PK violation `23505`; `ON CONFLICT DO NOTHING` succeeds | `packages/db/__tests__/idempotency.test.ts` |
| PRD-007 R-07 (chapter_settings shape + bootstrap) | after applying all migrations, `SELECT key FROM chapter_settings` returns the 5 MVP keys (per DESIGN-001 §5.5) | `packages/db/__tests__/chapter-settings-bootstrap.test.ts` |
| PRD-008 R-05 (min-Admin DB enforcement) | demote-only-Admin → `23514` | `packages/db/__tests__/min-admin-invariant.test.ts` |
| PRD-008 AC-05 (atomic swap) | promote B to Admin AND demote A in one tx → succeeds at COMMIT | same |
| PRD-008 R-07 (`user_role_transitions` shape) | applying migrations creates the table with columns per DESIGN-001 §4.7 | `packages/db/__tests__/migrations.test.ts` |
| DESIGN-001 §4.1 (enums) | the `JOB_STATES`, `ROLES`, `ACTOR_KINDS`, `ROLE_INITIATOR_KINDS` arrays match the CHECK lists in §4.2..§4.7 | `packages/db/__tests__/enums.test.ts` |
| DESIGN-001 §4.2 (users) | role default 'Active'; CHECK on role enum; unique email | `packages/db/__tests__/constraints.test.ts` |
| DESIGN-001 §4.4 (jobs) | every CHECK + the two indexes (`jobs_state_idx`, `jobs_posted_by_created_at_idx`) | same + `\d+ jobs` post-migration assertion |
| DESIGN-001 §4.5 (job_enrollments) | composite PK + ON DELETE CASCADE on both FKs | `packages/db/__tests__/idempotency.test.ts` |
| DESIGN-001 §4.6 (job_state_transitions) | partial index on `to_state = 'disputed'` exists; FK to jobs with ON DELETE CASCADE | `packages/db/__tests__/constraints.test.ts` (EXPLAIN check) |
| DESIGN-001 §4.7 (user_role_transitions) | index on `(user_id, created_at desc)` | same |
| DESIGN-001 §4.8 (chapter_settings) | jsonb value column; `updated_by` FK to users | bootstrap test + manual `\d+ chapter_settings` |
| DESIGN-001 §5.2 (extensions) | `pgcrypto` extension present after migration | `migrations.test.ts` asserts `SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'` returns one row |
| DESIGN-001 §5.3 (min-Admin trigger) | trigger function `assert_min_one_admin` exists + is `INITIALLY DEFERRED` | `min-admin-invariant.test.ts` + `SELECT tgname FROM pg_trigger` |
| DESIGN-001 §5.5 (chapter_settings bootstrap) | env-var `BOOTSTRAP_*` values populate the 5 keys via `current_setting('app.bootstrap_*')` GUCs | `chapter-settings-bootstrap.test.ts` |
| BCC-02 CMD-NN | n/a (DB layer only — CMD-NN are tested in VALIDATION-003 + VALIDATION-005) | — |

## 4. Unit tests

All integration-style; PG16 via testcontainers per ADR-004. Test files PLAN-002 already names + the additional bootstrap test:

**`packages/db/__tests__/migrations.test.ts`**
- `it('applies cleanly to a fresh Postgres')` — drizzle-kit migrate produces all 7 application tables (the 7 listed in PLAN-002 Step 4) plus the Better Auth tables (which appear later when auth ships; PLAN-002 only owns the 7 application tables — Better Auth's own tables are not in scope for this validation).
- `it('installs pgcrypto')` — `SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'` returns 1 row.
- `it('creates the min-Admin trigger')` — `SELECT tgname FROM pg_trigger WHERE tgname = 'trg_min_one_admin'` returns 1 row; `tgdeferrable = true`.

**`packages/db/__tests__/constraints.test.ts`**
- Per-CHECK: one test per CHECK in DESIGN-001 §4 — assert ERRCODE `23514` on violating insert.
- `it('rejects duplicate user email')` — ERRCODE `23505`.
- `it('cascades job_enrollments on user delete')` — delete user → enrollment row gone.
- `it('cascades job_enrollments on job delete')` — delete job → enrollment row gone.
- `it('partial index on job_state_transitions disputed')` — EXPLAIN query for `WHERE to_state = 'disputed'` shows index use (best-effort; index hints vary).

**`packages/db/__tests__/min-admin-invariant.test.ts`**
- `it('rejects demoting only Admin')` — single Admin exists; demote → 23514.
- `it('allows atomic swap of Admin')` — single tx promotes B + demotes A → COMMIT succeeds (PRD-008 AC-05).
- `it('allows demote when 2+ Admins exist')` — sanity.
- `it('rejects DELETE of only Admin')` — delete row → 23514.
- `it('allows BOOTSTRAP_ADMIN_EMAIL recovery')` — start with no Admins (set everyone to Active via direct UPDATE WHERE bypassing the trigger via `SET CONSTRAINTS ALL DEFERRED` + manual delete-then-insert pattern); promote one user to Admin → 23514 not raised at commit (count is now 1).

**`packages/db/__tests__/idempotency.test.ts`**
- `it('rejects duplicate enrollment (composite PK)')` — second insert same `(jobId, activeId)` → 23505.
- `it('accepts second insert with ON CONFLICT DO NOTHING')` — INSERT … ON CONFLICT DO NOTHING returns 0 rows affected but no error.
- `it('accepts multiple job_state_transitions per jobId')` — append-only log.

**`packages/db/__tests__/chapter-settings-bootstrap.test.ts`** *(new — DESIGN-001 §5.5 surface)*
- Set `app.bootstrap_admin_recipient_email = 'admins@test.invalid'` (and the other 4 GUCs) before migrating; assert `SELECT key, value FROM chapter_settings ORDER BY key` returns the 5 expected rows with the configured values.
- Without the GUCs set, assert the default fallback values (`*.invalid`, `America/New_York`, `Your Chapter`) land per DESIGN-001 §5.5.
- Re-run migrations (idempotency check) — no error, no duplicate rows, existing values not overwritten (ON CONFLICT DO NOTHING).

**`packages/db/__tests__/enums.test.ts`** *(new — DESIGN-001 §4.1 surface)*
- Import the enum arrays from `@app/db/schema`; assert each array matches the CHECK constraint enumerations from the migration SQL by parsing the generated migration file or by re-running each enum value through an insert/select round-trip.

## 5. Playwright E2E tests

**None.** Schema is data-at-rest; UI tests land in VALIDATION-006 / -010 / -011 / -012.

## 6. Pass/fail gates

- [ ] `pnpm --filter @app/db typecheck` passes.
- [ ] `pnpm --filter @app/db test` passes all suites in §4.
- [ ] `pnpm --filter @app/db drizzle-kit migrate` against a freshly-spun-up testcontainers PG16 applies all migrations in order with no errors; running migrations a second time is a no-op (idempotent).
- [ ] After migrations, in a psql session: `\dt` shows 7 application tables; `\df assert_min_one_admin` shows the trigger function; `SELECT count(*) FROM chapter_settings` returns 5.
- [ ] No new TypeScript errors (`pnpm typecheck` repo-wide).
- [ ] One PLAN-002 commit on the branch.

## 7. Resume notes

Tests are independent and each spins up its own testcontainer (or shares one via `beforeAll`). If interrupted, re-run the failing test file. The migration set is idempotent; re-applying mid-test is safe.

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-002. Covers every CHECK in DESIGN-001 §4, the min-Admin trigger + atomic-swap edge case, and the chapter_settings bootstrap migration from §5.5. PG16 via testcontainers per ADR-004. |
