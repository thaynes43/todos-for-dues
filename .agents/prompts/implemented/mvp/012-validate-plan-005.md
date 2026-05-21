# Prompt for Claude Code agent — Validate PLAN-005 (against VALIDATION-005)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright). The docs-first SDLC pairs every implementation plan (`PLAN-NNN`) with a validation plan (`VALIDATION-NNN`); your job is the validation half for PLAN-005 (tRPC procedures across 5 routers).

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/005-trpc-procedures-validation.md`'s §6 pass/fail gates against the PLAN-005 commit(s) on the current branch. PLAN-005 produced `packages/api/` with `trpc.ts` + 3 middleware files + 5 routers + `dues.ts` + per-router integration tests + an API-level walking-skeleton E2E. You run the gates, confirm each is green, and report. If a gate fails, you do **not** relax it — small mechanical fixes only, otherwise escalate.

The **cross-plan invariant** is non-negotiable: PLAN-003's `no-direct-state-writes.test.ts` MUST still pass. PLAN-005 is the largest consumer of `@app/domain`'s FSM helpers; if any procedure short-circuits the helpers, future PRD-008 + audit-log behavior is silently broken. The allowlist must NOT have grown to include `packages/api/` paths.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.**
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root context, especially "Domain invariant — FSM-only state writes."
3. `docs/plans/005-trpc-procedures-validation.md` — validation contract. §3 coverage matrix (procedure × PRD AC), §4 per-router test inventory, §6 gate checklist.
4. `docs/plans/005-trpc-procedures-implementation.md` §3 Outputs, §5 Verification — expected artifacts and commit shape.
5. `git log -10 --oneline` — confirm PLAN-005 commit(s) exist; read each commit message; the execution agent should have noted which procedures use which `@app/domain` helper.

## What you do NOT do

- Do not modify any doc under `docs/` (plans, PRDs, ADRs, designs).
- Do not relax a gate. Small mechanical fixes are OK (missing dep, wrong path, Zod schema typo, error-code mapping miss); anything bigger → **escalate to the user**.
- Do not add `packages/api/` paths to PLAN-003's static-analysis allowlist if it fires — the fix is in the offending procedure (route through `@app/domain`), not in the test.
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not amend PLAN-005's commit(s). If an implementation fix is needed, create a new commit (`fix(api): <what>`).
- Do not push to remote — the user pushes.

## Definition of done

Every box in VALIDATION-005 §6 green, verified by running the commands:

- [ ] `pnpm --filter @app/api typecheck` exit code 0.
- [ ] `pnpm --filter @app/api test` exit code 0 — all integration suites:
  - `jobs.test.ts` — one happy + one auth-rejection test per procedure (16 commands + 8 queries); the specific PRD ACs called out in VALIDATION-005 §3 (post / approve / reject / enroll / unenroll / lock / reschedule / cancel / complete / revert / markPaymentSent / confirmReceipt + race / dispute / resolveDispute* / list views).
  - `users.test.ts` — self-service Active ↔ Alumni; self-elevation rejected by Zod (400, not 403); Admin grant Moderator; last-Admin self-demote returns 422 `MIN_ADMIN_INVARIANT_VIOLATED`; role-history rendered in descending order.
  - `settings.test.ts` — each of the 5 MVP keys round-trips; invalid email rejected.
  - `admin.test.ts` — aggregate counts match seed; listDisputed returns expected shape; non-Admin gets 403.
  - `invites.test.ts` — Admin generates Active + Alumni tokens; revoke flips `revokedAt`; non-Admin gets 403.
- [ ] `packages/api/__tests__/e2e/walking-skeleton.test.ts` passes consistently — run 5x with `pnpm --filter @app/api test walking-skeleton`; all 5 green.
- [ ] **Cross-plan invariant:** `pnpm --filter @app/domain test no-direct-state-writes` exit code 0. Open the test file's allowlist; confirm no `packages/api/` paths were added.
- [ ] `pnpm --filter web build` succeeds — confirms the tRPC handler at `apps/web/app/api/trpc/[trpc]/route.ts` wires `appRouter` correctly.
- [ ] Repo-wide `pnpm -r typecheck` exit code 0.
- [ ] PLAN-005's commit(s) on the branch with the expected message; only `packages/api/*` + `apps/web/app/api/trpc/[trpc]/route.ts` + `pnpm-lock.yaml` modified; no `docs/` files touched.

Report back (under 200 words): which gates passed, any implementation fixes you made (with new commit hash), anything escalated, **and explicit confirmation that PLAN-003's static-analysis test still passes**.

## Specific things to look hard at

1. **`recordRelationshipEvent` is used for enroll/unenroll — NOT `transitionJob`.** Open `packages/api/src/routers/jobs.ts`. Search for `enroll:` and `unenroll:`. The mutation body should call `recordRelationshipEvent({ event: 'enroll' | 'unenroll', currentState: 'enrollment_open', beforeAuditWrite: ... })`. If you see `transitionJob({ event: 'enroll' })` or a direct `INSERT INTO jobStateTransitions`, that's wrong — the former because enroll isn't an FSM event in `JOB_TRANSITIONS`, the latter because of the single-writer invariant.

2. **`approveJob` is its own helper, NOT a `transitionJob` call.** The two-row pattern (user-actor `awaiting_moderation → approved` + system-actor `approved → enrollment_open` in one tx) lives inside `approveJob`. If `jobs.approve` calls `transitionJob({ event: 'approve' })` instead, the audit log will only have one row, the persisted state will be `approved` not `enrollment_open`, and PRD-002 AC-08 + PRD-004 AC-01 both fail.

3. **`createJob.afterCommit` is wired with a STUB**, not the real `sendModeratorQueueEmail` from PLAN-007 (which doesn't exist yet). Look at the import: should be from a local stubs module (e.g., `@app/notifications/stubs` or similar) — NOT from `@app/notifications` proper. PLAN-007 will swap the import. If you see a real `sendModeratorQueueEmail` call, PLAN-005 has reached too far into PLAN-007's scope.

4. **`users.changeRole` Zod input enumerates only `Active | Alumni`.** Open `packages/api/src/routers/users.ts`. The input schema for `changeRole` MUST be `z.object({ toRole: z.enum(['Active', 'Alumni']) })` — NOT the full role enum. A crafted `toRole: 'Admin'` request gets caught by Zod (400 BAD_REQUEST), not by the middleware (403 FORBIDDEN). PRD-008 AC-03 verifies this.

5. **`jobs.confirmReceipt` race semantics return non-standard 200.** Read the procedure's body. When `transitionJob` throws `ConcurrentTransitionError`, the procedure should swallow it, query the latest `closed` audit row, and return `{ state: 'closed', alreadyClosed: true, closedBy: <actorId | null> }`. If the procedure re-throws to a 409 CONFLICT, the UI race test in PLAN-010's validation will fail (and the user-facing toast story breaks).

6. **`computeDuesSplit` rounding sums exactly.** Open `packages/api/src/dues.ts` (or wherever it landed). The 3-attendee uneven split test: `total = 100, attendees = [aliceId, bobId, carolId]` (sorted by display name "Alice", "Bob", "Carol") → result must be `{ aliceId: "33.34", bobId: "33.33", carolId: "33.33" }` summing to exactly `$100.00`. If Carol gets the cent, the sort is wrong.

7. **Error-mapping middleware in `packages/api/src/trpc.ts`.** `MinAdminInvariantError` → `UNPROCESSABLE_CONTENT` with the `code: 'MIN_ADMIN_INVARIANT_VIOLATED'` field on the error data. `FsmViolationError` → `INTERNAL_SERVER_ERROR` (it's a bug, not a user error — TypeScript should have caught it). `ConcurrentTransitionError` outside `jobs.confirmReceipt` → `CONFLICT`. Check the `errorFormatter` and any per-procedure try/catch handles.

## If a gate fails

1. **Mechanical fix (allowed):** missing import, Zod schema typo, wrong error code mapping, off-by-one in a test fixture — fix the implementation, re-run the gate, create a `fix(api): …` commit.
2. **Static-analysis regression (FIX, do not allowlist):** if PLAN-003's test fails because a `packages/api/` file writes to `jobs.state` / `users.role` / one of the audit tables directly, the fix is to route through `@app/domain`. Do NOT add packages/api to the allowlist.
3. **Test reveals an upstream design problem (escalate):** do not edit the design — surface to the user. Likely candidates: a PRD AC that can't be expressed via existing middleware composition; an enum value the design omits.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Begin.
