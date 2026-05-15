---
id: PLAN-003
title: FSM module implementation — transitionJob + transitionRole helpers + tests
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
    prerequisite: [PLAN-001, PLAN-002]
    lateral: [VALIDATION-003]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Implement DESIGN-002 verbatim: `JOB_TRANSITIONS` map + `transitionJob()` + `createJob()` (with `afterCommit` parameter per DESIGN-002 §4.1.3) + `approveJob()` + `recordRelationshipEvent()` (per DESIGN-002 §4.1.5 — the single writer for enroll/unenroll audit-log rows) + `transitionRole()` + the typed error classes. Comprehensive test suite covering type-narrowing, atomic transactions, optimistic concurrency, and the deferred-CHECK min-Admin invariant integration.

> **Produces:** `packages/domain/job-state-machine.ts` + `user-role-transitions.ts` + `errors.ts` + a test suite that exercises every transition path, every typed error, AND the relationship-event helper that PLAN-005's `jobs.enroll` / `jobs.unenroll` depend on.
> **Definition of success:** `pnpm --filter @app/domain test` passes; the type-narrowing smoke test (`@ts-expect-error` block) compiles; concurrent-transition race tests reliably show first-write-wins; min-Admin atomic-swap test passes.

## 2. Inputs

1. `docs/designs/002-fsm-module.md` — the implementation contract.
2. `docs/adrs/008-job-state-machine.md` — rationale for the chosen approach.
3. `docs/adrs/011-role-partition-in-better-auth.md` — for the `transitionRole` integration with the deferred-CHECK trigger.
4. `docs/domain-driven-design/aggregates/001-job-aggregate-canvas.md` §3 + §6 — ST-NN + CMD-NN pre-conditions.

### Repo state assumed

PLAN-002 complete: schema + migrations + min-Admin trigger in place.

## 3. Outputs

- `packages/domain/src/job-state-machine.ts` — JOB_TRANSITIONS const + transitionJob<S, E>() + createJob() (with optional `afterCommit` callback per DESIGN-002 §4.1.3) + approveJob() + recordRelationshipEvent() (per DESIGN-002 §4.1.5).
- `packages/domain/src/user-role-transitions.ts` — transitionRole().
- `packages/domain/src/errors.ts` — FsmViolationError, ConcurrentTransitionError, MinAdminInvariantError + isPostgresCheckViolation helper.
- `packages/domain/src/index.ts` — barrel exporting the public API.
- `packages/domain/__tests__/job-state-machine.test.ts` — unit tests (type narrowing, map completeness).
- `packages/domain/__tests__/integration/job-state-machine.integration.test.ts` — integration tests against testcontainers PG16.
- `packages/domain/__tests__/integration/user-role-transitions.integration.test.ts` — min-Admin invariant integration tests.
- One git commit: `feat(domain): FSM helpers per DESIGN-002 — transitionJob/transitionRole + atomic audit-log writes + min-Admin error mapping`.

## 4. Steps

### Step 1 — Create `errors.ts`

- **Action:** copy DESIGN-002 §4.3 verbatim into `packages/domain/src/errors.ts`. Confirm `isPostgresCheckViolation()` correctly types-narrows `unknown → { code: '23514'; message: string }`.
- **Verification:** `pnpm --filter @app/domain typecheck` passes.

### Step 2 — Create `job-state-machine.ts`

- **Action:**
  - Copy DESIGN-002 §4.1.1 (the `JOB_TRANSITIONS` const) verbatim.
  - Copy DESIGN-002 §4.1.2 (the `transitionJob()` function) verbatim, including the `afterCommit?: () => Promise<void>` field on `TransitionJobInput` and the post-commit try/log/swallow block.
  - Copy DESIGN-002 §4.1.3 (`createJob()` — with the `afterCommit?: (jobId) => Promise<void>` parameter the PRD-002 R-12 moderator-queue notification depends on) and `approveJob()` verbatim.
  - Copy DESIGN-002 §4.1.5 (`recordRelationshipEvent()` — the single writer for non-FSM audit-log rows from `jobs.enroll` / `jobs.unenroll`; PLAN-005 imports this) verbatim.
  - Verify the `JOB_TRANSITIONS` const compiles with the `satisfies Record<JobState, ...>` clause — every state in the enum must have an entry (terminals: `{}`).
- **Verification:** `pnpm --filter @app/domain typecheck` passes; `recordRelationshipEvent` is exported from `packages/domain/src/index.ts`.

### Step 3 — Create `user-role-transitions.ts`

- **Action:** copy DESIGN-002 §4.2 verbatim. Confirm the `.catch()` branch maps `isPostgresCheckViolation + 'min-Admin'` substring → `MinAdminInvariantError`.
- **Verification:** typecheck passes.

### Step 4 — Add `index.ts` barrel

- **Action:**

  ```ts
  // packages/domain/src/index.ts
  export * from './job-state-machine';
  export * from './user-role-transitions';
  export * from './errors';
  ```

- **Verification:** consumer-side `import { transitionJob } from '@app/domain'` resolves.

### Step 5 — Unit tests for the transitions map

- **Action:**
  - `packages/domain/__tests__/job-state-machine.test.ts`:
    - **Type-narrowing test:** include a `// @ts-expect-error` block that attempts an illegal `transitionJob({ expectedFromState: 'closed', event: 'lock' })`. Use `tsd` or a manual `// @ts-expect-error` assertion via `vitest`'s `expectTypeOf`.
    - **Map completeness:** every value in `JOB_STATES` (from `@app/db/schema`) has an entry in `JOB_TRANSITIONS` (terminal states: empty object).
    - **Map values:** every `to` state in the map is also a member of `JOB_STATES`.
    - **Coverage of ADC-01 ST-NN:** for each ST-NN listed in ADC-01 §3, assert the corresponding entry exists in the map.
- **Verification:** `pnpm --filter @app/domain test` passes the unit suite.

### Step 6 — Integration tests for `transitionJob`

- **Action:** `packages/domain/__tests__/integration/job-state-machine.integration.test.ts` (uses `@app/test-utils.startPostgres` from PLAN-001 + applies migrations from PLAN-002 in `beforeAll`):
  - **Happy path:** create a job (`createJob`) → approve (`approveJob`) → assert two audit-log rows (one user-actor, one system-actor) per DESIGN-002 §4.1.3.
  - **Each transition once:** for each ST-01..ST-17 in ADC-01, exercise the transition end-to-end and assert (a) `jobs.state` updated; (b) one `job_state_transitions` row written with expected `actor_id` + `actor_kind` + `note`.
  - **Optimistic concurrency:** start two concurrent `transitionJob` calls on the same job; assert exactly one succeeds; the other throws `ConcurrentTransitionError`. Use `Promise.allSettled` + assert one fulfilled, one rejected with the expected error class.
  - **Transaction rollback:** force a failure inside `afterStateWrite` (e.g., `beforeStateWrite` throws); assert `jobs.state` unchanged AND no audit-log row written.
  - **`afterCommit` failure:** force `afterCommit` to throw; assert `transitionJob` resolves successfully (transition committed), the error is logged.
  - **Two-row pattern:** invoke `approveJob` and assert exactly two `job_state_transitions` rows: one with `actor_kind: 'user'` and one with `actor_kind: 'system'`, both inside the same transaction (their `created_at` deltas are < 100ms, both visible after the same `pg_advisory_lock` cycle).
  - **`createJob.afterCommit`:** provide an `afterCommit` callback; assert it runs once with the new jobId after the row commits; on callback throw, assert the row is still present (the callback failure is logged, not propagated).
  - **`recordRelationshipEvent` happy path:** insert a `jobs` row in `enrollment_open`; call `recordRelationshipEvent({ event: 'enroll', currentState: 'enrollment_open', beforeAuditWrite: insert-job_enrollments-row })`; assert (a) the job_enrollments row exists, (b) one `job_state_transitions` row with `from_state == to_state == 'enrollment_open'` and `note: 'enroll'`, (c) both writes were transactional (force `beforeAuditWrite` to throw → no enrollment AND no audit row).
  - **`recordRelationshipEvent` unenroll:** parallel test for `event: 'unenroll'` with `beforeAuditWrite` deleting the enrollment row.
- **Verification:** all integration tests pass.

### Step 7 — Integration tests for `transitionRole` (min-Admin)

- **Action:** `packages/domain/__tests__/integration/user-role-transitions.integration.test.ts`:
  - Setup: insert one Admin user + several non-Admin users.
  - **Last-Admin demotion blocked:** call `transitionRole` to demote the Admin to Alumni → throws `MinAdminInvariantError`.
  - **Atomic swap succeeds:** in a single transaction (use a manual `db.transaction(async (tx) => { ... })` calling `transitionRole` twice — once promote B to Admin, once demote A to Alumni); the deferred trigger fires at COMMIT and passes.
  - **Promote new Admin then demote works:** sequential (not in one tx) — promote B to Admin → demote A to Alumni → both succeed.
  - **`BOOTSTRAP_ADMIN_EMAIL` flow** (zero-Admin → one-Admin recovery): set `users.role = 'Active'` for everyone (manually bypass the trigger via direct DB manipulation in test setup); call `transitionRole` to promote one user to Admin → succeeds.
- **Verification:** all integration tests pass.

### Step 8 — Document + commit

- **Action:**
  - Add `packages/domain/README.md` briefly noting "FSM helpers — see `docs/designs/002-fsm-module.md` for the design contract."
  - Commit:

    ```
    feat(domain): FSM helpers per DESIGN-002 — transitionJob/transitionRole + atomic audit-log writes + min-Admin error mapping

    PLAN-003 complete. Realises ADR-008 + ADR-009 + ADR-011.
    All ST-01..ST-17 transitions tested; concurrent-transition race verified;
    min-Admin invariant integration including atomic-swap edge case (PRD-008 AC-05).
    ```

## 5. Verification

- [ ] `pnpm --filter @app/domain typecheck` passes (incl. the @ts-expect-error type-narrowing assertion).
- [ ] `pnpm --filter @app/domain test` passes all unit + integration suites.
- [ ] Test coverage report shows >90% on `transitionJob`, `transitionRole`, error classes.
- [ ] All ACs in DESIGN-002 §8 are implemented as tests.

## 6. Out of scope

- tRPC procedure wiring (PLAN-005).
- Auth integration (PLAN-004).
- Any UI (PLAN-006).
- Notifications side-effect implementations (PLAN-007).

## 7. Risks & gotchas

- **Risk:** Drizzle's `.transaction()` helper rolls back on thrown errors, but the agent must NOT swallow errors inside the transaction body — they must propagate to trigger rollback. **Mitigation:** Step 6's transaction-rollback test exercises this.
- **Risk:** The two-row pattern in `approveJob` requires both rows to be in the same transaction. If split across two transactions, a crash between them leaves an "approved with no enrollment_open" state. **Mitigation:** verify in Step 6 with the two-row test.
- **Risk:** `isPostgresCheckViolation` matches by error code `23514` AND a substring of the error message. If the trigger's error message changes, the substring match silently breaks. **Mitigation:** the trigger function from DESIGN-001 §5.3 uses a stable message; adding a custom Postgres error code (Q-PLN-02 in PLAN-002) would harden this further — defer to ADR amendment if needed.
- **Risk:** TypeScript narrowing in `transitionJob<S, E>` depends on careful type inference; some TS versions may infer `E` as the union rather than the narrowed value. **Mitigation:** test with `expectTypeOf` to assert the right inference.

## 8. Resume points

- After Step 1: errors.ts in place.
- After Step 4: full module exports available.
- After Step 5: unit tests passing.
- After Step 6: job FSM integration tests passing.
- After Step 7: role transitions integration tests passing.
- After Step 8: committed.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | The `afterCommit` hook fires after the transaction commits, in the same async function. If the process crashes between commit and the hook, the side effect (treasurer email) is lost. **Lean: log + accept for MVP** (per DESIGN-002 Q-DSG-02 + BCC-02 Q-CTX-03). Outbox pattern post-MVP. | Mention in commit message; defer outbox. |
| Q-PLN-02 | For the optimistic-concurrency race test, how do we deterministically interleave two transactions? Use Postgres advisory locks in the test setup, or just rely on `Promise.all`? **Lean: `Promise.all` is non-deterministic but reliable enough at the millisecond scale**; advisory locks if flake appears. | Start with `Promise.all`; switch to advisory locks on first flake. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. 8 steps from errors.ts to committed FSM module. Comprehensive integration tests for type narrowing, all ST-01..ST-17 transitions, optimistic concurrency, two-row approval pattern, and min-Admin atomic-swap. |
| 2026-05-14 | Tom Haynes | Plan-decomposition pass: §1 + §3 + Step 2 + Step 6 extended to cover the post-doc-review additions to DESIGN-002 — `createJob.afterCommit` parameter (§4.1.3) and `recordRelationshipEvent()` helper (§4.1.5). Frontmatter `related.plans` reshaped to `{prerequisite, lateral}` with VALIDATION-003 paired. PLAN-005's `jobs.enroll` / `jobs.unenroll` + `jobs.post` afterCommit depend on these. |
