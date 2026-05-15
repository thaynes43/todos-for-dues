# Prompt for Claude Code agent — Execute PLAN-005 (tRPC procedures)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). **Current state:** PLAN-001 (scaffolding), PLAN-002 (DB schema + lazy `db` Proxy + Better Auth tables landed in 0005/0006), PLAN-003 (FSM helpers: `transitionJob` / `createJob` w/ afterCommit / `approveJob` / `recordRelationshipEvent` / `transitionRole` / `transitionRolesAtomically`), and PLAN-004 (Better Auth + Workspace OIDC + invite tokens + 3 Server Actions + the SSO POST-button fix) are committed. PLAN-005 wires every MVP tRPC procedure across the 5 routers (`jobs`, `users`, `settings`, `admin`, `invites`) — the largest plan so far.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/005-trpc-procedures-implementation.md` end-to-end, then verify against `docs/plans/005-trpc-procedures-validation.md` pass/fail gates. You produce: `packages/api/src/{trpc.ts,middleware/*,routers/*,dues.ts}` per DESIGN-003 §4.1–§4.8, the corresponding integration tests in `packages/api/__tests__/integration/<router>.test.ts`, the API-level walking-skeleton E2E in `packages/api/__tests__/e2e/walking-skeleton.test.ts`, and wire the populated `appRouter` into `apps/web/app/api/trpc/[trpc]/route.ts` (replacing PLAN-001's stub).

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Honour every feedback memory (ask-don't-invent, brief responses, doc conventions, **test-DB rule: PG16 via testcontainers, no SQLite or MySQL substitution**, skip-confirm-when-strong).
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root project context. The **"Domain invariant — FSM-only state writes"** section is load-bearing for this plan.
3. `docs/plans/005-trpc-procedures-implementation.md` — the plan. §3 Outputs, §4 Steps 1–9, §5 verification, §8 resume points.
4. `docs/plans/005-trpc-procedures-validation.md` — the validation gates and per-router test inventory.
5. `docs/designs/003-trpc-api-surface.md` — full design. §4.1 context+factories, §4.2 role middleware, §4.3 job-ownership middleware, §4.4 jobs router (~400 lines — the largest), §4.4.1 computeDuesSplit, §4.5 users, §4.6 settings, §4.7 admin, §4.8 invites, §4.9 root router, §7 error mapping.
6. `docs/designs/002-fsm-module.md` §6 — confirms which procedure invokes which helper (`createJob` for `jobs.post`, `approveJob` for `jobs.approve`, `recordRelationshipEvent` for `jobs.enroll` / `jobs.unenroll`, `transitionJob` for everything else, `transitionRole` for `users.changeRole` / `users.grantRole`).
7. The relevant PRD §5 sections you're realising: PRD-002 R-01..R-12, PRD-004 R-01..R-12, PRD-005 R-01..R-09, PRD-006 R-01..R-12, PRD-007 R-02/R-04/R-06/R-07/R-08, PRD-008 R-01..R-10. Read the AC lists too — they're your integration-test contract.

**What's already in the repo you can rely on:**
- `import { db, getPool } from '@app/db'` — Proxy-based lazy `db`.
- `import { users, jobs, jobEnrollments, jobStateTransitions, userRoleTransitions, chapterSettings, inviteTokens, session, account, type JobState, type Role, JOB_STATES, ROLES } from '@app/db/schema'` — every table + enum.
- `import { transitionJob, createJob, approveJob, recordRelationshipEvent, transitionRole, transitionRolesAtomically, FsmViolationError, ConcurrentTransitionError, MinAdminInvariantError } from '@app/domain'` — the FSM helpers + typed errors.
- `import { auth, getServerSession, verifyInviteToken } from '@app/auth'` — Better Auth instance + session-extension hook attaches `role` to `session.user`. The session-extension hook means `session.user.role` is already populated — your `createTRPCContext` per DESIGN-003 §4.1 reads it directly.
- `import { runMigrations } from '@app/db/migrate'` — call from `beforeAll` in integration tests to seed a fresh testcontainer.
- `@app/test-utils.startPostgres()` — testcontainers helper.

## What you do NOT do

- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans, DDD). If a design ambiguity blocks a step, **escalate to the user** — do not improvise.
- Do not skip ahead into PLAN-006+ scope (no UI components beyond what's needed to verify procedures end-to-end; the actual route shells + components land in PLAN-006).
- **Do not write any `UPDATE jobs SET state =` / `UPDATE users SET role =` / `INSERT INTO job_state_transitions` / `INSERT INTO user_role_transitions` outside `packages/domain/`.** PLAN-003's `no-direct-state-writes.test.ts` will fail the build. The fix is always "route through the appropriate helper from `@app/domain`" — not to relax the test.
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not commit until §5 + VALIDATION-005 §6 gates are all green.
- Do not push to remote — the user pushes. (Branch protection lands in PLAN-009; you're still pushing to `main` directly for now.)

## Specific traps to watch for

**Trap 1 — Single-writer invariant must hold across all 5 routers.**
Every state-changing procedure routes through `@app/domain`:
- `jobs.post` → `createJob({ ..., afterCommit })` (afterCommit STUB for now; PLAN-007 swaps in the real `sendModeratorQueueEmail`).
- `jobs.approve` → `approveJob({ ... })` (two-row pattern lives inside the helper).
- `jobs.reject` / `lock` / `reschedule` / `cancel` / `complete` / `revertCompletion` / `markPaymentSent` / `confirmReceipt` / `dispute` / `resolveDisputeAs{Closed,Cancelled,PaymentSent}` → `transitionJob({ ... })`.
- `jobs.enroll` / `jobs.unenroll` → `recordRelationshipEvent({ event: 'enroll' | 'unenroll', currentState: 'enrollment_open', beforeAuditWrite })` (NOT `transitionJob` — enroll/unenroll don't change the parent FSM state).
- `users.changeRole` / `users.grantRole` → `transitionRole({ ... })`.

**Trap 2 — Stub the notification `afterCommit` hooks; do NOT call PLAN-007's helpers directly yet.**
Per the plan §6 Out of Scope: PLAN-007 implements the real `sendTreasurerEmail` / `sendAdminDisputeEmail` / `sendModeratorQueueEmail`. PLAN-005's procedures should call into typed stubs (e.g., `const sendTreasurerEmail = async (input) => { console.log('stub:', input); }` in a `packages/notifications/src/stubs.ts` file, exported as `sendTreasurerEmail`). PLAN-007 replaces the file's contents with the real implementations using the same import names — no PLAN-005 call site changes.

**Trap 3 — `jobs.confirmReceipt` race handling is intentionally non-standard.**
Per PRD-006 R-04 + DESIGN-003 §4.4: when two callers race, exactly one transition succeeds; the loser gets a 200 response with `{ state: 'closed', alreadyClosed: true, closedBy: <first actor> }`, NOT a 409. This is the only procedure that swallows `ConcurrentTransitionError` and returns a value. JSDoc the procedure to make this obvious to API consumers.

**Trap 4 — Dues split rounding (ADC-01 INV-05 + PRD-005 R-04).**
`computeDuesSplit(total, attendeeIds, ctx)` in `packages/api/src/dues.ts` per DESIGN-003 §4.4.1: cents-per-attendee = `Math.floor((total * 100) / N)`; surplus = `total * 100 - centsPer * N`. Sort attendees by display name (deterministic; ADC-01 Q-AGG-02 lean — fallback to user_id sort if display names are equal/missing). The first `surplus` attendees get an extra cent. Return `Record<userId, "X.XX">` (string for jsonb persistence). Integration test asserts sum-equals-total for 3-attendee uneven split (e.g., $100 split 3 ways = $33.34 / $33.33 / $33.33).

**Trap 5 — Role-aware field projection on `jobs.getById`.**
Per PRD-004 R-05 / AC-06 / AC-07: enrolled Actives, the posting Alumni, Moderators, and Admins see the full roster (display names); non-enrolled Actives see only the count. Implement in the query, not via a separate procedure. The viewer's role + their enrollment status are both readable from `ctx`.

**Trap 6 — `users.changeRole`'s self-elevation gate.**
PRD-008 R-04 + AC-03: `users.changeRole` only accepts non-privileged target roles (`'Active' | 'Alumni'`). The Zod input schema MUST enumerate these (not the full role enum). A user crafting a request with `toRole: 'Admin'` gets a 400 from Zod, not a 403 from middleware — that's the correct + earliest-fail path.

**Trap 7 — Min-Admin error mapping to 422.**
Per PRD-008 R-05 / AC-04: when `transitionRole` throws `MinAdminInvariantError`, tRPC procedures map it to `TRPCError({ code: 'UNPROCESSABLE_CONTENT' })` with the typed code `'MIN_ADMIN_INVARIANT_VIOLATED'` in the error data. The `errorFormatter` in `packages/api/src/trpc.ts` is where this mapping lives. PLAN-012's UI consumes this; if the mapping is wrong, the MinAdminErrorBanner won't render.

**Trap 8 — drizzle-zod is pinned to ^0.5.1.**
PLAN-002 pinned drizzle-zod ^0.5.1 because newer versions (0.6+) require drizzle-orm 0.37+ but the workspace pins 0.36.4. The API surface (`createInsertSchema`, `createSelectSchema`) is identical between 0.5 and 0.7. Use the standard `.pick({ ... })` pattern for procedure inputs (DESIGN-003 Q-DSG-03 lean).

**Trap 9 — Walking-skeleton E2E at the API layer is mandatory.**
`packages/api/__tests__/e2e/walking-skeleton.test.ts` chains: `invites.generate` (Admin) → seed Active + Alumni users via `auth.api.signUpEmail` with the invite tokens → `jobs.post` (Alumni) → `jobs.approve` (Mod) → `jobs.enroll` (Active) → `jobs.lock` (Alumni) → `jobs.complete` (Alumni) → `jobs.markPaymentSent` (Alumni) → `jobs.confirmReceipt` (Active) → assert `closed` + 7 audit rows. This is the API-level mirror of PLAN-008's Playwright spec. Run it via `appRouter.createCaller(ctx)` with seeded sessions, NOT via HTTP.

## Definition of done

Every box in VALIDATION-005 §6 green:

- `pnpm --filter @app/api typecheck && test` passes all integration suites — per-router happy + auth/role rejection + the specific PRD ACs called out in VALIDATION-005 §3 (mappings every CMD-NN to a test).
- The race test on `jobs.confirmReceipt` passes (Promise.allSettled; exactly one succeeds, one returns `{ alreadyClosed: true }`).
- The min-Admin self-demote test on `users.changeRole` returns 422 with `MIN_ADMIN_INVARIANT_VIOLATED` data code.
- `packages/api/__tests__/e2e/walking-skeleton.test.ts` passes consistently (run 5x — no flake).
- **Cross-plan invariant:** `pnpm --filter @app/domain test no-direct-state-writes` still exits 0. Your static-analysis allowlist must NOT add `packages/api/` paths.
- `pnpm --filter web build` succeeds with the wired tRPC handler.
- Repo-wide `pnpm -r typecheck` clean.
- One commit matching PLAN-005 §3's commit message (combined commit is fine; per-router commits also OK per Q-PLN-01 lean).

Report back (under 200 words): commit hash, anything escalated, any open Q-PLN-NN with your lean, explicit confirmation that PLAN-003's static-analysis test still passes.

## If you get stuck

If a step's verification fails AND it's not obviously a copy-paste fix, **escalate to the user** with: (1) which step, (2) the exact error, (3) what you tried, (4) your lean. Do not invent product or architectural decisions. Do not modify any design or upstream plan.

Particular escalation candidates to watch for (anything in this list, stop and ask):
- Better Auth's session shape doesn't expose `role` the way PLAN-004's session-extension hook intended (Trap 3 in PLAN-004 prompt).
- drizzle-zod's `.pick()` chain doesn't compose with tRPC's input schema validation (try standard Zod first; only escalate if both refuse).
- A procedure's authorization requirement can't be expressed via existing middleware (`alumniProcedure`, `moderatorProcedure`, etc.) without inventing a new role partition — that's a PRD-level decision, escalate.

Begin.
