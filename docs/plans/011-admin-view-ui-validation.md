---
id: VALIDATION-011
title: Validation — PLAN-011 Admin view UI
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: M
related:
  prds: [PRD-007, PRD-006]
  adrs: [ADR-001, ADR-010]
  bounded_contexts: [BCC-02]
  aggregates: [ADC-01]
  designs: [DESIGN-006]
  plans:
    pairs_with: PLAN-011
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-011's `/admin/*` route tree implements every PRD-007 AC plus the Admin-side of PRD-006 R-08/R-09/R-10 (dispute resolution). Every PRD-007 §5.1 AC has a Playwright spec; the dispute-resolution flow round-trips end-to-end through the Admin UI.

## 2. Inputs

- **Paired implementation plan:** `docs/plans/011-admin-view-ui.md`.
- **PRDs / designs:**
  - `docs/prds/007-admin-view-and-audit-log.md` §5 R-01..R-10 + §5.1 AC-01..AC-11 + §6 UX rules.
  - `docs/prds/006-loop-closure-and-dispute.md` §5 R-08/R-09/R-10 + AC-08, AC-09, AC-10, AC-11 (Admin resolution paths).
  - `docs/designs/006-ui-components.md` §3 `/admin/*` routes + §4.3 component sketches.
- **Running artifacts:** `pnpm dev` + a seeded DB with: multiple jobs in various states (for dashboard counts), one disputed job (for disputes drill-in), pre-existing `chapter_settings` rows (for the settings UI), and an Admin persona (for role gates).

## 3. Coverage matrix

| PRD R-NN / AC-NN / §6 UX rule | Component or route | Test |
|---|---|---|
| PRD-007 AC-01 (admin lands on `/admin` → 5 sections) | `/admin/layout.tsx` + landing | `apps/web/e2e/admin/layout-shell.spec.ts` |
| PRD-007 AC-02 (non-Admin → 403) | layout role-gate | same |
| PRD-007 AC-03 (Dashboard aggregate counts) | `/admin/page.tsx` + `AggregateCountsCards` | `apps/web/e2e/admin/dashboard.spec.ts` |
| PRD-007 AC-04 (click count card → filtered list) | `AggregateCountsCards` + `/jobs?state=…` filter | same |
| PRD-007 AC-05 (Disputes list shape) | `/admin/disputes/page.tsx` + `DisputeCardList` | `apps/web/e2e/admin/disputes-list.spec.ts` |
| PRD-007 AC-06 (resolve via modal → row disappears) | `ResolveDisputeModal` + tRPC | `apps/web/e2e/admin/dispute-resolve-closed.spec.ts` (and parallel specs for cancelled/false-alarm) |
| PRD-007 AC-07 (Audit log timeline — 7 rows w/ chapter-local timestamps + actor + note) | `/admin/jobs/[jobId]/page.tsx` + `AuditLogTable` | `apps/web/e2e/admin/audit-log.spec.ts` |
| PRD-007 AC-08 (Settings save) | `/admin/settings/page.tsx` + `SettingsForm` | `apps/web/e2e/admin/settings-save.spec.ts` |
| PRD-007 AC-09 (Settings invalid input rejected) | `SettingsForm` validation | same |
| PRD-007 AC-10 (audit-log atomicity — covered at DB layer by VALIDATION-002 / VALIDATION-003) | n/a here | (covered upstream) |
| PRD-007 AC-11 (Users sub-route renders PLAN-008's components) | `/admin/users/page.tsx` shell — verified post-PLAN-012; this plan's shell renders the placeholder | `apps/web/e2e/admin/users-shell.spec.ts` (smoke: route loads as Admin) |
| PRD-006 AC-08 (resolve_closed with note → state closed) | `ResolveDisputeModal` → `jobs.resolveDisputeAsClosed` | `dispute-resolve-closed.spec.ts` |
| PRD-006 AC-09 (resolve_closed empty note rejected) | modal client-side disable | same |
| PRD-006 AC-10 (resolve_cancelled) | `ResolveDisputeModal` → `jobs.resolveDisputeAsCancelled` | `dispute-resolve-cancelled.spec.ts` |
| PRD-006 AC-11 (resolve_payment_sent — false alarm) | `ResolveDisputeModal` → `jobs.resolveDisputeAsPaymentSent` | `dispute-resolve-false-alarm.spec.ts` |
| PRD-006 AC-13 (non-Admin attempting resolve → FORBIDDEN) | covered by route-layout role gate | implicit via layout test |
| PRD-007 §6 UX rule "Disputes nav badge" | layout shows count | layout-shell.spec.ts |
| PRD-007 §6 UX rule "Save on blur with toast" | `SettingsForm` per-field save | settings-save.spec.ts |
| PRD-007 §6 UX rule "Audit log timestamps chapter-local with UTC tooltip" | `AuditLogTable` | audit-log.spec.ts |
| PRD-007 §6 UX rule "Find by job ID search" | `/admin/audit-log/page.tsx` | `apps/web/e2e/admin/audit-log-search.spec.ts` |
| DESIGN-006 §3 `/admin/*` route tree present | all 5 routes return 200 for Admin | `layout-shell.spec.ts` smoke |
| DESIGN-006 §4.3 `AggregateCountsCards` clickable | unit test | `apps/web/__tests__/components/AggregateCountsCards.test.tsx` |
| DESIGN-006 §4.3 `AuditLogTable` format | unit test | `apps/web/__tests__/components/AuditLogTable.test.tsx` |

## 4. Unit tests

`apps/web/__tests__/components/` — React Testing Library.

- **`AdminLayout.test.tsx`** — role gate (Admin → renders; non-Admin → renders `<Forbidden>`); 5 nav entries visible; disputes badge shows count when ≥1 disputed.
- **`AggregateCountsCards.test.tsx`** — given a counts map, renders one clickable card per state with `stateDisplayName(state)` labels; click navigates to `/jobs?state=<state>`.
- **`DisputeCardList.test.tsx`** — renders job description (truncated), disputer name + role, reason (truncated), age formatted as "Xd/Xh".
- **`ResolveDisputeModal.test.tsx`** — three primary buttons; clicking each opens a sub-modal with a textarea; submit disabled until non-empty; on submit calls the matching tRPC procedure.
- **`SettingsForm.test.tsx`** — given initial values, renders 5 fields; on blur with valid input calls `settings.set`; on blur with invalid input shows field-level error and does NOT call the mutation; toast appears on success.
- **`AuditLogTable.test.tsx`** — given a transitions array, renders chronological rows; timestamps formatted via `formatChapterLocal`; UTC ISO present in `<time datetime>` attribute; actor "system" rendered when actorId null.

## 5. Playwright E2E tests

- **`apps/web/e2e/admin/layout-shell.spec.ts`** — Admin opens `/admin` → 5 nav entries visible; non-Admin (Active/Alumni/Moderator) opens `/admin` → 403 / redirect; with 0 disputed jobs the badge is absent or "0"; with 1 disputed the badge shows "1".
- **`apps/web/e2e/admin/dashboard.spec.ts`** — seed jobs across states; open `/admin` → counts match seed; click the `payment_sent` card → `/jobs?state=payment_sent` filtered list renders only those jobs.
- **`apps/web/e2e/admin/disputes-list.spec.ts`** — seed 1 disputed job with reason "treasurer didn't credit me"; open `/admin/disputes` → row shows the job description, disputer name + role, reason, age, drill-in link.
- **`apps/web/e2e/admin/dispute-resolve-closed.spec.ts`** — seed disputed job → click "Mark closed" → modal opens → submit with empty note → button disabled → submit with valid note → modal closes → row disappears → navigate to `/admin/jobs/<id>` → audit log shows the new `disputed → closed` row with the resolution note.
- **`apps/web/e2e/admin/dispute-resolve-cancelled.spec.ts`** — analogous for `Mark cancelled`.
- **`apps/web/e2e/admin/dispute-resolve-false-alarm.spec.ts`** — analogous for `Mark false-alarm`; verify the job is re-eligible for confirmReceipt or re-dispute.
- **`apps/web/e2e/admin/audit-log.spec.ts`** — seed a job with 7 transitions; open `/admin/jobs/<id>` → audit log table shows all 7 rows; one timestamp is in chapter-local format (`America/New_York`); the `<time datetime>` attribute carries the UTC ISO.
- **`apps/web/e2e/admin/audit-log-search.spec.ts`** — open `/admin/audit-log` → enter job ID → submit → navigate to `/admin/jobs/<id>` with the timeline visible.
- **`apps/web/e2e/admin/settings-save.spec.ts`** — open `/admin/settings` → edit `treasurer_recipient_email` to `treasurer@sigoboard.org` → blur → toast "Saved." → reload page → value persists; edit to `not-an-email` → blur → field-level error, no mutation called, existing value unchanged.
- **`apps/web/e2e/admin/users-shell.spec.ts`** — Admin opens `/admin/users` → placeholder rendered (PLAN-011's shell — replaced by PLAN-012).

## 6. Pass/fail gates

- [ ] All Vitest component tests pass.
- [ ] All Playwright specs pass against `pnpm dev` (run 3x — no flake).
- [ ] After running the dispute-resolution specs, the DB shows the expected `job_state_transitions` rows with resolution notes.
- [ ] After running the settings-save spec, `chapter_settings` shows the updated value and `updatedBy = <admin user uuid>`.
- [ ] No console.error during runs.
- [ ] `pnpm --filter web build` succeeds.
- [ ] One PLAN-011 commit on the branch.

## 7. Resume notes

The disputes-list and dispute-resolve specs share seeded data — use distinct job IDs per spec to avoid coupling. Settings spec must restore the original value in `afterEach` if the test DB persists across specs (otherwise rely on per-test truncation).

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-011. Covers every PRD-007 AC + the Admin-side of PRD-006 dispute-resolution (R-08/R-09/R-10). Users sub-route validated as a smoke (the real content is VALIDATION-012's surface). |
