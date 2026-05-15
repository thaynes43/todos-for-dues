---
id: VALIDATION-010
title: Validation — PLAN-010 MVP job-loop UI completion
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: M
related:
  prds: [PRD-002, PRD-004, PRD-005, PRD-006]
  adrs: [ADR-001]
  bounded_contexts: [BCC-02]
  aggregates: [ADC-01]
  designs: [DESIGN-006]
  plans:
    pairs_with: PLAN-010
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-010 fills the MVP job-loop UI gaps that PLAN-006 deferred. Every PRD-002/004/005/006 AC NOT exercised by VALIDATION-008's happy-path Playwright is exercised here by a dedicated Playwright spec against `pnpm dev`.

## 2. Inputs

- **Paired implementation plan:** `docs/plans/010-mvp-job-loop-ui-completion.md`.
- **PRDs / designs:**
  - `docs/prds/002-job-posting-and-moderation.md` — R-08, R-09, R-10, R-11 + AC-10..AC-14.
  - `docs/prds/004-enrollment-lock-reschedule.md` — R-03, R-04, R-06, R-10, R-11, R-12 + AC-04, AC-05, AC-07 (non-enrolled count-only), AC-12 (reschedule), AC-13/AC-14 (cancel), AC-15 (cancelled terminal).
  - `docs/prds/005-completion-and-payment-sent.md` — R-05 + AC-06 (revert) + §6 Active-side completed view.
  - `docs/prds/006-loop-closure-and-dispute.md` — R-05, R-06 + AC-05, AC-06 (Active dispute) + §6 Active-side disputed view.
  - `docs/designs/006-ui-components.md` §3 (component list) + §4.3 (role-conditional rendering).
- **Running artifacts:** `pnpm dev` + a freshly-seeded testcontainers PG16 with multiple personas (Alumni, Active, Moderator, Admin) provisioned.

## 3. Coverage matrix

| PRD R-NN / AC-NN / §6 UX rule | Component or route | Test |
|---|---|---|
| PRD-002 AC-10 (reject with reason) | `ApproveRejectButtons` → reject modal | `apps/web/e2e/mvp/reject-flow.spec.ts` |
| PRD-002 AC-11 (reject empty reason → server-side validation visible in UI) | reject modal client-side disable | `apps/web/__tests__/components/RejectModal.test.tsx` + e2e |
| PRD-002 AC-12 (rejected job shows reason on detail) | `RejectedJobBanner` | `apps/web/e2e/mvp/reject-flow.spec.ts` |
| PRD-002 AC-13 (rejected terminal — no edit) | `RejectedJobBanner` has only "Post a new job" CTA, no edit form | unit: component renders no edit; e2e clicks CTA → lands on `/jobs/new` blank |
| PRD-002 AC-14 (my-postings list incl. rejected) | `/my-postings` | `apps/web/e2e/mvp/my-postings.spec.ts` |
| PRD-002 R-11 (most-recent-first ordering) | `/my-postings` | same |
| PRD-004 AC-04 (unenroll happy path) | `UnenrollButton` | `apps/web/e2e/mvp/unenroll.spec.ts` |
| PRD-004 AC-05 (unenroll blocked when locked) | `UnenrollButton` hidden when state != enrollment_open | unit test on `JobDetailView` + e2e |
| PRD-004 AC-06 (enrolled Active sees full roster) | `JobDetailView` projects roster names | unit: `JobDetailView.test.tsx` with enrolled viewer prop |
| PRD-004 AC-07 (non-enrolled Active sees count only) | `JobDetailView` projection | unit: same with non-enrolled prop |
| PRD-004 AC-12 (reschedule preserves enrollments) | `RescheduleButton` | `apps/web/e2e/mvp/reschedule.spec.ts` |
| PRD-004 AC-13 (cancel happy path with reason) | `CancelJobModal` | `apps/web/e2e/mvp/cancel.spec.ts` |
| PRD-004 AC-14 (cancel empty reason → validation) | modal client-side disable + server-side reject | same |
| PRD-004 AC-15 (cancelled terminal) | `CancelledJobBanner` shows reason; no actions | same |
| PRD-004 R-06 (my-enrollments list) | `/my-enrollments` | `apps/web/e2e/mvp/my-enrollments.spec.ts` |
| PRD-005 AC-06 (revert from completed → locked, clears attendees) | `RevertCompletionButton` | `apps/web/e2e/mvp/revert-completion.spec.ts` |
| PRD-005 §6 Active-side completed view | `CompletedJobActiveView` | unit: component test |
| PRD-006 AC-05 (Active disputes payment_sent) | `DisputeJobModal` | `apps/web/e2e/mvp/dispute-flow.spec.ts` |
| PRD-006 AC-06 (dispute empty reason rejected) | modal disable + server-side | same |
| PRD-006 §6 Active-side disputed view | `DisputedJobBanner` | same |
| PRD-006 R-04 / AC-04 race (Active + Admin both click confirm) | UI consumes the `alreadyClosed` response from `jobs.confirmReceipt` → toast "Already closed by …" | `apps/web/e2e/mvp/confirm-race.spec.ts` |
| DESIGN-006 §3 components present | each new component renders without throw | `apps/web/__tests__/components/*.test.tsx` |
| DESIGN-006 §4.3 role-conditional rendering for new states | `JobDetailView` extended | `JobDetailView.test.tsx` (snapshot per state×viewer) |

## 4. Unit tests

`apps/web/__tests__/components/` — React Testing Library.

- **`ApproveRejectButtons.test.tsx`** — both buttons render; rejection modal opens; submit disabled until non-empty reason; on submit calls `jobs.reject`.
- **`RejectModal.test.tsx`** (sub-component) — input + submit + cancel; disabled state during pending.
- **`RejectedJobBanner.test.tsx`** — renders reason; "Post a new job" CTA links to `/jobs/new`; no edit affordance present.
- **`CancelledJobBanner.test.tsx`** — renders cancellation reason; no action affordances.
- **`DisputedJobBanner.test.tsx`** — renders "This job is disputed. An Admin is reviewing." text; no resolve actions (those live in /admin/disputes).
- **`ClosedJobBanner.test.tsx`** — renders "Loop closed. Closed by [name]." pulling from the job's history.
- **`UnenrollButton.test.tsx`** — single click; disabled when state != enrollment_open; calls `jobs.unenroll`.
- **`RescheduleButton.test.tsx`** — opens confirm dialog with the "Existing enrollments will be preserved" message; on confirm calls `jobs.reschedule`.
- **`CancelJobModal.test.tsx`** — textarea + submit disabled until non-empty; calls `jobs.cancel`.
- **`RevertCompletionButton.test.tsx`** — confirmation message; calls `jobs.revertCompletion`.
- **`DisputeJobModal.test.tsx`** — textarea + submit; calls `jobs.dispute`.
- **`CompletedJobActiveView.test.tsx`** — given viewing-Active confirmed status + credit, renders the line item; given non-confirmed Active, renders "You weren't confirmed" message (per Q-PLN-01 lean).
- **`JobDetailView.test.tsx`** — extended snapshot tests for the new state×viewer combinations (Alumni-poster on locked → reschedule + cancel + complete; Active enrolled on payment_sent → confirm + dispute; rejected state → only RejectedJobBanner; cancelled state → only CancelledJobBanner).

## 5. Playwright E2E tests

All against `pnpm dev` at `http://localhost:3000` using `mcp__playwright__*` tools.

- **`apps/web/e2e/mvp/reject-flow.spec.ts`** — Alumni posts → Mod rejects with reason "Dues too low for the scope" → Alumni opens job → sees `<RejectedJobBanner>` with reason → clicks "Post a new job" → lands on `/jobs/new` blank.
- **`apps/web/e2e/mvp/unenroll.spec.ts`** — Active enrolls → unenrolls → job no longer in `/my-enrollments` → enrolling again works.
- **`apps/web/e2e/mvp/reschedule.spec.ts`** — Alumni locks → reschedules → state back to `enrollment-open`, work date NULL, enrollments preserved (verified by Active still seeing it in `/my-enrollments` with no date).
- **`apps/web/e2e/mvp/cancel.spec.ts`** — Alumni cancels with reason "Mom's couch already moved" → state `cancelled`; Active opens the job → sees `<CancelledJobBanner>` with the reason → no action affordances available to any viewer; cancellation reason is captured in `job_state_transitions.note` (verified via tRPC `jobs.getHistory` as Admin).
- **`apps/web/e2e/mvp/revert-completion.spec.ts`** — Alumni completes → reverts → state `locked`, attendees cleared → completes again with different roster → markPaymentSent → assert dues split uses the new attendee set.
- **`apps/web/e2e/mvp/dispute-flow.spec.ts`** — Active confirms-NOT but instead disputes with reason "Treasurer never credited me" → state `disputed` → mocked-Resend records the admin email → Active-side view shows `<DisputedJobBanner>` (no in-app resolve action; that's PLAN-011 / VALIDATION-011). Empty-reason submit → button disabled.
- **`apps/web/e2e/mvp/confirm-race.spec.ts`** — two browser contexts: Active + Admin both click "confirm received" within ~50ms → exactly one transition succeeds; the late clicker sees a toast "Already closed by [first actor]"; final state `closed`.
- **`apps/web/e2e/mvp/my-postings.spec.ts`** — Alumni posts 3 jobs; one approved, one awaiting, one rejected; opens `/my-postings` → all 3 visible, most-recent-first, with correct state badges; clicking the rejected one opens its detail page with the rejection banner.
- **`apps/web/e2e/mvp/my-enrollments.spec.ts`** — Active enrolled in 2 jobs (one locked with future date, one enrollment_open); opens `/my-enrollments` → locked job listed first (date-asc within locked), then enrollment_open by enroll time.

## 6. Pass/fail gates

- [ ] All Vitest component tests in §4 pass.
- [ ] All Playwright specs in §5 pass against `pnpm dev` (run 3x — no flake).
- [ ] No console.error during Playwright runs.
- [ ] `pnpm --filter web build` succeeds with the extended `JobDetailView`.
- [ ] One PLAN-010 commit on the branch.

## 7. Resume notes

If a spec fails, fix the implementation (component or route) — don't relax the spec. The new components are small and independently testable; if `JobDetailView` breaks for one state×viewer combo without affecting others, isolate the change.

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-010. Covers every PRD-002/004/005/006 AC NOT exercised by VALIDATION-008's happy-path spec. Includes the confirmReceipt race UI spec (PRD-006 R-04 / AC-04) since that's the front-end half of the race semantic PLAN-005 already implemented server-side. |
