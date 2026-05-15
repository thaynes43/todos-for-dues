---
id: VALIDATION-005
title: Validation — PLAN-005 tRPC procedures (all 5 routers)
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: L
related:
  prds: [PRD-002, PRD-003, PRD-004, PRD-005, PRD-006, PRD-007, PRD-008]
  adrs: [ADR-003, ADR-008, ADR-011]
  bounded_contexts: [BCC-01, BCC-02, BCC-03]
  aggregates: [ADC-01, ADC-02]
  designs: [DESIGN-003]
  plans:
    pairs_with: PLAN-005
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-005 implements DESIGN-003 end-to-end: every procedure across 5 routers (`jobs`, `users`, `settings`, `admin`, `invites`) is reachable from a tRPC client; auth + role + ownership middleware enforces `UNAUTHORIZED` / `FORBIDDEN` correctly; FSM-helper calls fire the right `transitionJob` / `recordRelationshipEvent` / `transitionRole` with the right hooks; `confirmReceipt` race handling returns the idempotent `alreadyClosed` response; per-PRD ACs (002, 004, 005, 006, the read-side of 007/008) are exercised through real procedure calls.

## 2. Inputs

- **Paired implementation plan:** `docs/plans/005-trpc-procedures-implementation.md`.
- **PRDs / designs:**
  - `docs/designs/003-trpc-api-surface.md` §4 + §8 testing approach.
  - PRD-002 R-01..R-12 + ACs; PRD-004 R-01..R-12 + ACs; PRD-005 R-01..R-09 + ACs; PRD-006 R-01..R-12 + ACs; PRD-007 R-02/R-04/R-06/R-07/R-08 + ACs; PRD-008 R-01..R-10 + ACs.
  - `docs/designs/002-fsm-module.md` §6 (which helper each procedure invokes).
- **Running artifacts:** the tRPC `appRouter` from PLAN-005 served at `/api/trpc/*` via `pnpm dev`, OR called directly via `appRouter.createCaller(...)` in integration tests (faster + deterministic).

## 3. Coverage matrix

Every BCC-02 CMD + Q + every BCC-01/03 mutation/query maps to one procedure + one or more tests. Below mapping by router; per-PRD AC mapping continues in §4.

**`jobs` router** (DESIGN-003 §4.4):

| Procedure | PRD / CMD | Test |
|---|---|---|
| `jobs.post` | PRD-002 CMD-01 + R-01/R-02/R-03/R-04/R-05/R-12 + AC-01..AC-05 | `jobs.test.ts → describe('post')` |
| `jobs.approve` | PRD-002 CMD-02 + R-07 + AC-08/AC-09 (self-approval) | `describe('approve')` |
| `jobs.reject` | PRD-002 CMD-03 + R-08/R-10 + AC-10/AC-11/AC-13 | `describe('reject')` |
| `jobs.enroll` | PRD-004 CMD-04 + R-02 + AC-02/AC-03 (idempotent) | `describe('enroll')` |
| `jobs.unenroll` | PRD-004 CMD-05 + R-03/R-04 + AC-04/AC-05 | `describe('unenroll')` |
| `jobs.lock` | PRD-004 CMD-06 + R-07/R-08/R-09 + AC-08/AC-09/AC-10/AC-11 | `describe('lock')` |
| `jobs.reschedule` | PRD-004 CMD-07 + R-10 + AC-12 | `describe('reschedule')` |
| `jobs.cancel` | PRD-004 CMD-08 + R-11/R-12 + AC-13/AC-14/AC-15 | `describe('cancel')` |
| `jobs.complete` | PRD-005 CMD-09 + R-01/R-02/R-03/R-04 + AC-01..AC-05 | `describe('complete')` |
| `jobs.revertCompletion` | PRD-005 CMD-10 + R-05 + AC-06 | `describe('revert')` |
| `jobs.markPaymentSent` | PRD-005 CMD-11 + R-06/R-07/R-08 + AC-07/AC-09 | `describe('markPaymentSent')` |
| `jobs.confirmReceipt` | PRD-006 CMD-12 + R-01/R-02/R-03/R-04 + AC-01..AC-04 | `describe('confirmReceipt')` |
| `jobs.dispute` | PRD-006 CMD-13 + R-05/R-06/R-07 + AC-05/AC-06/AC-07 | `describe('dispute')` |
| `jobs.resolveDisputeAsClosed` | PRD-006 CMD-14a + R-08 + AC-08/AC-09 | `describe('resolveDispute*')` |
| `jobs.resolveDisputeAsCancelled` | PRD-006 CMD-14b + R-09 + AC-10 | same |
| `jobs.resolveDisputeAsPaymentSent` | PRD-006 CMD-14c + R-10 + AC-11 | same |
| `jobs.listByState` | BCC-02 Q-01 | `describe('listByState')` |
| `jobs.getById` | BCC-02 Q-02 + PRD-004 R-05 (role-aware roster projection) + AC-06/AC-07 | `describe('getById')` |
| `jobs.getHistory` | BCC-02 Q-03 + PRD-007 R-06 + AC-07 | `describe('getHistory')` |
| `jobs.listMyPosted` | BCC-02 Q-04 + PRD-002 R-11 + AC-14 | `describe('listMyPosted')` |
| `jobs.listMyEnrolled` | BCC-02 Q-05 + PRD-004 R-06 | `describe('listMyEnrolled')` |
| `jobs.listModerationQueue` | BCC-02 Q-08 + PRD-002 R-06 + AC-06/AC-07 | `describe('listModerationQueue')` |

**`users` router** (DESIGN-003 §4.5):

| Procedure | PRD / CMD | Test |
|---|---|---|
| `users.changeRole` | PRD-008 R-01/R-04 + AC-01/AC-03 + PRD-008 R-05 + AC-04 | `users.test.ts → describe('changeRole')` |
| `users.grantRole` | PRD-008 R-02/R-03 + AC-02 | `describe('grantRole')` |
| `users.list` | PRD-007 R-08 + PRD-008 R-08 + AC-08 | `describe('list')` |
| `users.getRoleHistory` | PRD-008 R-10 + AC-11 | `describe('getRoleHistory')` |
| `users.getSession` | BCC-01 Q-01 | `describe('getSession')` |
| `users.getById` | BCC-01 Q-02 | `describe('getById')` |

**`settings` router** (DESIGN-003 §4.6):

| Procedure | PRD | Test |
|---|---|---|
| `settings.list` | PRD-007 R-07 + AC-08 | `settings.test.ts → describe('list')` |
| `settings.set` | PRD-007 R-07/R-08 + AC-08/AC-09 | `describe('set')` — per-key validation |

**`admin` router** (DESIGN-003 §4.7):

| Procedure | PRD | Test |
|---|---|---|
| `admin.getAggregateCounts` | PRD-007 R-02 + AC-03 | `admin.test.ts → describe('getAggregateCounts')` |
| `admin.listDisputed` | PRD-007 R-04 + AC-05 | `describe('listDisputed')` |

**`invites` router** (DESIGN-003 §4.8):

| Procedure | PRD | Test |
|---|---|---|
| `invites.generate` | PRD-001 R-01 | `invites.test.ts → describe('generate')` |
| `invites.list` | PRD-001 R-01 | `describe('list')` |
| `invites.revoke` | PRD-001 R-01 | `describe('revoke')` |

**Cross-cutting (per-procedure auth/role tests):**

| Concern | Test pattern |
|---|---|
| `UNAUTHORIZED` (no session) | every authed procedure has a "without session → UNAUTHORIZED" test |
| `FORBIDDEN` (wrong role) | every role-gated procedure has a "wrong role → FORBIDDEN" test |
| `FORBIDDEN` (not poster) | `jobs.lock`/`reschedule`/`cancel`/`complete`/`revertCompletion`/`markPaymentSent` each have a "non-poster Alumni → FORBIDDEN" test (PRD-005 AC-10, PRD-004 AC-09) |
| `FORBIDDEN` (not enrolled, not Admin) | `jobs.confirmReceipt`/`dispute` "non-enrolled non-Admin → FORBIDDEN" (PRD-006 AC-03) |
| `CONFLICT` race on confirmReceipt | two concurrent calls; second returns `{ state: 'closed', alreadyClosed: true }` (PRD-006 AC-04) |
| `UNPROCESSABLE_CONTENT` min-Admin | `users.changeRole` last-Admin self-demote → 422 with code `MIN_ADMIN_INVARIANT_VIOLATED` (PRD-008 AC-04) |

## 4. Unit tests

`packages/api/__tests__/` — all integration-style against testcontainers PG16 + Better Auth wired per PLAN-004. Use `appRouter.createCaller(ctx)` for direct in-process calls (avoids HTTP overhead) — `ctx` is constructed per-test with a seeded session.

### `packages/api/__tests__/integration/jobs.test.ts`

One `describe()` per procedure listed in §3. Each describe has at least:
- `it('happy path')` — seeds prerequisites, calls the procedure, asserts (a) state mutation OR query result; (b) `job_state_transitions` row(s) match expected shape (for mutations).
- `it('rejects without session — UNAUTHORIZED')` — `ctx.session = null`.
- `it('rejects wrong role — FORBIDDEN')` — wrong role in ctx.

Specific tests called out by PRD AC:
- **AC-02/AC-03/AC-04/AC-05 (PRD-002 — input validation)** — `it('rejects dues = 0')`, `it('rejects dues = -10')`, `it('rejects empty description')`, `it('rejects recommended count = 0')`.
- **AC-09 (PRD-002 — self-approval)** — Moderator posts then approves own job; both succeed; audit log shows correct actor.
- **AC-13 (PRD-002 — rejected terminal)** — after `reject`, any subsequent transition attempt → `FsmViolationError`.
- **AC-03 (PRD-004 — idempotent enroll)** — call `enroll` twice; second call no-ops; only one `job_state_transitions` row + one `job_enrollments` row.
- **AC-11 (PRD-004 — lock requires ≥1 enrollee)** — zero enrollees + lock → BAD_REQUEST.
- **AC-12 (PRD-004 — reschedule preserves roster)** — seed enrollments; reschedule; assert enrollments still present, `workDate = NULL`.
- **AC-15 (PRD-004 — cancelled terminal)** — same pattern as AC-13 above.
- **AC-04/AC-05 (PRD-005 — dues split rounding)** — assert per-Active credit map sums exactly to `duesAmount` for 4-attendee even split and 3-attendee uneven split.
- **AC-09 (PRD-005 — no revert from payment_sent)** — `revertCompletion` from `payment_sent` → `FsmViolationError`.
- **AC-04 (PRD-006 — race)** — `await Promise.allSettled([confirmReceipt(...), confirmReceipt(...)])`; exactly one fulfilled with `{ state: 'closed', closedBy: <actor> }`, one fulfilled with `{ state: 'closed', alreadyClosed: true, closedBy: <first actor> }`. Only one `job_state_transitions` row.
- **AC-12 (PRD-006 — closed terminal)** — same pattern as AC-13.

### `packages/api/__tests__/integration/users.test.ts`

- **AC-01 (PRD-008 — self-service)** — Active → Alumni round-trips both directions; each writes `user_role_transitions` with correct initiator.
- **AC-03 (PRD-008 — no self-elevate)** — crafted `users.changeRole({ toRole: 'Admin' })` → `FORBIDDEN` (the Zod schema only accepts `'Active' | 'Alumni'`; this verifies the schema enforces it).
- **AC-02 (PRD-008 — Admin grant)** — Admin grants Moderator to Alumni; row + audit written; `initiatorKind: 'admin'`.
- **AC-04 (PRD-008 — last-Admin self-demote)** — single Admin attempts self-demote → tRPC error with code `MIN_ADMIN_INVARIANT_VIOLATED`, HTTP 422.
- **AC-05 (PRD-008 — atomic swap)** — Admin's grant-Admin-to-B + self-demote-to-Alumni in one transaction succeeds (call via `appRouter.createCaller` chained inside a `db.transaction`).
- **AC-08 (PRD-008 — Admin lists users)** — `users.list` as Admin returns all users; as non-Admin returns FORBIDDEN.
- **AC-11 (PRD-008 — role history)** — seed 3 transitions; `getRoleHistory` returns them in descending order.

### `packages/api/__tests__/integration/settings.test.ts`

- **AC-08 (PRD-007 — set treasurer email)** — Admin calls `settings.set({ key: 'treasurer_recipient_email', value: 'treasurer@…' })`; subsequent `getSetting()` returns the new value.
- **AC-09 (PRD-007 — invalid email rejected)** — bad email → BAD_REQUEST (Zod email validator); existing value unchanged.
- Per-key validation: each of the 5 MVP keys gets a happy-path + invalid-path test.

### `packages/api/__tests__/integration/admin.test.ts`

- **AC-03 (PRD-007 — aggregate counts)** — seed jobs across states; `getAggregateCounts` returns the expected map.
- **AC-05 (PRD-007 — listDisputed rows)** — seed a disputed job; `listDisputed` returns it with disputer info + age.
- **AC-02 (PRD-007 — non-Admin access)** — both procedures return FORBIDDEN for non-Admin.

### `packages/api/__tests__/integration/invites.test.ts`

- `it('Admin generates an Active invite URL')` — returns URL with token query param.
- `it('Admin revokes a token')` — sets `revokedAt`; downstream `verifyInviteToken` rejects.
- `it('non-Admin cannot generate or revoke')` — FORBIDDEN.

### `packages/api/__tests__/e2e/walking-skeleton.test.ts`

Mirror of PLAN-008's UI E2E but at the API layer (faster, deterministic):

- Programmatically call: `invites.generate` (as Admin) → mock-create the Active user → `jobs.post` (as Alumni) → `jobs.approve` (as Moderator) → `jobs.enroll` (as Active) → `jobs.lock` (as Alumni, future date) → `jobs.complete` (Alumni, attendees=[Active]) → `jobs.markPaymentSent` (Alumni) → `jobs.confirmReceipt` (Active) → assert `closed`.
- Assert the `job_state_transitions` table has the expected 7 rows in order (per PLAN-008 §5).

## 5. Playwright E2E tests

**None directly from VALIDATION-005.** The full Playwright E2E for the happy path is owned by PLAN-008 / VALIDATION-008. UI-driven E2E for procedures lives in VALIDATION-006 / VALIDATION-010 / VALIDATION-011 / VALIDATION-012.

VALIDATION-005's surface is the procedure layer — covered by the integration tests above. Doing UI E2E here would duplicate work.

## 6. Pass/fail gates

- [ ] `pnpm --filter @app/api typecheck && test` passes all integration suites.
- [ ] Every PRD AC listed in §3 is mapped to a passing test (verifiable via `grep -c "AC-NN" packages/api/__tests__`).
- [ ] `packages/api/__tests__/e2e/walking-skeleton.test.ts` passes consistently (run 5x — no flake).
- [ ] No `UNAUTHORIZED` or `FORBIDDEN` paths are silently accepted in happy-path tests (each happy-path uses an explicitly-correct session).
- [ ] One PLAN-005 commit on the branch.

## 7. Resume notes

Tests are independent. Each describe-block constructs a fresh session via test fixtures. If a test fails, fix the procedure (per the prompt's rule "if a test fails the implementation agent fixes the implementation, not the test").

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-005. Maps every procedure to a per-PRD AC + role/auth rejection tests. Calls out the admin + users.changeRole tests explicitly to address the gap PLAN-008's happy-path E2E doesn't cover (the user's prompt flagged this). |
