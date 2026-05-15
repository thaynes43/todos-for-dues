---
id: VALIDATION-008
title: Validation — PLAN-008 walking-skeleton E2E test
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
  plans:
    pairs_with: PLAN-008
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-008's canonical walking-skeleton Playwright test passes consistently and exercises every happy-path PRD AC in one chained click-through. PLAN-008 IS itself a test plan; VALIDATION-008's role is the meta-validation — does the test exist, is it discoverable, does it pass 5/5 runs in a row (no flake), and does the final audit-log assertion enumerate the expected 7 transitions?

## 2. Inputs

- **Paired implementation plan:** `docs/plans/008-walking-skeleton-e2e-test.md`.
- **PRDs / designs:** the walking-skeleton subset across PRDs 002 / 004 / 005 / 006 happy-path ACs (PRD-002 AC-01/AC-08, PRD-004 AC-01/AC-02/AC-08, PRD-005 AC-04/AC-07, PRD-006 AC-01).
- **Running artifacts:** the test itself runs against `pnpm dev` per its own playwright.config; the test's mocked Resend SDK passes data through to PLAN-007's helpers.

## 3. Coverage matrix

| PRD AC | Step in PLAN-008 spec | Verification inside the spec |
|---|---|---|
| PRD-002 AC-01 (post → awaiting_moderation + audit row) | Alumni posts | spec asserts state badge `awaiting moderation` |
| PRD-002 AC-08 (Approve → state) | Moderator approves | spec asserts state badge `enrollment-open` after approve (DESIGN-002 §4.1.3 collapses approved→enrollment_open) |
| PRD-004 AC-01 (system transition approved→enrollment_open) | (implicit in approve) | spec checks audit log via `getHistory` assertion |
| PRD-004 AC-02 (enroll happy path + audit) | Active enrolls | spec asserts state still `enrollment-open` and roster includes Active |
| PRD-004 AC-08 (lock happy path) | Alumni locks | spec asserts state `locked`, workDate visible |
| PRD-005 AC-01 (complete persists attendees) | Alumni completes | spec asserts state `completed` |
| PRD-005 AC-04 (even-split dues calc) | (computed during complete) | spec asserts the credit-per-Active shown matches dues/N |
| PRD-005 AC-07 (markPaymentSent fires email + transitions) | Alumni marks payment-sent | spec asserts state `payment-sent` AND a mocked-Resend call was made with the expected TreasurerBreakdown payload |
| PRD-006 AC-01 (confirmReceipt closes loop) | Active confirms | spec asserts state `closed` |
| PRD-001 R-15 (audit log completeness — 7 rows) | final assertion via `jobs.getHistory` as Admin | spec asserts the 7-row sequence per PLAN-008 §5 |

## 4. Unit tests

**None.** The validation surface is the Playwright spec itself. The helper fixtures (`personas.ts`, `seed-chapter.ts`) MAY have small Vitest unit tests if their logic is non-trivial (e.g., login state-store generation) — but typically not required.

## 5. Playwright E2E tests

The single canonical `apps/web/e2e/walking-skeleton.spec.ts` from PLAN-008.

**Acceptance for VALIDATION-008:**
- The spec is discoverable via `pnpm --filter web e2e --list` and named `walking-skeleton.spec.ts`.
- Runs to completion in <2 minutes against `pnpm dev` + a freshly-migrated PG16 testcontainer.
- The final assertion against `jobs.getHistory` enumerates the expected 7 rows in order:
  1. `null → awaiting_moderation` (actor: Alumni)
  2. `awaiting_moderation → approved` (actor: Moderator)
  3. `approved → enrollment_open` (actor: system)
  4. `enrollment_open → locked` (actor: Alumni)
  5. `locked → completed` (actor: Alumni)
  6. `completed → payment_sent` (actor: Alumni)
  7. `payment_sent → closed` (actor: Active)
- Optional enroll/unenroll audit rows from `recordRelationshipEvent` appear in the appropriate positions (between rows 3 and 4) — the spec MAY assert their presence with `fromState == toState == 'enrollment_open'` and `note: 'enroll'` (depending on whether PLAN-008's assertion enumerates enroll/unenroll rows; PRD-008 §5 lists 7 FSM transitions but enroll is technically an 8th audit row).

## 6. Pass/fail gates

- [ ] `pnpm --filter web e2e -- --grep walking-skeleton` passes.
- [ ] Run 5x in a row — all 5 pass (PLAN-008 §5 "no flake" gate).
- [ ] The final audit-log assertion exactly matches the expected sequence — no extra rows, no missing rows (modulo enroll/unenroll which may or may not be enumerated per the §5 note above).
- [ ] The mocked Resend SDK recorded exactly one TreasurerBreakdown call with the expected line items.
- [ ] One PLAN-008 commit on the branch.

## 7. Resume notes

If the test fails on a fresh run, do NOT modify the test — fix the implementation per the prompt's rule. If the test fails intermittently, first attempt 5x in a row; if any fail, investigate flake source (race in Better Auth session refresh, stale React Query cache, etc.). Common fix: increase Playwright's `expect` timeout for transitions through tRPC mutations.

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-008. Meta-validation of the canonical walking-skeleton spec; documents the expected 7-row audit-log assertion explicitly so future agents can verify it intact. |
