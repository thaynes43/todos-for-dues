# Prompt for Claude Code agent — Validate PLAN-002 (against VALIDATION-002)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js + tRPC + Drizzle + Postgres 16 + Better Auth + shadcn/ui + Playwright; self-hosted on `haynes-ops`). The docs-first SDLC pairs every implementation plan (`PLAN-NNN`) with a validation plan (`VALIDATION-NNN`); your job is the validation half for PLAN-002 (database schema).

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/002-database-schema-validation.md`'s §6 pass/fail gates against the PLAN-002 commit on the current branch. PLAN-002 produced: lazy-Proxy `db` client, 8 Drizzle schema files, 4 migrations (extensions, init, min-Admin trigger, chapter_settings bootstrap), and integration tests. You run the gates, confirm each is green, and report. If a gate fails, you do **not** relax it — you either fix the implementation (small, mechanical fixes only) or escalate.

Your test surface is bigger than VALIDATION-001's: there are 5+ integration test files (migrations, constraints, min-Admin invariant, idempotency, chapter_settings bootstrap, enums). Run them all, then run the cross-cutting gates.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.**
2. `docs/plans/002-database-schema-validation.md` — the validation contract. §3 coverage matrix, §4 unit-test list, §6 gate checklist.
3. `docs/plans/002-database-schema-implementation.md` §3 Outputs, §5 Verification — the expected artifacts and commit shape.
4. `git log -1` — confirm PLAN-002's commit exists on the current branch before starting.

## What you do NOT do

- Do not modify any doc under `docs/` (plans, PRDs, ADRs, designs).
- Do not relax a gate to "make it pass." Small mechanical fixes to the implementation are OK (missing dep, wrong path, typo, off-by-one in a CHECK constraint message); anything bigger → **escalate to the user**.
- Do not substitute the test DB engine. PG16 via testcontainers is mandatory per ADR-004 — if the testcontainers setup is missing, escalate; do not write a SQLite shim.
- Do not amend PLAN-002's commit. If an implementation fix is needed, create a new commit (`fix(db): <what>`).
- Do not push to remote — the user pushes.

## Definition of done

Every box in VALIDATION-002 §6 green, verified by running the commands:

- [ ] `pnpm --filter @app/db typecheck` exit code 0.
- [ ] `pnpm --filter @app/db test` exit code 0 — all suites in §4 pass:
  - migrations test asserts 7 application tables + pgcrypto extension + trigger function exist
  - constraints test covers every CHECK in DESIGN-001 §4
  - min-Admin invariant test covers single-Admin demotion + atomic-swap + zero-Admin recovery
  - idempotency test covers job_enrollments composite PK + ON CONFLICT DO NOTHING
  - chapter_settings bootstrap test covers env-var-derived seeding via `app.bootstrap_*` GUCs (DESIGN-001 §5.5) + idempotency (re-run no-op)
  - enums test asserts the TypeScript enum arrays match the CHECK constraint enumerations
- [ ] `pnpm --filter @app/db drizzle-kit migrate` against a fresh PG16 testcontainer applies all migrations in order with no errors; running migrations a second time is a no-op.
- [ ] In a psql session against the migrated DB: `\dt` shows 7 application tables; `\df assert_min_one_admin` shows the trigger function; `SELECT count(*) FROM chapter_settings` returns 5.
- [ ] Repo-wide `pnpm typecheck` clean.
- [ ] **VALIDATION-001 follow-up:** `unset DATABASE_URL && pnpm --filter web build` exits 0 (proves PLAN-002 Step 0's Proxy refactor of `packages/db/src/index.ts` defers the throw past build-time). With `DATABASE_URL` set, `pnpm dev` boots and the placeholder app still works.
- [ ] PLAN-002's commit is on the branch with the expected message; no doc files modified.

Report back (under 200 words): which gates passed, any implementation fixes you made (with new commit hash), and anything escalated.

## Specific things to look hard at

1. **Min-Admin trigger atomic-swap (PRD-008 AC-05):** the test must wrap promote + demote in a SINGLE `db.transaction(async (tx) => { ... })` block. If the trigger fires per-row (immediate), the test fails. The trigger MUST be `DEFERRABLE INITIALLY DEFERRED`. If this gate fails, inspect the trigger SQL — is it really `INITIALLY DEFERRED`?
2. **Chapter_settings bootstrap:** the 5 MVP keys must land via `current_setting('app.bootstrap_*', true)` lookups. Verify by setting `app.bootstrap_admin_recipient_email = 'admins@test.invalid'` (and the other 4 GUCs) before migrate; assert the values land. Also verify defaults (the `*.invalid` strings) land when GUCs are unset.
3. **Better Auth's tables are NOT in this plan's scope.** Don't fail the migrations test for missing `sessions` / `accounts` / `verification` — those come in PLAN-004. The migrations test asserts 7 application tables, not 7+.
4. **Build-without-env gate:** Step 0's Proxy refactor. Run `unset DATABASE_URL && pnpm --filter web build` from a clean shell (not within a `.env`-loaded one); exit code must be 0.

## If a gate fails

1. **Mechanical fix (allowed):** missing dev-dependency, path typo, CHECK constraint enum mismatch with the TS enum — fix in the implementation, re-run the gate, create a new `fix(db): …` commit.
2. **Plan/validation ambiguity (escalate):** the plan says X but the design says Y, or VALIDATION-002 cites a file path that doesn't match what PLAN-002 produced — stop and ask the user with: (1) the gate that failed, (2) the exact mismatch, (3) your lean.
3. **Test reveals an upstream design problem (escalate):** do not edit the design — surface to the user.
4. **Min-Admin trigger fires immediately instead of deferred:** verify the SQL is `DEFERRABLE INITIALLY DEFERRED`. If correct in SQL but the test still fails, the test may be wrapping wrong — fix the test setup, not the trigger.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Begin.
