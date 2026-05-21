# Prompt for Claude Code agent — Execute PLAN-002 (database schema)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). Launch chapter: Sigma Phi Omicron, UMass Lowell. **Current state:** PLAN-001's scaffolding is committed (`pnpm install && pnpm typecheck && pnpm test` all green; placeholder app boots; no business logic yet). PLAN-002 is the first plan to land actual schema.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/002-database-schema-implementation.md` end-to-end, then verify against the pass/fail gates in `docs/plans/002-database-schema-validation.md`. You produce: the 8 Drizzle schema files for the walking-skeleton subset, the initial migration, the pgcrypto-extension migration, the deferred-CHECK min-Admin trigger migration, the chapter_settings bootstrap migration, and the integration tests that exercise every CHECK constraint + the trigger's atomic-swap edge case (PRD-008 AC-05).

**Step 0 is load-bearing:** PLAN-002 §4 Step 0 refactors `packages/db/src/index.ts` from PLAN-001's eager `if (!DATABASE_URL) throw …` to a Proxy-based lazy `db`. This is a carryover from VALIDATION-001 — Next.js's build-time module trace blocks `pnpm --filter web build` and the Docker build stage in PLAN-009 if the throw is eager. Do Step 0 first.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Honour every feedback memory (ask-don't-invent, brief responses, doc conventions, skip-confirm-when-strong, test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution**).
2. `docs/plans/002-database-schema-implementation.md` — the plan. §3 Outputs, §4 Steps (Step 0 = lazy-Proxy refactor; Steps 1–7 = schema + migrations + tests + commit), §5 verification, §8 resume points.
3. `docs/plans/002-database-schema-validation.md` — the validation gates you must satisfy.
4. `docs/designs/001-database-schema.md` §3 (folder layout), §4 (table-by-table contract), §5 (migrations incl. §5.3 min-Admin trigger, §5.5 chapter_settings bootstrap).
5. `docs/adrs/011-role-partition-in-better-auth.md` §Decision-outcome — deferred-CHECK trigger SQL (verbatim in DESIGN-001 §5.3).
6. `docs/adrs/004-db-and-orm.md` — test-DB rule (PG16 via testcontainers; no SQLite substitution).
7. `docs/domain-driven-design/aggregates/001-job-aggregate-canvas.md` §4 (INV-NN that this schema enforces at the DB layer) — skim only.

## What you do NOT do

- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans, DDD, releases). If a plan step contradicts a design, **escalate to the user** — do not improvise.
- Do not skip ahead into PLAN-003+ scope (no FSM helpers in `packages/domain/`, no tRPC procedures in `packages/api/`, no UI changes).
- Do not substitute the test DB engine. PG16 via testcontainers is mandatory per ADR-004.
- Do not commit until §5 + VALIDATION-002 §6 gates are all green.
- Do not push to remote — the user pushes.

## Definition of done

Every box in VALIDATION-002 §6 green:

- `pnpm --filter @app/db typecheck` succeeds.
- `pnpm --filter @app/db test` passes all suites: migrations, constraints, min-Admin invariant (including atomic-swap), idempotency, chapter_settings bootstrap, enums.
- `pnpm --filter @app/db drizzle-kit migrate` against a fresh PG16 testcontainer applies all migrations in order (extensions → init → trigger → bootstrap); re-running is a no-op (idempotent).
- After migrations, psql shows the 7 application tables, the `assert_min_one_admin` trigger function, and 5 rows in `chapter_settings`.
- Repo-wide `pnpm typecheck` clean.
- **VALIDATION-001 follow-up gate:** `unset DATABASE_URL && pnpm --filter web build` exits 0 (proves Step 0's Proxy refactor unblocked the build path).
- One commit matching PLAN-002 §3's commit message.

Report back (under 200 words): commit hash, anything escalated, any open Q-PLN-NN with your lean.

## Specific traps to watch for

1. **Migration ordering:** PLAN-002 Step 3 calls out that `pgcrypto` (extension) MUST run before `0001_init.sql` (which uses `gen_random_uuid()`). Drizzle's filename-based ordering means: extensions = `0001`, init = `0002`, trigger = `0003`, chapter_settings bootstrap = `0004` (or use Drizzle's `meta/_journal.json` to enforce order). Document your chosen ordering in the commit message.
2. **Min-Admin trigger MUST be `DEFERRABLE INITIALLY DEFERRED`:** if it fires per-row instead of at COMMIT, the atomic-swap test (PRD-008 AC-05) fails. Copy DESIGN-001 §5.3 SQL verbatim.
3. **`current_setting('app.bootstrap_*', true)`:** the chapter_settings bootstrap migration reads env-var-derived GUCs. PLAN-002's wiring of `BOOTSTRAP_*` env → `app.bootstrap_*` GUC before drizzle-kit migrate runs is part of Step 3 (see DESIGN-001 §5.5 "Env-var → current_setting() plumbing" note).
4. **Better Auth's own tables (`sessions`, `accounts`, `verification`)** are NOT in this plan's scope. Better Auth's `drizzleAdapter` creates them on first call to `auth.handler` (PLAN-004 territory). Your migrations test asserts 7 application tables, not 7+Better-Auth's.

## If you get stuck

If a step's verification fails AND it's not obviously a copy-paste fix in your code, **escalate to the user** with: (1) which step, (2) the exact error, (3) what you tried, (4) your lean. Do not invent product or architectural decisions. Do not modify the design.

Begin.
