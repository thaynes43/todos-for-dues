---
id: VALIDATION-003
title: Validation — PLAN-003 FSM module (transitionJob / createJob / approveJob / recordRelationshipEvent / transitionRole)
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: S
related:
  prds: [PRD-001, PRD-002, PRD-004, PRD-005, PRD-006, PRD-008]
  adrs: [ADR-008, ADR-009, ADR-011]
  bounded_contexts: [BCC-02, BCC-03]
  aggregates: [ADC-01, ADC-02]
  designs: [DESIGN-001, DESIGN-002]
  plans:
    pairs_with: PLAN-003
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-003's FSM module implements DESIGN-002 end-to-end: the typed `JOB_TRANSITIONS` map covers all ADC-01 ST-01..ST-17 transitions; `transitionJob`, `createJob`, `approveJob`, `recordRelationshipEvent`, `transitionRole` all produce the expected `jobs.state` / `users.role` mutations + atomic `job_state_transitions` / `user_role_transitions` audit-log rows; typed errors fire on illegal transitions; optimistic concurrency prevents double-writes; the deferred-CHECK min-Admin invariant integrates correctly (including the atomic-swap edge case).

## 2. Inputs

- **Paired implementation plan:** `docs/plans/003-fsm-module-implementation.md`.
- **PRDs / designs:**
  - `docs/designs/002-fsm-module.md` §4.1 (JOB_TRANSITIONS, transitionJob, createJob, approveJob), §4.1.5 (recordRelationshipEvent), §4.2 (transitionRole), §4.3 (errors), §8 (testing approach).
  - `docs/domain-driven-design/aggregates/001-job-aggregate-canvas.md` §3 (ST-01..ST-17) + §4 (INV-NN).
  - PRD-002 R-05/R-07/R-08, PRD-004 R-01..R-12, PRD-005 R-01..R-08, PRD-006 R-01..R-12, PRD-008 R-01/R-02/R-03/R-05 — every state-changing R-NN routes through one of these helpers.
- **Running artifacts:** the `packages/domain` module + the schema from PLAN-002 applied to a testcontainers PG16.

## 3. Coverage matrix

| Source | Helper(s) | Test |
|---|---|---|
| ADC-01 ST-01 (PostJob → awaiting_moderation) | `createJob` | `it('createJob writes initial row + audit')` |
| ADC-01 ST-02 (posted → awaiting_moderation — transient) | `createJob` (collapsed) | same |
| ADC-01 ST-03 + ST-05 (Approve → enrollment_open, two audit rows) | `approveJob` | `it('approveJob writes two audit rows: user-actor + system-actor')` |
| ADC-01 ST-04 (Reject → rejected) | `transitionJob(event='reject')` | `it('reject transitions to rejected with note')` |
| ADC-01 ST-06 (Lock → locked) | `transitionJob(event='lock')` | `it('lock persists work_date via beforeStateWrite')` |
| ADC-01 ST-07 (Reschedule → enrollment_open) | `transitionJob(event='reschedule')` | `it('reschedule clears work_date + writes audit with prior date in note')` |
| ADC-01 ST-08/ST-09 (Cancel → cancelled) | `transitionJob(event='cancel')` | `it('cancel from enrollment_open and locked')` |
| ADC-01 ST-10 (Complete → completed) | `transitionJob(event='complete')` | `it('complete persists confirmed attendees + dues split')` |
| ADC-01 ST-11 (RevertCompletion → locked) | `transitionJob(event='revert')` | `it('revert clears attendees + dues credit')` |
| ADC-01 ST-12 (MarkPaymentSent → payment_sent) | `transitionJob(event='payment_sent')` | `it('payment_sent fires afterCommit hook')` |
| ADC-01 ST-13 (ConfirmReceipt → closed) | `transitionJob(event='confirm_receipt')` | `it('confirm_receipt closes')` |
| ADC-01 ST-14 (Dispute → disputed) | `transitionJob(event='dispute')` | `it('dispute persists reason + fires afterCommit')` |
| ADC-01 ST-15..ST-17 (resolve_*) | `transitionJob(event='resolve_*')` | `it('resolve_closed / resolve_cancelled / resolve_payment_sent each transition correctly')` |
| BCC-02 CMD-04 (EnrollInJob) | `recordRelationshipEvent(event='enroll')` | `it('enroll writes job_enrollments + audit row atomically')` |
| BCC-02 CMD-05 (UnenrollFromJob) | `recordRelationshipEvent(event='unenroll')` | `it('unenroll deletes job_enrollments + writes audit row atomically')` |
| ADC-01 INV-06 (all transitions via helper) | static — grep test ensures no `UPDATE jobs SET state = ...` outside the helpers | `packages/domain/__tests__/no-direct-state-writes.test.ts` (grep / AST-walk) |
| ADC-01 INV-12 (rejected/closed/cancelled terminal) | `transitionJob({ expectedFromState: 'closed', event: ... })` → `FsmViolationError` | `it('terminal states have no outgoing transitions')` |
| ADC-01 INV-13 (no `payment_sent → completed` direct revert) | `JOB_TRANSITIONS.payment_sent` has no `revert` entry | map-completeness test |
| ADC-01 INV-15 (first-write-wins on confirm) | concurrent `confirm_receipt` calls → one succeeds, one `ConcurrentTransitionError` | `it('optimistic concurrency rejects second writer')` |
| PRD-001 R-15 (audit log) | every transition writes one (or two for ApproveJob) row(s) | each transition test asserts the audit row |
| PRD-001 R-16 / PRD-008 R-05 + AC-04 (min-Admin) | `transitionRole` mapping `23514` → `MinAdminInvariantError` | `it('last-Admin demotion throws MinAdminInvariantError')` |
| PRD-008 AC-05 (atomic swap) | single tx promote + demote → succeeds | `it('atomic swap succeeds in single transaction')` |
| DESIGN-002 §4.1.3 `createJob.afterCommit` | callback runs after commit; throw → logged not propagated | `it('createJob.afterCommit fires once + swallows errors')` |
| DESIGN-002 §4.1.5 `recordRelationshipEvent` | beforeAuditWrite + audit row in one tx; throw in beforeAuditWrite → neither write lands | `it('recordRelationshipEvent rolls back on beforeAuditWrite throw')` |
| DESIGN-002 §4.3 typed errors (`FsmViolationError`, `ConcurrentTransitionError`, `MinAdminInvariantError`) | thrown classes have the expected `.code` field | `it('error classes carry expected code')` |
| DESIGN-002 §8 type-narrowing | `// @ts-expect-error` block on `transitionJob({ expectedFromState: 'closed', event: 'lock' })` compiles correctly | `packages/domain/__tests__/job-state-machine.test.ts` |

## 4. Unit tests

### `packages/domain/__tests__/job-state-machine.test.ts` — unit (no DB)

- **`it('JOB_TRANSITIONS covers every JOB_STATE')`** — assert every state in the `JOB_STATES` array has a key in the map.
- **`it('every transition target is a valid JOB_STATE')`** — iterate map values; each `to` must be in `JOB_STATES`.
- **`it('rejects illegal transition at runtime')`** — call `transitionJob({ expectedFromState: 'closed', event: 'lock' as never })` → throws `FsmViolationError`.
- **`it('@ts-expect-error on illegal transition at compile time')`** — a `// @ts-expect-error` block on `transitionJob({ expectedFromState: 'closed', event: 'lock' })`. The presence of this directive at compile time is the assertion; if TS stops emitting the expected error, the directive becomes a test failure.
- **`it('error classes carry expected code')`** — instantiate each class; assert `.code` matches `'FSM_VIOLATION' | 'CONCURRENT_TRANSITION' | 'MIN_ADMIN_INVARIANT_VIOLATED'`.

### `packages/domain/__tests__/integration/job-state-machine.integration.test.ts` — PG16 testcontainers

- **`it('createJob writes initial row + audit (fromState: null)')`** — calls `createJob`; asserts `jobs.state = 'awaiting_moderation'` AND one `job_state_transitions` row with `fromState: null, toState: 'awaiting_moderation', actorKind: 'user'`.
- **`it('createJob.afterCommit fires once + swallows errors')`** — provide `afterCommit` that throws; assert `createJob` resolves; the row + audit still committed; the error was logged.
- **`it('approveJob writes two audit rows in one transaction')`** — call `approveJob`; assert `jobs.state = 'enrollment_open'` (NOT `'approved'`) AND exactly two `job_state_transitions` rows for that jobId in chronological order: (a) `awaiting_moderation → approved, actorKind: user`; (b) `approved → enrollment_open, actorKind: system, actorId: null`.
- **`it('reject persists rejectionReason + audit note')`** — call `transitionJob({ event: 'reject', note: 'Dues too low', beforeStateWrite: setRejectionReason })`; assert `jobs.state = 'rejected'`, `jobs.rejectionReason = 'Dues too low'`, audit row `note = 'Dues too low'`.
- **`it('lock persists workDate via beforeStateWrite')`** — assert `jobs.workDate` set + audit row note is the ISO date.
- **`it('reschedule clears workDate + audit note has prior date')`** — pre-set `workDate`; call reschedule; assert `jobs.workDate = NULL` AND audit row `note = '<prior ISO>'`.
- **`it('cancel writes cancellationReason in both source states')`** — once from `enrollment_open`, once from `locked`.
- **`it('complete persists confirmedAttendee timestamps + perActiveDuesCredit')`** — verify the dues-credit map sums exactly to `duesAmount` (cents rounded).
- **`it('revert clears attendees + dues credit')`** — assert both columns NULL post-revert.
- **`it('payment_sent fires afterCommit')`** — provide a mock `afterCommit`; assert it was called once with no args.
- **`it('confirm_receipt closes')`** — single-actor happy path.
- **`it('dispute persists disputeReason + fires afterCommit')`** — similar.
- **`it('resolve_closed / resolve_cancelled / resolve_payment_sent transitions each work')`** — three separate tests.
- **`it('optimistic concurrency rejects second writer')`** — start two concurrent `transitionJob` calls via `Promise.allSettled`; assert exactly one fulfilled + one rejected with `ConcurrentTransitionError`.
- **`it('transaction rollback on beforeStateWrite throw')`** — `beforeStateWrite` throws; assert `jobs.state` unchanged AND zero `job_state_transitions` rows for that jobId.
- **`it('terminal states reject any event')`** — for each of `closed`, `cancelled`, `rejected`, try every event; each throws `FsmViolationError`.

### `packages/domain/__tests__/integration/relationship-events.integration.test.ts` — PG16

- **`it('enroll writes job_enrollments row + audit row atomically')`** — call `recordRelationshipEvent({ event: 'enroll', currentState: 'enrollment_open', beforeAuditWrite: insertJobEnrollment })`; assert both rows present, audit row has `fromState == toState == 'enrollment_open'` and `note: 'enroll'`.
- **`it('unenroll deletes + writes audit atomically')`** — symmetric.
- **`it('recordRelationshipEvent rolls back on beforeAuditWrite throw')`** — beforeAuditWrite throws; neither write lands.

### `packages/domain/__tests__/integration/user-role-transitions.integration.test.ts` — PG16

- **`it('last-Admin demotion throws MinAdminInvariantError')`** — single Admin exists; `transitionRole({ expectedFromRole: 'Admin', toRole: 'Alumni' })` → catches PG `23514` and re-throws `MinAdminInvariantError`.
- **`it('atomic swap succeeds in a single transaction')`** — wrap two `transitionRole` calls (promote B, demote A) in `db.transaction(async tx => {...})`; commit succeeds (deferred trigger passes).
- **`it('sequential promote then demote succeeds')`** — control case (two separate txs).
- **`it('BOOTSTRAP_ADMIN_EMAIL recovery path')`** — start with zero Admins (set up via direct UPDATE with deferred trigger); promote one user → commit succeeds.

### `packages/domain/__tests__/no-direct-state-writes.test.ts` — static analysis

- Grep or AST-walk the codebase: `UPDATE jobs SET state =` and `UPDATE users SET role =` patterns must only appear inside `packages/domain/`. Any hit elsewhere → fail.
- Similarly grep for `INSERT INTO job_state_transitions` — must only appear inside `packages/domain/` (per DESIGN-002 §1's invariant about the single writer of the audit-log table).

## 5. Playwright E2E tests

**None.** Module-internal API; tested at the unit + integration layer here.

## 6. Pass/fail gates

- [ ] `pnpm --filter @app/domain typecheck` passes including the `// @ts-expect-error` directive.
- [ ] `pnpm --filter @app/domain test` passes all suites in §4.
- [ ] Coverage report shows >90% on `job-state-machine.ts`, `user-role-transitions.ts`, `errors.ts` (the helper modules — not the test files themselves).
- [ ] No `UPDATE jobs SET state` / `UPDATE users SET role` / `INSERT INTO job_state_transitions` outside `packages/domain/` per the static-analysis test.
- [ ] One PLAN-003 commit on the branch.

## 7. Resume notes

Tests are independent. Re-run failing files; testcontainer is cheap to respin. The static-analysis grep is fast; run it last.

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-003. Covers all ST-01..ST-17 + recordRelationshipEvent (DESIGN-002 §4.1.5) + createJob.afterCommit + min-Admin atomic-swap. Includes a static-analysis test for the "single writer of state + audit-log" invariant from DESIGN-002 §1. |
