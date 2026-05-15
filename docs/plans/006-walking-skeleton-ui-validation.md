---
id: VALIDATION-006
title: Validation — PLAN-006 walking-skeleton UI
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: S
related:
  prds: [PRD-001, PRD-002, PRD-003, PRD-004, PRD-005, PRD-006]
  adrs: [ADR-001]
  bounded_contexts: [BCC-01, BCC-02]
  aggregates: [ADC-01, ADC-02]
  designs: [DESIGN-006]
  plans:
    pairs_with: PLAN-006
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-006 produces a walking-skeleton UI per DESIGN-006 §4.2 that can click through the full happy-path job loop: signup → post → approve → enroll → lock → complete → mark-payment-sent → confirm-received → `closed`. UI surfaces outside the walking-skeleton subset (Admin view, dispute UI, role-management UI, settings UI, rejection / reschedule / cancel UI) are explicitly NOT validated here — VALIDATION-010 / -011 / -012 own those.

## 2. Inputs

- **Paired implementation plan:** `docs/plans/006-walking-skeleton-ui-implementation.md`.
- **PRDs / designs:**
  - `docs/designs/006-ui-components.md` §4.2 (walking-skeleton subset), §4.3 (role-conditional rendering pattern), §4.5 (loading/error/empty), §4.6 (`stateDisplayName`), §4.8 (tipping nudge).
  - `docs/prds/002-job-posting-and-moderation.md` §6 (Alumni mobile-friendly; Mod queue oldest-first) — happy-path subset only.
  - `docs/prds/004-enrollment-lock-reschedule.md` §6 UX rules — happy-path subset.
  - `docs/prds/005-completion-and-payment-sent.md` §6 UX rules — happy-path subset.
  - `docs/prds/006-loop-closure-and-dispute.md` §6 — only the "Confirm received is single click" rule.
- **Running artifacts:** `pnpm dev` against testcontainers-managed PG16 (per ADR-004). The actual canonical walking-skeleton spec is owned by PLAN-008; VALIDATION-006's specs are smaller and component-focused.

## 3. Coverage matrix

| PRD AC / DESIGN-§ | Unit/integration test | Playwright spec |
|---|---|---|
| DESIGN-006 §4.2 table — every route listed as walking-skeleton-shipped | smoke: hitting each route returns HTTP 200 (or appropriate redirect) | `apps/web/e2e/walking-skeleton/smoke-routes.spec.ts` |
| PRD-002 R-06 / AC-06 (Mod queue oldest-first) | component test renders rows in expected order | `apps/web/__tests__/components/ModerationQueue.test.tsx` |
| PRD-002 R-01..R-05 happy path (post a job) | `<PostJobForm>` calls `jobs.post` with parsed inputs | `apps/web/e2e/walking-skeleton/post-job.spec.ts` |
| PRD-004 R-01 (auto enrollment_open after approve) | clicking Approve transitions the row to enrollment_open in UI | implicit in `post-approve-enroll.spec.ts` |
| PRD-004 R-02 (enroll happy path) | `<EnrollButton>` calls `jobs.enroll` | `apps/web/e2e/walking-skeleton/post-approve-enroll.spec.ts` |
| PRD-004 R-05 (roster visibility for enrolled Active) | `<JobDetailView>` renders roster names for enrolled viewer | `apps/web/__tests__/components/JobDetailView.test.tsx` |
| PRD-004 R-07 (Lock happy path) | `<LockJobForm>` posts a future date | `apps/web/e2e/walking-skeleton/lock-job.spec.ts` |
| PRD-005 R-01 (Complete happy path) | `<CompleteJobForm>` confirms attendees | `apps/web/e2e/walking-skeleton/complete-job.spec.ts` |
| PRD-005 R-06 (markPaymentSent single click) | `<MarkPaymentSentButton>` is a single click | `apps/web/e2e/walking-skeleton/payment-sent.spec.ts` |
| PRD-006 R-01 (confirmReceipt closes the loop) | `<ConfirmReceivedButton>` triggers transition to closed | `apps/web/e2e/walking-skeleton/confirm-received.spec.ts` |
| DESIGN-006 §4.6 `stateDisplayName` | every state badge in the UI uses the formatter | `apps/web/__tests__/components/JobStateBadge.test.tsx` |
| DESIGN-006 §4.7 chapter-local date display | `formatChapterLocal` reads `chapter_timezone` setting | `apps/web/__tests__/lib/formatters.test.ts` |
| DESIGN-006 §4.8 TippingNudge | static text rendered when state in `{payment_sent, closed}` (with PLAN-006's narrower walking-skeleton scope) | `apps/web/__tests__/components/TippingNudge.test.tsx` |
| DESIGN-006 §4.5 loading + error + empty states | each list / detail view handles all three | `apps/web/__tests__/components/*.test.tsx` per page |

> Note: the canonical happy-path full E2E click-through is **PLAN-008's `walking-skeleton.spec.ts`** (VALIDATION-008). The specs above are smaller, page-focused; PLAN-008's spec is the integration test that proves the whole UI chains together.

## 4. Unit tests

`apps/web/__tests__/` — component-level tests using Vitest + React Testing Library.

- **`components/JobStateBadge.test.tsx`** — given each `JobState` value, the rendered text matches `stateDisplayName(state)` (e.g., `awaiting_moderation` → `"awaiting moderation"`).
- **`components/JobDetailView.test.tsx`** — given (job, viewer) tuples representing the walking-skeleton states (`enrollment_open`/`locked`/`completed`/`payment_sent`/`closed`), the correct subset of action affordances renders (e.g., Alumni-poster on locked → CompleteJobForm; Active enrolled on payment_sent → ConfirmReceivedButton).
- **`components/PostJobForm.test.tsx`** — submitting the form calls `trpc.jobs.post.useMutation()` with `{ description, duesAmount, recommendedPeopleCount }`; client-side disabled state during pending.
- **`components/EnrollButton.test.tsx`** — calls `trpc.jobs.enroll.useMutation({ jobId })`; disabled when job.state !== 'enrollment_open'.
- **`components/LockJobForm.test.tsx`** — date picker; submits future date; submit button disabled with past dates.
- **`components/CompleteJobForm.test.tsx`** — attendee checklist sourced from job.roster; submit calls `trpc.jobs.complete.useMutation({ jobId, confirmedAttendees: [...ids] })`.
- **`components/MarkPaymentSentButton.test.tsx`** — single click → mutation fires; shows treasurer-recipient address per PRD-005 §6.
- **`components/ConfirmReceivedButton.test.tsx`** — single click; visible only when state == payment_sent + viewer is enrolled or Admin.
- **`components/TippingNudge.test.tsx`** — static text rendered correctly; non-numeric per PRD-001 §6 Q-06.
- **`components/ModerationQueue.test.tsx`** — given a mocked tRPC query, renders rows in oldest-first order per PRD-002 R-06 / AC-06.
- **`lib/formatters.test.ts`** — `stateDisplayName` returns the expected mapping for each `JobState`; `formatChapterLocal` formats UTC ISO into chapter-local string using the configured timezone.

## 5. Playwright E2E tests

Against `pnpm dev` at `http://localhost:3000` using `mcp__playwright__*` tools.

- **`apps/web/e2e/walking-skeleton/smoke-routes.spec.ts`** — open each route listed in DESIGN-006 §4.2 table (`/signup`, `/login`, `/jobs`, `/jobs/new`, `/jobs/[id]` for a seeded job, `/moderation-queue`); assert HTTP 200 (or the expected auth redirect for non-matching role).
- **`apps/web/e2e/walking-skeleton/post-job.spec.ts`** — sign in as Alumni → `/jobs/new` → fill form → submit → assert redirect to `/jobs/<newId>` → assert page shows state `awaiting moderation`.
- **`apps/web/e2e/walking-skeleton/post-approve-enroll.spec.ts`** — chain post + approve (as Moderator) + enroll (as Active); assert each step's UI reflects the new state.
- **`apps/web/e2e/walking-skeleton/lock-job.spec.ts`** — as Alumni-poster on a job in `enrollment_open` with 1+ enrollees, lock with a future date; assert state badge becomes `locked`.
- **`apps/web/e2e/walking-skeleton/complete-job.spec.ts`** — Alumni-poster on `locked`, check the enrolled attendee, submit; assert state `completed` + per-Active credit visible.
- **`apps/web/e2e/walking-skeleton/payment-sent.spec.ts`** — Alumni-poster on `completed`, click MarkPaymentSent; assert state `payment-sent`.
- **`apps/web/e2e/walking-skeleton/confirm-received.spec.ts`** — enrolled Active on `payment_sent`, click ConfirmReceived; assert state `closed`; assert `<ClosedJobBanner>` IS NOT rendered (it's a PLAN-010 component) — the walking-skeleton subset just shows the state badge.

Each Playwright spec uses Playwright's `storageState()` to switch personas without re-doing the signup form every test.

## 6. Pass/fail gates

- [ ] All Vitest component tests in §4 pass.
- [ ] All Playwright specs in §5 pass against `pnpm dev` (run 3x — no flake; the canonical 5x-no-flake gate lives on VALIDATION-008).
- [ ] `pnpm --filter web build` succeeds.
- [ ] No `console.error` calls during the happy-path Playwright run (Playwright's `page.on('pageerror')` listener catches React errors).
- [ ] One PLAN-006 commit on the branch.

## 7. Resume notes

If a Playwright spec hangs, kill the dev server. Spec ordering: smoke first, then per-step happy path. Tests do not share state; each constructs its own seed via `globalSetup` (truncate `jobs` + `job_enrollments` + `job_state_transitions` per test).

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-006. Component-level Vitest + targeted Playwright per page. The canonical chained E2E lives in VALIDATION-008 — this validation focuses on per-page surfaces being independently exercised. |
