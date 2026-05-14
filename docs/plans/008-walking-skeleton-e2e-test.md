---
id: PLAN-008
title: Walking-skeleton E2E test — full happy-path click-through via Playwright
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: S
related:
  prds: [PRD-001, PRD-002, PRD-004, PRD-005, PRD-006]
  adrs: [ADR-004]
  bounded_contexts: [BCC-01, BCC-02]
  aggregates: [ADC-01]
  designs: [DESIGN-006]
  plans: [PLAN-001, PLAN-002, PLAN-003, PLAN-004, PLAN-005, PLAN-006, PLAN-007]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Write the canonical Playwright E2E test that proves the walking-skeleton happy path works end-to-end: 4 personas (Active, Alumni, Moderator, Admin), real Postgres + Resend (mocked at the SDK level), real Better Auth, real tRPC, real Next.js. Ends with the job in `closed` state and an audit log of all 7 transitions verifiable via `users.getRoleHistory`.

> **Definition of success:** `pnpm --filter web e2e` runs the test against `pnpm dev` (or a dedicated test server) and it passes consistently.

## 2. Inputs

1. `docs/domain-driven-design/001-ddd-active-walking-skeleton.md` (E-01..E-13 timeline + Mermaid diagram).
2. `docs/domain-driven-design/002-ddd-alumni-walking-skeleton.md` (E-01a..E-22 timeline + Mermaid diagram).
3. PLAN-001..PLAN-007 (everything wired and passing per their own verifications).

## 3. Outputs

- `apps/web/e2e/walking-skeleton.spec.ts` — the test
- `apps/web/e2e/fixtures/seed-chapter.ts` — pre-test setup helper (chapter_settings + bootstrap Admin)
- `apps/web/e2e/fixtures/personas.ts` — helpers for switching between the 4 test personas (login as each)
- Updates to `playwright.config.ts` to wire DB seeding + Resend mocking
- Commit: `test(e2e): walking-skeleton happy-path Playwright test`

## 4. Steps

### Step 1 — Test environment setup

- **Action:** `playwright.config.ts` configures:
  - `webServer` running `pnpm dev` against a test Postgres (testcontainers-managed via the test runner OR a docker-compose-managed test DB on a dedicated port).
  - `globalSetup` that: spins up Postgres (if not already), runs migrations, seeds `chapter_settings` (admin/treasurer recipients = test inboxes; chapter_timezone = America/New_York), seeds the bootstrap Admin via `BOOTSTRAP_ADMIN_EMAIL` env var.
  - `globalTeardown` that: tears everything down.
- **Verification:** `pnpm --filter web e2e --list` shows the test discoverable.

### Step 2 — Persona helpers

- **Action:** `fixtures/personas.ts` exposes `loginAs('active' | 'alumni' | 'moderator' | 'admin')` helpers that:
  - For Admin: directly via the bootstrap-admin path.
  - For others: programmatically generate an invite token (Admin), then sign up via the form OR programmatically.
- **Verification:** unit tests for the helpers themselves.

### Step 3 — The walking-skeleton test

- **Action:** `walking-skeleton.spec.ts` — one big `test('full happy-path job loop', ...)` block that:
  1. Acts as Admin → generate Active + Alumni invite links via `invites.generate` (or via the future Admin UI).
  2. Acts as Alumni → opens the Alumni invite link → signs up → posts a job (description "Help me move a couch", dues=50, recommended=2).
  3. Acts as Moderator → opens `/moderation-queue` → approves the job.
  4. Acts as Active (signed up via Active invite link) → opens `/jobs` → enrolls in the job.
  5. (Optional second Active for multi-attendee scenario.)
  6. Acts as Alumni → opens the job → locks it with a future date (e.g., now + 1 day).
  7. Skips work (off-app).
  8. Acts as Alumni → marks complete with the Active(s) as confirmed attendees.
  9. Asserts: a `TreasurerBreakdown` email was queued via the mocked Resend SDK with the correct recipient + line items (Active gets $50.00).
  10. Acts as Alumni → marks payment-sent.
  11. Acts as Active → opens the job → confirms received.
  12. Asserts: job state is `closed`; the `job_state_transitions` table has the expected sequence of rows (verified via a tRPC `jobs.getHistory` call as Admin).
- **Verification:** test passes consistently (run 5x to check for flake).

### Step 4 — Commit

- **Action:** commit per Outputs.

## 5. Verification

- [ ] `pnpm --filter web e2e` passes.
- [ ] Run the test 5x in a row; all 5 pass (no flake).
- [ ] The audit-log assertion at the end correctly identifies the 7 expected transitions:
  - `null → awaiting_moderation` (Alumni, on PostJob)
  - `awaiting_moderation → approved` (Moderator, on Approve)
  - `approved → enrollment_open` (system, immediately after)
  - `enrollment_open → locked` (Alumni, on Lock)
  - `locked → completed` (Alumni, on Complete)
  - `completed → payment_sent` (Alumni, on MarkPaymentSent)
  - `payment_sent → closed` (Active, on ConfirmReceipt)
- [ ] One commit.

## 6. Out of scope

- Dispute path E2E (defer to `dispute.spec.ts` in MVP follow-up).
- Min-Admin error E2E (defer to `min-admin.spec.ts`).
- Role-management E2E (defer).
- Admin view E2E (defer).
- Cross-browser testing (Chromium only for MVP).
- Visual regression / screenshot comparison (defer).

## 7. Risks & gotchas

- **Risk:** test-DB lifecycle — clean state between runs is critical. **Mitigation:** truncate-all-tables in `beforeEach` (or use a fresh DB per test run via testcontainers; trade-off: fresh DB is slower but bulletproof).
- **Risk:** Resend mock — Playwright `page.route()` doesn't intercept Server-side requests. Mock at the SDK level via dependency injection / module replacement. **Mitigation:** export a `mockableResendClient` from `packages/notifications` and swap it in test mode via env var.
- **Risk:** Better Auth + Playwright session cookie management. **Mitigation:** use Playwright's `context.storageState()` to persist + reuse signed-in sessions across `test()` blocks.
- **Risk:** flake on `confirmReceipt` race (Active + Admin both clicking) — but the walking-skeleton test only has the Active clicking. **Mitigation:** N/A for this plan; race is tested at the API layer in PLAN-005.

## 8. Resume points

- After Step 1: env wired.
- After Step 2: personas usable.
- After Step 3: test passing.
- After Step 4: committed.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Should the test exercise the "two Active enroll, both confirmed attendee" path or just one Active? | Lean: **two Actives** — exercises the dues-split rounding edge case (R-04 from PRD-005) more thoroughly. |
| Q-PLN-02 | Reuse same chapter_settings across tests vs. seed fresh per test? Lean: **reuse + truncate jobs/users between tests** — chapter setup is expensive. | Apply in Step 1's `globalSetup`. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. 4 steps to land the canonical walking-skeleton E2E test. |
