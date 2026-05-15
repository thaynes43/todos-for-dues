---
id: VALIDATION-007
title: Validation — PLAN-007 notifications (Resend adapter + 4 email helpers + webhook)
status: Proposed
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
  plans:
    pairs_with: PLAN-007
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-007 implements DESIGN-005 end-to-end: `sendEmail()` adapter calls Resend with the expected payload; per-helper functions compose recipient + template input correctly; `chapter_settings` lookup via `getSetting()` works; webhook signature verification rejects invalid signatures; PLAN-005's `afterCommit` stubs are replaced with real helper calls and the corresponding integration tests now show real (mocked-Resend) email payloads.

## 2. Inputs

- **Paired implementation plan:** `docs/plans/007-notifications-implementation.md`.
- **PRDs / designs:**
  - `docs/designs/005-notifications-adapter.md` §4 + §8.
  - `docs/prds/002-job-posting-and-moderation.md` R-12 + AC-01 (moderator queue email fires on post).
  - `docs/prds/005-completion-and-payment-sent.md` R-07 + AC-07/AC-08 (treasurer email content shape).
  - `docs/prds/006-loop-closure-and-dispute.md` R-07 + AC-05/AC-07 (admin dispute email content + link).
  - `docs/adrs/005-email.md` (Resend + React Email).
  - `docs/adrs/010-per-instance-settings-storage.md` (`getSetting` helper).
- **Running artifacts:** `packages/notifications` module + the Resend webhook route at `/api/webhooks/resend`. Resend SDK is mocked at the module level via dependency injection (per PLAN-008's pattern).

## 3. Coverage matrix

| PRD R-NN / AC-NN / DESIGN-§ | Test | File |
|---|---|---|
| PRD-002 R-12 / AC-01 (moderator email on post) | `it('createJob.afterCommit invokes sendModeratorQueueEmail')` (in jobs.test.ts via the FSM integration) + `it('sendModeratorQueueEmail composes correct payload')` | `packages/notifications/__tests__/moderator-new-posting.test.ts` |
| PRD-005 R-07 / AC-08 (treasurer email shape: description / total / line items / job ID / timestamp) | snapshot of rendered HTML matches expected fields | `packages/notifications/__tests__/treasurer-breakdown.test.ts` |
| PRD-005 AC-07 (treasurer email dispatched on markPaymentSent) | tRPC integration assertion that the helper was called | already in `packages/api/__tests__/integration/jobs.test.ts` (extended by PLAN-007 Step 5) |
| PRD-006 R-07 / AC-07 (admin email shape: description / reason / disputer + role / job ID / drill-in link) | snapshot test | `packages/notifications/__tests__/admin-dispute.test.ts` |
| PRD-006 AC-05 (dispute fires admin email) | tRPC integration assertion | same as above |
| DESIGN-005 §4.1 (adapter dev/test skip mode) | `it('skips and logs when RESEND_API_KEY missing')` | `packages/notifications/__tests__/send-email.test.ts` |
| DESIGN-005 §4.1 (idempotency key on send) | `it('passes Idempotency-Key header when provided')` | same |
| DESIGN-005 §4.2 (treasurer helper composition) | `it('composes recipient from chapter_settings.treasurer_recipient_email')` | `treasurer-breakdown.test.ts` |
| DESIGN-005 §4.3 (admin-dispute helper) | same shape | `admin-dispute.test.ts` |
| DESIGN-005 §4.4 (moderator-new-posting helper) | same shape | `moderator-new-posting.test.ts` |
| DESIGN-005 §4.5 (alumni-rejection helper — optional MVP) | minimal happy-path test | `alumni-rejection.test.ts` |
| DESIGN-005 §4.6 (React Email templates render) | snapshot test for each template | `templates/__tests__/` |
| DESIGN-005 §4.7 (webhook signature verification) | valid signature → 200; invalid → 401; supported event types logged | `apps/web/__tests__/api/webhooks-resend.test.ts` |
| DESIGN-005 §7 (afterCommit failure logged but not propagated) | tRPC integration: mock Resend throws → transition stays committed; error visible in logs | `packages/api/__tests__/integration/jobs.test.ts` (extended) |
| ADR-010 (getSetting DB-first + env-var fallback) | unit tests on `getSetting()` | `packages/settings/__tests__/get-setting.test.ts` |

## 4. Unit tests

`packages/notifications/__tests__/` and `packages/settings/__tests__/`.

### `packages/settings/__tests__/get-setting.test.ts`
- `it('returns DB value when present')` — seed `chapter_settings.treasurer_recipient_email`; `getSetting()` returns it.
- `it('returns env-var fallback when DB row absent')` — no DB row; `BOOTSTRAP_TREASURER_RECIPIENT_EMAIL` set; `getSetting()` returns env value.
- `it('throws when both absent for a required key')` — neither DB nor env → throws.

### `packages/notifications/__tests__/send-email.test.ts`
- `it('skips when RESEND_API_KEY missing')` — adapter returns `{ skipped: true, reason: 'no RESEND_API_KEY' }` and logs.
- `it('renders HTML + text from React Email')` — given a template, the call to `resend.emails.send` includes both `html` and `text`.
- `it('passes Idempotency-Key when provided')` — when `idempotencyKey` set, `resend.emails.send` is called with `headers: { 'Idempotency-Key': '<key>' }`.
- `it('throws on Resend error')` — mocked Resend returns `{ error: ... }`; adapter throws.

### `packages/notifications/__tests__/treasurer-breakdown.test.ts`
- `it('composes recipient from settings + chapter name from settings')` — seed `chapter_settings`; call `sendTreasurerEmail({ jobId })`; assert the call to `sendEmail` has `to == treasurer setting`, subject contains `chapter_display_name`.
- `it('passes job description, total, line items, timestamp')` — assert template props match seeded job + per-Active credit map.
- `it('uses idempotencyKey job:<jobId>:payment_sent')` — verify the key.
- `it('throws if job has no perActiveDuesCredit')` — sanity.

### `packages/notifications/__tests__/admin-dispute.test.ts`
- `it('composes recipient from admin_recipient_email setting')`.
- `it('passes disputer display name + role, reason, job ID, drill-in link')`.
- `it('NO idempotency key — re-disputes are legitimately separate events')` per DESIGN-005 §4.3.

### `packages/notifications/__tests__/moderator-new-posting.test.ts`
- `it('composes recipient from moderators_recipient_email setting')`.
- `it('passes job description, dues amount, recommended count, poster name, queue URL')`.
- `it('uses idempotencyKey job:<jobId>:moderation_queue')`.

### `packages/notifications/__tests__/alumni-rejection.test.ts` (optional MVP)
- `it('composes recipient from the posting Alumni user row')` — the Alumni's own email, not a chapter setting.
- `it('passes job description and rejection reason')`.

### `packages/notifications/templates/__tests__/*.test.tsx`
- One snapshot test per template (`TreasurerBreakdown`, `AdminDispute`, `ModeratorNewPosting`, `AlumniRejection`) with sample props; assert rendered HTML stable (snapshot file checked into git).

### `apps/web/__tests__/api/webhooks-resend.test.ts`
- `it('returns 200 on valid signed payload')`.
- `it('returns 401 on missing or invalid signature')`.
- `it('logs bounce events')` — spy on `console.warn`; assert it logged for `email.bounced` event.
- `it('ignores delivered/opened/clicked events')` — no log for those.

### Extended jobs integration tests (`packages/api/__tests__/integration/jobs.test.ts`)
- `it('post → afterCommit fires sendModeratorQueueEmail')` — replace the PLAN-005 stub spy with the real helper (mocked Resend); assert one mock-Resend call.
- `it('markPaymentSent → afterCommit fires sendTreasurerEmail')` — same.
- `it('dispute → afterCommit fires sendAdminDisputeEmail')` — same.
- `it('afterCommit failure does not roll back the transition')` — force mocked Resend to throw; assert the FSM transition still committed; error visible in logs.

## 5. Playwright E2E tests

**Minimal.** The notifications layer is server-side; happy-path Playwright is covered by PLAN-008's walking-skeleton spec (asserts a TreasurerBreakdown call). VALIDATION-007 does NOT duplicate this.

If desired, a single Playwright assertion on the webhook receiver: `apps/web/e2e/notifications/webhook-receiver.spec.ts` — POST a signed payload to `/api/webhooks/resend` → assert 200; POST an unsigned payload → assert 401. (Plays via the dev server.)

## 6. Pass/fail gates

- [ ] `pnpm --filter @app/notifications typecheck && test` passes.
- [ ] `pnpm --filter @app/settings typecheck && test` passes.
- [ ] All extended `jobs.test.ts` integration tests pass with the real helpers wired (Resend mocked at SDK level).
- [ ] Webhook signature verification test green.
- [ ] One PLAN-007 commit on the branch.

## 7. Resume notes

The mocked Resend SDK is the seam — confirm it's swapped in test mode (e.g., `if (process.env.NODE_ENV === 'test') resend = mockableResendClient`). Tests are independent; if a helper test fails, fix the helper (not the test).

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-007. Maps every PRD R-12 / R-07 / R-07 (PRD-002 / PRD-005 / PRD-006) to a helper-composition test + a tRPC integration test that the right afterCommit fires. Webhook signature verification + dev-mode adapter skip both covered. |
