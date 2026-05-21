# Prompt for Claude Code agent — Validate PLAN-003 (against VALIDATION-003)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js + tRPC + Drizzle + Postgres 16 + Better Auth + shadcn/ui + Playwright; self-hosted on `haynes-ops`). The docs-first SDLC pairs every implementation plan (`PLAN-NNN`) with a validation plan (`VALIDATION-NNN`); your job is the validation half for PLAN-003 (FSM module).

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/003-fsm-module-validation.md`'s §6 pass/fail gates against the PLAN-003 commit on the current branch. PLAN-003 produced `packages/domain/` with `job-state-machine.ts`, `user-role-transitions.ts`, `errors.ts`, and a comprehensive test suite covering all ADC-01 ST-01..ST-17 transitions plus the post-doc-review additions (`createJob.afterCommit`, `recordRelationshipEvent`). You run the gates, confirm each is green, and report. If a gate fails, you do **not** relax it — you either fix the implementation (small mechanical fixes only) or escalate.

The **single load-bearing assertion** to verify hard: `packages/domain/` is the sole writer of FSM-controlled columns and audit-log tables. The `no-direct-state-writes.test.ts` static-analysis test must pass; if it doesn't, PLAN-005 onward will silently bypass the FSM and break the audit-log invariant.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.**
2. `docs/plans/003-fsm-module-validation.md` — the validation contract. §3 coverage matrix, §4 unit + integration test list, §6 gate checklist.
3. `docs/plans/003-fsm-module-implementation.md` §3 Outputs, §5 Verification — the expected artifacts and commit shape.
4. `git log -1` — confirm PLAN-003's commit exists on the current branch before starting.

## What you do NOT do

- Do not modify any doc under `docs/` (plans, PRDs, ADRs, designs).
- Do not relax a gate to "make it pass." Small mechanical fixes are OK (missing dep, wrong path, typo, off-by-one in a test setup); anything bigger → **escalate to the user**.
- Do not weaken the `no-direct-state-writes.test.ts` static-analysis allowlist to make it pass. If it finds a real hit outside `packages/domain/`, the fix is in the offending file, not the test's allowlist.
- Do not substitute the test DB engine. PG16 via testcontainers is mandatory per ADR-004.
- Do not amend PLAN-003's commit. If an implementation fix is needed, create a new commit (`fix(domain): <what>`).
- Do not push to remote — the user pushes.

## Definition of done

Every box in VALIDATION-003 §6 green, verified by running the commands:

- [ ] `pnpm --filter @app/domain typecheck` exit code 0, INCLUDING the `// @ts-expect-error` directive on the illegal-transition smoke. If `@ts-expect-error` becomes unused, typecheck fails — that's intentional.
- [ ] `pnpm --filter @app/domain test` exit code 0 — all §4 suites:
  - `job-state-machine.test.ts` (unit; map completeness + type-narrowing + error class shape).
  - `integration/job-state-machine.integration.test.ts` (PG16; every ST-01..ST-17 + `createJob.afterCommit` swallow-on-throw + concurrent-race + transaction rollback + two-row pattern on `approveJob` + terminal-state rejection).
  - `integration/relationship-events.integration.test.ts` (PG16; enroll + unenroll happy paths + atomic rollback when `beforeAuditWrite` throws).
  - `integration/user-role-transitions.integration.test.ts` (PG16; last-Admin → `MinAdminInvariantError` + atomic-swap + zero-Admin recovery).
  - `no-direct-state-writes.test.ts` (static analysis; zero matches for the forbidden patterns outside `packages/domain/`).
- [ ] Coverage report (or your manual sampling) confirms >90% lines on `job-state-machine.ts`, `user-role-transitions.ts`, `errors.ts`.
- [ ] Repo-wide `pnpm -r typecheck` exit code 0 across all 7+ workspaces.
- [ ] PLAN-003's commit is on the branch with the expected message; no `docs/` files modified in that commit.

Report back (under 200 words): which gates passed, any implementation fixes you made (with new commit hash), and anything escalated.

## Specific things to look hard at

1. **The `no-direct-state-writes.test.ts` allowlist:** open it and read the exclusions. Migration `.sql` files are necessarily allowed (they're not TS source). Test-fixture files that seed state via direct INSERT are sometimes also allowed. Anything else should NOT be in the allowlist — if a test file in `packages/db/__tests__/` writes to `jobs.state` directly, that's a real violation that future PLAN-005 procedures could pattern-match against. Push back.
2. **Two-row `approveJob` audit pattern:** run `pnpm --filter @app/domain test --grep approveJob` and read the assertions. The test must confirm BOTH rows exist in `job_state_transitions` for the same `jobId`, both within the same transaction window (created_at delta sub-100ms), with the expected `actor_kind` values (`'user'` and `'system'`). If the test only asserts the final state and one row, that's a hole.
3. **`recordRelationshipEvent` rollback semantics:** the test forces `beforeAuditWrite` to throw and asserts BOTH no `job_enrollments` row AND no `job_state_transitions` row landed. If either landed, the transaction wasn't atomic — escalate.
4. **Min-Admin atomic-swap (PRD-008 AC-05):** the test wraps promote+demote in a SINGLE `db.transaction(async (tx) => { ... })` block calling `transitionRole` twice. The deferred trigger fires at COMMIT and passes. If split across two transactions, the test is wrong — flag.
5. **`createJob.afterCommit` swallow-on-throw:** the test provides a callback that throws and asserts (a) `createJob` resolves successfully (the row + audit are committed), (b) some log appears (spy on `console.error`). If the callback failure propagates as a rejection, the test is wrong; if the row is missing, the transaction wasn't committed before the hook ran.

## If a gate fails

1. **Mechanical fix (allowed):** typo in test expectation, missing import, wrong PG-error-substring match — fix in the implementation or the test setup (NOT the assertion logic), re-run the gate, create a new `fix(domain): …` commit.
2. **Static-analysis violation:** if `no-direct-state-writes.test.ts` finds a hit outside `packages/domain/`, the fix is in the OFFENDING file (most likely a test fixture or `apps/web` route). Do NOT silence the test.
3. **Plan/validation ambiguity:** escalate to the user with: (1) the gate, (2) the exact mismatch, (3) your lean.
4. **Test reveals an upstream design problem:** do not edit the design — surface to the user.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Begin.
