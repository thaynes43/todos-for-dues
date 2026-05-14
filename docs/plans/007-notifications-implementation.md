---
id: PLAN-007
title: Notifications adapter + treasurer / admin / moderator email helpers
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: S
related:
  prds: [PRD-002, PRD-005, PRD-006]
  adrs: [ADR-005, ADR-010]
  bounded_contexts: [BCC-02]
  aggregates: [ADC-01]
  designs: [DESIGN-005]
  plans: [PLAN-001, PLAN-002, PLAN-005]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Implement DESIGN-005 end-to-end: the `sendEmail()` adapter, four React Email templates (treasurer breakdown, admin dispute, moderator queue, Alumni rejection), the four helper functions, and the Resend webhook receiver. Replace the PLAN-005 stubs with real implementations so `markPaymentSent` and `dispute` actually fire emails.

> **Definition of success:** integration tests assert that the right email is queued (against a Resend mock) for each transition; the webhook receiver verifies signatures and logs bounce/complaint events.

## 2. Inputs

1. `docs/designs/005-notifications-adapter.md`
2. PLAN-005 (`afterCommit` stubs in tRPC procedures need replacing).
3. PLAN-002 (`chapter_settings` table in place; needs `admin_recipient_email` + `treasurer_recipient_email` rows seeded for test).

## 3. Outputs

- `packages/notifications/src/send-email.ts` per DESIGN-005 §4.1
- `packages/notifications/src/helpers/treasurer-breakdown.ts` per §4.2
- `packages/notifications/src/helpers/admin-dispute.ts` per §4.3
- `packages/notifications/src/helpers/moderator-new-posting.ts` per §4.4
- `packages/notifications/src/helpers/alumni-rejection.ts` per §4.5
- `packages/notifications/src/templates/` — 4 React Email components per §4.6
- `apps/web/app/api/webhooks/resend/route.ts` per §4.7
- `packages/settings/src/index.ts` — `getSetting()` helper per ADR-010 (env-var fallback + DB primary)
- Replace PLAN-005's stubs in `jobs.markPaymentSent` and `jobs.dispute` with calls into these helpers
- Integration tests in `packages/notifications/__tests__/`
- Commit: `feat(notifications): Resend adapter + 4 email templates per DESIGN-005`

## 4. Steps

### Step 1 — `getSetting()` helper

- **Action:** implement `packages/settings/src/index.ts` per ADR-010 — checks DB first (`chapter_settings` table), falls back to env var. Typed wrapper.
- **Verification:** unit tests: setting in DB returns DB value; setting absent in DB but env var present returns env-var value; both absent throws.

### Step 2 — `sendEmail()` adapter

- **Action:** implement DESIGN-005 §4.1 verbatim. Add deps: `resend`, `@react-email/components`, `@react-email/render`. Dev/test skip mode logs to console when `RESEND_API_KEY` missing.
- **Verification:** unit test with mocked Resend client.

### Step 3 — React Email templates (4)

- **Action:** implement DESIGN-005 §4.6 — `TreasurerBreakdown.tsx`, `AdminDispute.tsx`, `ModeratorNewPosting.tsx`, `AlumniRejection.tsx` plus the `_components/Layout.tsx` shared layout.
- **Verification:** snapshot tests of rendered HTML for each template with sample inputs.

### Step 4 — Helper functions (4)

- **Action:** implement DESIGN-005 §4.2 / §4.3 / §4.4 / §4.5. Each composes the recipient (via `getSetting()`) + the rendered template + `sendEmail()`.
- **Verification:** integration tests with a real DB-seeded job + chapter_settings; assert the correct mock-Resend call.

### Step 5 — Wire into PLAN-005's tRPC procedures

- **Action:** replace stub calls in `jobs.markPaymentSent` (`afterCommit` → `sendTreasurerEmail`) and `jobs.dispute` (`afterCommit` → `sendAdminDisputeEmail`). Add `sendModeratorQueueEmail` to `jobs.post` (Q-DSG-02 from DESIGN-005 — note: this requires adding R-NN to PRD-002; flagged in this plan's Q-PLN-01 below).
- **Verification:** integration tests in `packages/api/__tests__/integration/jobs.test.ts` confirm each transition's `afterCommit` fires the expected email helper.

### Step 6 — Webhook receiver

- **Action:** implement `apps/web/app/api/webhooks/resend/route.ts` per DESIGN-005 §4.7. Verify Resend signature; log bounce / complaint events. No DB writes for MVP.
- **Verification:** unit test with a sample signed-payload + signature; assert correct handling.

### Step 7 — Commit

- **Action:** commit per Outputs.

## 5. Verification

- [ ] `pnpm --filter @app/notifications typecheck && test` passes.
- [ ] tRPC integration tests now show the email helpers invoked correctly on transitions.
- [ ] Webhook signature verification unit test passes.
- [ ] One commit.

## 6. Out of scope

- Suppressions table (deferred per DESIGN-005 Q-DSG-01).
- Per-Admin notification preferences (post-MVP).
- Outbox / retry pattern (deferred per DESIGN-005 + DESIGN-002 Q-DSG-02).
- In-app notifications / toasts beyond what tRPC mutations already do (UI plan).

## 7. Risks & gotchas

- **Risk:** Resend API key missing in dev. **Mitigation:** the adapter logs + skips per Step 2 / DESIGN-005 §4.1.
- **Risk:** chapter_settings rows for `treasurer_recipient_email` / `admin_recipient_email` not yet inserted in dev DB. **Mitigation:** PLAN-002 includes a seed step or document in `apps/web/README.md`. Env-var fallback works as a stopgap.
- **Risk:** PRD-002 doesn't yet have the moderator-queue notification R-NN (Q-DSG-02 in DESIGN-005). **Mitigation:** before implementing Step 5's `sendModeratorQueueEmail`, add R-NN to PRD-002 (this is a small product decision — see Q-PLN-01).
- **Risk:** React Email + Tailwind interplay may have quirks in the email-rendering pipeline (different from `apps/web` Tailwind). **Mitigation:** use React Email's built-in components (`@react-email/components`) which are pre-styled.

## 8. Resume points

- After Step 1: settings helper ready.
- After Step 2: adapter ready.
- After Step 4: helpers ready (tests pass against mocked DB + Resend).
- After Step 5: tRPC integration ready.
- After Step 7: committed.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | DESIGN-005 §9 Q-DSG-02 flagged that PRD-002 needs an R-NN added for moderator-queue notification. Should we add it to PRD-002 before implementing Step 5's `sendModeratorQueueEmail`, or skip moderator notification in MVP? | Lean: **add the R-NN to PRD-002** (e.g., R-12: "When a posting is submitted, the system shall notify Moderators via email"). One-line PRD addition; significant UX win (Mods don't have to poll). |
| Q-PLN-02 | Moderator notification recipient: per-Mod email vs. a single chapter setting? Lean: **single chapter setting `moderators_recipient_email`** (consistent with admin/treasurer pattern; per-Mod preferences post-MVP). | Add `moderators_recipient_email` to the `chapter_settings` validators in DESIGN-003 §4.6 + PLAN-005 settings router. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. 7 steps to land notifications. Flags two product follow-ups (PRD-002 R-NN addition + moderators_recipient_email setting) before Step 5 can complete. |
