---
id: PLAN-005
title: tRPC procedures implementation — all 5 routers per DESIGN-003
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: L
related:
  prds: [PRD-002, PRD-004, PRD-005, PRD-006, PRD-007, PRD-008]
  adrs: [ADR-003, ADR-008]
  bounded_contexts: [BCC-01, BCC-02, BCC-03]
  aggregates: [ADC-01, ADC-02]
  designs: [DESIGN-003]
  plans:
    prerequisite: [PLAN-001, PLAN-002, PLAN-003, PLAN-004]
    lateral: [VALIDATION-005]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Implement DESIGN-003 end-to-end: 5 routers (jobs, users, settings, admin, invites) covering every MVP command + query. Each procedure cites a PRD CMD-NN / Q-NN; auth + role + ownership middleware composed per DESIGN-003 §4.2 / §4.3; `confirmReceipt` race handling per PRD-006 R-04 / DESIGN-003 §4.4.

> **Definition of success:** every PRD AC across PRDs 002, 004, 005, 006 (and the read-side of 007, 008) is verified by an integration test against testcontainers PG16 calling the corresponding procedure. All 16 BCC-02 commands + 8 queries + the BCC-01/03 procedures are reachable; FORBIDDEN/UNAUTHORIZED/CONFLICT error mapping verified.

## 2. Inputs

1. `docs/designs/003-trpc-api-surface.md` — the implementation contract.
2. `docs/designs/002-fsm-module.md` — the helpers this layer wires into HTTP.
3. PRDs 002, 004, 005, 006, 007, 008 §5 R-NN + §5.1 ACs (the contract being verified).
4. PLAN-001..PLAN-004 (scaffolding, schema, FSM, auth all in place).

## 3. Outputs

- `packages/api/src/middleware/auth.ts` (already in PLAN-001 scaffold; flesh out)
- `packages/api/src/middleware/role.ts` per DESIGN-003 §4.2
- `packages/api/src/middleware/job.ts` per DESIGN-003 §4.3
- `packages/api/src/routers/jobs.ts` per DESIGN-003 §4.4 — 16 mutations + 8 queries
- `packages/api/src/routers/users.ts` per DESIGN-003 §4.5
- `packages/api/src/routers/settings.ts` per DESIGN-003 §4.6
- `packages/api/src/routers/admin.ts` per DESIGN-003 §4.7
- `packages/api/src/routers/invites.ts` per DESIGN-003 §4.8
- `packages/api/src/routers/index.ts` aggregating into `appRouter` per DESIGN-003 §4.9
- `packages/api/src/dues.ts` (helper from DESIGN-003 §4.4.1)
- Per-router integration tests in `packages/api/__tests__/integration/`
- E2E happy-path test in `packages/api/__tests__/e2e/walking-skeleton.test.ts` per DESIGN-003 §8
- Wire `apps/web/app/api/trpc/[trpc]/route.ts` to use `appRouter` (replace the PLAN-001 stub)
- One commit per router (5 commits) OR one combined commit, agent's choice (lean: combined for atomicity)

## 4. Steps

### Step 1 — Middleware

- **Action:** implement `packages/api/src/middleware/role.ts` and `packages/api/src/middleware/job.ts` per DESIGN-003 §4.2 / §4.3. Update `packages/api/src/trpc.ts` to expose `authedProcedure`, `publicProcedure`, `router` per §4.1.
- **Verification:** typecheck passes; unit tests for each middleware variant covering the FORBIDDEN paths.

### Step 2 — `jobs` router

- **Action:** implement all procedures in DESIGN-003 §4.4 verbatim (with the helper sketches expanded). Implement `computeDuesSplit()` in `packages/api/src/dues.ts` per §4.4.1 (cents-rounding rule from ADC-01 INV-05 — alphabetically-first attendee absorbs the cent surplus).
- **Verification:** integration tests in `packages/api/__tests__/integration/jobs.test.ts`:
  - One happy-path test per command (16 tests).
  - Per-command auth/role rejection tests (UNAUTHORIZED for missing session, FORBIDDEN for wrong role, FORBIDDEN for non-poster on poster-restricted operations).
  - `confirmReceipt` race test: two `Promise.all` calls; one returns `{ alreadyClosed: true }`.
  - Validation tests for the EARS rules (dues > 0, description non-empty, recommended count ≥ 1, etc.).

### Step 3 — `users` router

- **Action:** implement per DESIGN-003 §4.5. Wire `users.changeRole` into `transitionRole()` from PLAN-003.
- **Verification:** integration tests including:
  - Self-service Active → Alumni succeeds.
  - Self-service Active → Moderator returns FORBIDDEN.
  - Admin grant Moderator succeeds.
  - Last-Admin self-demote returns 422 with `MIN_ADMIN_INVARIANT_VIOLATED`.

### Step 4 — `settings` router

- **Action:** implement per DESIGN-003 §4.6. Per-key Zod validators per the table in §4.6.
- **Verification:** integration tests for each setting key — valid value persists; invalid value returns 400.

### Step 5 — `admin` router

- **Action:** implement per DESIGN-003 §4.7. Aggregate-counts query uses live SQL (`sql\`SELECT state, COUNT(*) ...\``).
- **Verification:** integration test seeds a known mix of jobs across states; query returns the expected counts.

### Step 6 — `invites` router

- **Action:** implement per DESIGN-003 §4.8. Token generation uses `crypto.randomUUID()`.
- **Verification:** integration tests: generate → list shows the new token → revoke → list shows revokedAt set; verifyInviteToken (from PLAN-004) rejects revoked tokens.

### Step 7 — Aggregate `appRouter` + wire into Next.js

- **Action:** export `appRouter` from `packages/api/src/routers/index.ts`. Replace the PLAN-001 stub at `apps/web/app/api/trpc/[trpc]/route.ts` with the tRPC adapter wired to `appRouter` and `createTRPCContext`.
- **Verification:** `pnpm --filter web dev` boots; `curl localhost:3000/api/trpc/jobs.listMyPosted` (with a session cookie from PLAN-004) returns the expected response.

### Step 8 — Walking-skeleton E2E

- **Action:** `packages/api/__tests__/e2e/walking-skeleton.test.ts` per DESIGN-003 §8 — programmatically calls `invites.generate` → mock signup → `jobs.post` → `jobs.approve` → `jobs.enroll` → `jobs.lock` → `jobs.complete` → `jobs.markPaymentSent` → `jobs.confirmReceipt` → assert `closed`. Asserts the audit log has all 7 expected rows in order.
- **Verification:** E2E test passes; full happy path verified at the API layer.

### Step 9 — Commit

- **Action:** commit per Outputs.

## 5. Verification

- [ ] `pnpm --filter @app/api typecheck && test` passes.
- [ ] Every PRD AC across 002, 004, 005, 006 (and 007/008 read-side) maps to a passing test.
- [ ] `pnpm --filter web build` succeeds with the wired tRPC handler.
- [ ] One (or 5) commit(s) on the current branch.

## 6. Out of scope

- UI components (PLAN-006).
- Notifications side-effects (`afterCommit` hooks call into stubs in this plan; PLAN-007 implements).
- Webhooks (PLAN-007 / DESIGN-005).

## 7. Risks & gotchas

- **Risk:** the `confirmReceipt` race handling returns a non-error 200 with `alreadyClosed: true` — non-standard tRPC behavior. Document on the procedure with a JSDoc + verify in tests. **Mitigation:** Step 2 covers this.
- **Risk:** input validation duplication — Zod schemas in procedures may diverge from drizzle-zod-derived schemas in the schema package. **Mitigation:** import + pick from drizzle-zod where possible (Q-DSG-03 in DESIGN-003).
- **Risk:** the BCC-01 `users.getSession` is a `publicProcedure` (returns null when unauthenticated), but the CSRF / cookie path must be correct. **Mitigation:** verify with an integration test that a fresh Playwright context returns null and an authenticated context returns a session.
- **Risk:** large router file (`jobs.ts` is ~400 lines per DESIGN-003 §4.4). Acceptable; split per-procedure-into-files if it grows. **Mitigation:** none for MVP.

## 8. Resume points

- After Step 1: middleware ready.
- After Step 2: jobs router complete + tested.
- After Step 6: all routers complete.
- After Step 7: end-to-end wiring through Next.js.
- After Step 8: walking-skeleton E2E passes.
- After Step 9: committed.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Per-router commits or one combined? | One combined commit — tests pass holistically; no value in per-router checkpoints. |
| Q-PLN-02 | The `afterCommit` hook in `markPaymentSent` calls `sendTreasurerEmail` from PLAN-007 — but PLAN-007 may not be done yet. **Mitigation:** PLAN-005 calls a stub helper that PLAN-007 replaces; the test just asserts the stub was called. | Stub in this plan; replace in PLAN-007. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. 9 steps to land all 5 routers + E2E + Next.js wiring. Notifications stubbed; PLAN-007 swaps in. |
| 2026-05-14 | Tom Haynes | Plan-decomposition pass: frontmatter `related.plans` reshaped to `{prerequisite, lateral}` with VALIDATION-005 paired. No scope change — PLAN-005 already covers all 5 routers including admin + users.changeRole. VALIDATION-005's coverage matrix requires per-procedure integration tests for admin.* and users.changeRole (not exercised by PLAN-008's happy-path E2E). |
