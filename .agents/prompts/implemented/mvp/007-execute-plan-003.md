# Prompt for Claude Code agent — Execute PLAN-003 (FSM module)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). Launch chapter: Sigma Phi Omicron, UMass Lowell. **Current state:** PLAN-001 (scaffolding) and PLAN-002 (DB schema — 8 tables + 4 migrations + min-Admin trigger + chapter_settings bootstrap + drizzle-zod schemas) are committed. PLAN-003 produces the FSM module — the *single* mutation chokepoint for `jobs.state` + `users.role` + the audit-log tables.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/003-fsm-module-implementation.md` end-to-end, then verify against the pass/fail gates in `docs/plans/003-fsm-module-validation.md`. You produce: `packages/domain/` with `job-state-machine.ts` (the typed transitions map + `transitionJob` + `createJob` with `afterCommit` + `approveJob` + `recordRelationshipEvent`), `user-role-transitions.ts` (`transitionRole` with min-Admin error mapping), `errors.ts` (typed error classes), and the integration test suite that exercises every ADC-01 ST-01..ST-17 + concurrent-race + transaction rollback + min-Admin atomic-swap.

**The load-bearing invariant of this plan:** after PLAN-003 ships, NO code outside `packages/domain/` writes to `jobs.state`, `users.role`, `job_state_transitions`, or `user_role_transitions`. VALIDATION-003 §4 includes a static-analysis test (`no-direct-state-writes.test.ts`) that grep/AST-checks this — you MUST implement it. Every state-changing tRPC procedure in PLAN-005 will route through your helpers.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.**
2. `docs/plans/003-fsm-module-implementation.md` — the plan. §3 Outputs, §4 Steps 1–8 (Step 2 is the load-bearing FSM module incl. §4.1.5 `recordRelationshipEvent`), §5 verification, §8 resume points.
3. `docs/plans/003-fsm-module-validation.md` — the validation gates. §4 enumerates the unit + integration tests by file; §6 is the gate checklist.
4. `docs/designs/002-fsm-module.md` §4.1 (transitions map + `transitionJob`), **§4.1.3** (`createJob` with `afterCommit` — the PRD-002 R-12 moderator-queue hook depends on this), **§4.1.5** (`recordRelationshipEvent` — single writer for enroll/unenroll audit rows), §4.2 (`transitionRole` + min-Admin catch), §4.3 (errors), §8 (testing approach).
5. `docs/domain-driven-design/aggregates/001-job-aggregate-canvas.md` §3 (ST-01..ST-17 the helpers cover) + §4 (INV-NN they enforce) — skim only.
6. `docs/adrs/011-role-partition-in-better-auth.md` §Decision-outcome — for context on the `MinAdminInvariantError` mapping path.

**What's already in the repo you can rely on:**
- `import { db, getPool } from '@app/db'` — Proxy-based lazy `db` (PLAN-002 Step 0 refactor); safe to import at module top level.
- `import { jobs, jobEnrollments, jobStateTransitions, users, userRoleTransitions, JOB_STATES, ROLES, type JobState, type Role, type ActorKind } from '@app/db/schema'` — all 8 tables + enum constants/types ready.
- `import { runMigrations } from '@app/db/migrate'` — call from `beforeAll` in integration tests to seed a fresh testcontainer.
- `@app/test-utils.startPostgres()` — testcontainers helper from PLAN-001.

## What you do NOT do

- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans, DDD). If a design ambiguity blocks you, **escalate to the user** — do not improvise.
- Do not skip ahead into PLAN-004+ scope (no Better Auth changes, no tRPC procedures, no UI, no notifications).
- Do not write any `UPDATE jobs SET state =` / `UPDATE users SET role =` / `INSERT INTO job_state_transitions` / `INSERT INTO user_role_transitions` outside `packages/domain/`. Your static-analysis test enforces this.
- Do not substitute the test DB engine. PG16 via testcontainers is mandatory per ADR-004.
- Do not commit until §5 + VALIDATION-003 §6 gates are all green.
- Do not push to remote — the user pushes.

## Definition of done

Every box in VALIDATION-003 §6 green:

- `pnpm --filter @app/domain typecheck` succeeds **including the `// @ts-expect-error` directive** on the illegal-transition assertion (DESIGN-002 §8). If TS stops emitting the expected error, the directive fails the typecheck — that's the assertion.
- `pnpm --filter @app/domain test` passes all unit + integration suites:
  - `job-state-machine.test.ts` — map completeness + type narrowing.
  - `integration/job-state-machine.integration.test.ts` — every ST-01..ST-17 transition + `createJob.afterCommit` swallow-on-throw + concurrent-race (`Promise.allSettled` — exactly one fulfilled, one `ConcurrentTransitionError`) + transaction rollback + two-row pattern on `approveJob` + terminal-state rejection.
  - `integration/relationship-events.integration.test.ts` — `recordRelationshipEvent` happy paths + atomic rollback when `beforeAuditWrite` throws.
  - `integration/user-role-transitions.integration.test.ts` — last-Admin demotion → `MinAdminInvariantError` + atomic-swap succeeds + `BOOTSTRAP_ADMIN_EMAIL`-style zero-Admin recovery.
  - `no-direct-state-writes.test.ts` — static grep/AST check that no `UPDATE jobs SET state` / `UPDATE users SET role` / `INSERT INTO job_state_transitions` / `INSERT INTO user_role_transitions` exists outside `packages/domain/`.
- Coverage report shows >90% on `job-state-machine.ts`, `user-role-transitions.ts`, `errors.ts`.
- Repo-wide `pnpm typecheck` clean.
- One commit matching PLAN-003 §3's commit message.

Report back (under 200 words): commit hash, anything escalated, any open Q-PLN-NN with your lean.

## Specific traps to watch for

1. **`recordRelationshipEvent` is the post-doc-review addition that PLAN-003 §3 + Step 2 explicitly call out.** Don't skip it — PLAN-005's `jobs.enroll` / `jobs.unenroll` depend on it. Per DESIGN-002 §4.1.5: `fromState == toState == currentState`; `note` carries `'enroll'` or `'unenroll'`. It's a SIBLING to `transitionJob`, not part of it — different file or clearly separated section.
2. **`createJob.afterCommit` (DESIGN-002 §4.1.3):** the optional callback runs AFTER the transaction commits and swallows-on-throw (logs but doesn't propagate). PLAN-002 R-12 moderator-queue email + PLAN-005's `jobs.post` rely on this hook.
3. **The two-row pattern on `approveJob`:** one transaction writes ST-03 (user-actor, `awaiting_moderation → approved`) AND ST-05 (system-actor, `approved → enrollment_open`). The persisted `jobs.state` post-`approveJob` is `enrollment_open`, never `approved`. Verify the audit-row count + actor_kind assertions in the integration test.
4. **Min-Admin error mapping** is by `ERRCODE = '23514'` AND message substring `'min-Admin'` (DESIGN-002 §4.2's `.catch()` block, DESIGN-002 §4.3 `isPostgresCheckViolation`). The PG trigger uses this exact message text from DESIGN-001 §5.3 — verify the substring match works.
5. **Concurrent-race test:** use `await Promise.allSettled([...])` and assert one fulfilled + one rejected with `ConcurrentTransitionError`. Optimistic concurrency is enforced via the `WHERE state = expectedFromState` clause in the UPDATE (DESIGN-002 §4.1.2) — if zero rows updated, throw.
6. **The static-analysis test** is the load-bearing invariant for the whole project. It can be a small grep-based Vitest that scans the repo for the forbidden patterns and asserts no matches outside `packages/domain/`. If you find existing matches in PLAN-001/002 (you shouldn't — PLAN-002's migration scripts contain raw SQL but they're in `.sql` files, not `.ts`), exclude them deliberately with a documented allowlist.

## If you get stuck

If a step's verification fails AND it's not obviously a copy-paste fix in your code, **escalate to the user** with: (1) which step, (2) the exact error, (3) what you tried, (4) your lean. Do not invent product or architectural decisions. Do not modify the design.

Begin.
