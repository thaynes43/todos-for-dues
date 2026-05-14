---
id: PLAN-006
title: Walking-skeleton UI implementation (subset of DESIGN-006)
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: M
related:
  prds: [PRD-001, PRD-002, PRD-003, PRD-004, PRD-005, PRD-006]
  adrs: [ADR-001]
  bounded_contexts: [BCC-01, BCC-02]
  aggregates: [ADC-01, ADC-02]
  designs: [DESIGN-006]
  plans: [PLAN-001, PLAN-004, PLAN-005]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Implement the walking-skeleton subset of DESIGN-006 (per §4.2 of that design): the ~9 routes + components needed to click through the full happy-path job loop end-to-end. Defer the full MVP UI (Admin view, dispute UI, role-management UI, settings UI, audit log timeline) to a follow-up MVP plan.

> **Definition of success:** Playwright `walking-skeleton.spec.ts` (PLAN-008) passes against this UI; every step from "open invite link" through "Active confirms received → loop closed" can be performed via the UI without devtools tricks.

## 2. Inputs

1. `docs/designs/006-ui-components.md` §4.2 (walking-skeleton subset table) + §4.3 (key components).
2. PLAN-005 (tRPC procedures live).
3. PLAN-004 (auth flows + Server Actions live).

## 3. Outputs

- `apps/web/app/layout.tsx` — root layout with `ChapterHeader` + `RoleAwareNav` + `Footer`.
- `apps/web/components/`:
  - `ChapterHeader.tsx`, `RoleAwareNav.tsx`, `Footer.tsx`, `TippingNudge.tsx`
  - `JobCard.tsx`, `JobStateBadge.tsx`, `JobDetailView.tsx` (per DESIGN-006 §4.3)
  - `EnrollButton.tsx`, `UnenrollButton.tsx` (omit Unenroll for walking skeleton if scope-pressured)
  - `PostJobForm.tsx` (per DESIGN-006 §4.3)
  - `ApproveRejectButtons.tsx` (Approve only for walking skeleton — rejection lands in MVP follow-up)
  - `LockJobForm.tsx`
  - `CompleteJobForm.tsx`
  - `MarkPaymentSentButton.tsx`
  - `ConfirmReceivedButton.tsx`
- `apps/web/app/`:
  - `page.tsx` — landing (role-aware redirect or login-link)
  - `signup/page.tsx` — invite-token signup form (Server Action from PLAN-004)
  - `login/page.tsx` — login form
  - `jobs/page.tsx` — list of approved + enrollment-open jobs (role-aware)
  - `jobs/new/page.tsx` — post-job form (Alumni only)
  - `jobs/[jobId]/page.tsx` — job detail with role-aware controls
  - `moderation-queue/page.tsx` — Moderator queue + approve action
- `apps/web/lib/trpc-client.ts` — tRPC React provider wired to `appRouter` from PLAN-005
- `apps/web/lib/formatters.ts` — chapter-local date formatting (reads `chapter_settings.chapter_timezone`; for walking skeleton, hardcode `America/New_York` until settings UI exists)
- One commit: `feat(web): walking-skeleton UI per DESIGN-006 §4.2`

## 4. Steps

### Step 1 — Root layout + nav + tRPC provider

- **Action:** implement `app/layout.tsx`, `components/ChapterHeader.tsx`, `components/RoleAwareNav.tsx`, `components/Footer.tsx`, `components/TippingNudge.tsx`. Wire `trpc-client.ts` provider in the layout (with React Query). Use server-side session fetch in `layout.tsx` to populate role for nav.
- **Verification:** `pnpm --filter web dev` boots; root page shows nav (filtered by role); tRPC client available in client components.

### Step 2 — Auth pages (forms only — Server Actions are PLAN-004)

- **Action:** create `app/signup/page.tsx`, `app/login/page.tsx`, `app/forgot-password/page.tsx` as plain forms posting to the Server Actions. Style with shadcn/ui Inputs + Buttons.
- **Verification:** Playwright manual smoke: form submission → page navigates to `/`.

### Step 3 — Jobs list + post-job form

- **Action:** implement `app/jobs/page.tsx` (list view filtered to `enrollment_open` for Active; `enrollment_open + my-posted` for Alumni; etc.). Implement `app/jobs/new/page.tsx` with `PostJobForm.tsx` per DESIGN-006 §4.3.
- **Verification:** Alumni can post; the new job appears in the moderation queue (next step).

### Step 4 — Moderation queue + approve

- **Action:** implement `app/moderation-queue/page.tsx` calling `jobs.listModerationQueue`. `ApproveRejectButtons.tsx` initially with just Approve (per Walking-Skeleton subset note in DESIGN-006 §4.2).
- **Verification:** Moderator sees queue; approve transitions a job to `enrollment_open`.

### Step 5 — Job detail with role-aware controls

- **Action:** implement `app/jobs/[jobId]/page.tsx` rendering `JobDetailView.tsx` per DESIGN-006 §4.3. Include EnrollButton, LockJobForm, CompleteJobForm, MarkPaymentSentButton, ConfirmReceivedButton based on viewer's role + relationship to the job.
- **Verification:** click-through Active enroll → Alumni lock → Alumni complete → Alumni mark payment-sent → Active confirm received → loop closes (state shown as `closed`).

### Step 6 — Loading / error / empty states

- **Action:** add Skeleton + ErrorBanner + per-page empty messages per DESIGN-006 §4.5.
- **Verification:** drop network manually (devtools); UI shows error banner not crash.

### Step 7 — Polish + commit

- **Action:** Tailwind + shadcn responsive checks (mobile-first per PRD-001 §6); fix obvious gaps.
- **Action:** commit per Outputs.

## 5. Verification

- [ ] `pnpm --filter web build` succeeds.
- [ ] `pnpm --filter web dev` boots; manual click-through of full happy-path job loop succeeds.
- [ ] PLAN-008's Playwright `walking-skeleton.spec.ts` will pass once written.
- [ ] One commit.

## 6. Out of scope

- Admin view (`/admin/*` — defer to MVP follow-up).
- Dispute UI (defer; walking skeleton skips dispute path).
- Role-management UI (defer).
- Settings UI (defer; settings via env var only for walking skeleton).
- Reschedule UI (defer; walking skeleton uses one-shot lock).
- Cancel UI (defer).
- Rejection flow (defer; Mod-Approve only).

## 7. Risks & gotchas

- **Risk:** server-side session fetch in `layout.tsx` is per-request. **Mitigation:** acceptable at MVP scale; cache via Next.js's `cache()` if it becomes hot.
- **Risk:** `JobDetailView.tsx` is the most role-conditional component; logic complexity grows with each feature. **Mitigation:** keep walking-skeleton subset minimal; resist adding all MVP features until follow-up plan.
- **Risk:** tRPC client setup with React Query has some boilerplate. **Mitigation:** follow the tRPC docs' Next.js App Router example.

## 8. Resume points

- After Step 1: layout boots.
- After Step 4: Mod can approve.
- After Step 5: full happy path clickable.
- After Step 7: committed.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Should the walking-skeleton UI be feature-flagged / hidden behind a banner ("Beta — limited functionality")? | Lean: no — internal launch chapter sees all of it; banner adds friction. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. 7 steps to land the walking-skeleton subset of DESIGN-006. Defers full MVP UI to a follow-up plan. |
