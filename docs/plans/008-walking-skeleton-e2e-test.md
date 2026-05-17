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
  plans:
    prerequisite: [PLAN-001, PLAN-002, PLAN-003, PLAN-004, PLAN-005, PLAN-006, PLAN-007]
    lateral: [VALIDATION-008]
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
  - `globalSetup` that performs in order:
    1. **Spin up Postgres 16** via testcontainers (reuse `@app/test-utils.startPostgres()`), apply migrations via `@app/db/migrate`'s `runMigrations`, and seed `chapter_settings` (admin/treasurer/moderators recipients = test inboxes; chapter_timezone = America/New_York; chapter_display_name = test).
    2. **Launch a local in-process OIDC mock server** on a fixed port (e.g., `127.0.0.1:9999`) that responds to the four canonical paths Better Auth fetches server-side: `/.well-known/openid-configuration` (returns the issuer + the URLs below), `/oauth/authorize` (browser-facing — redirects back to `/api/auth/callback/oauth/google-workspace?code=test-code&state=<state>`), `/oauth/token` (POST — returns an access token + id_token), `/userinfo` (returns the test profile keyed by the bearer). Keep the mock dependency-light: a tiny Express or raw `http.createServer` is enough; alternatively use a maintained library like [`oidc-provider-mock`](https://github.com/panva/node-oidc-provider) if it's lightweight. **Why this is needed:** Playwright's `page.route()` only intercepts browser-context requests; Better Auth's OIDC client uses `betterFetch` from the Next.js server process, which bypasses `page.route()`. The 3 SSO Playwright specs PLAN-004 authored (`sso-happy-path`, `hd-restriction`, `account-linking` — currently `test.fixme()`'d) need this mock to run.
    3. **Override the OIDC config for tests:** set env vars before `pnpm dev` launches so Better Auth points at the mock — `OIDC_CLIENT_ID=test-client`, `OIDC_CLIENT_SECRET=test-secret`, `OIDC_HOSTED_DOMAIN=test.example`, **`OIDC_DISCOVERY_URL=http://127.0.0.1:9999/.well-known/openid-configuration`** (new env var — PLAN-008 also lands the corresponding `discoveryUrl: process.env.OIDC_DISCOVERY_URL ?? 'https://accounts.google.com/.well-known/openid-configuration'` override in `packages/auth/src/config.ts`'s OIDC plugin config).
    4. **Seed the bootstrap Admin** via `BOOTSTRAP_ADMIN_EMAIL` env var.
  - `webServer` block: `command: 'pnpm dev'` with `env: { DATABASE_URL, BETTER_AUTH_SECRET, OIDC_*, BOOTSTRAP_* }` populated by globalSetup. `reuseExistingServer: !process.env.CI` (developer convenience).
  - `globalTeardown`: stop the OIDC mock server, stop the Postgres testcontainer.
- **Verification:** `pnpm --filter web e2e --list` shows the walking-skeleton test PLUS the 3 previously-fixme'd SSO specs from PLAN-004 (`sso-happy-path`, `hd-restriction`, `account-linking`) — once they're un-fixme'd in PLAN-008 (see Step 3 below).

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

### Step 3.5 — Un-fixme PLAN-004's deferred SSO specs + rewrite the mock

PLAN-004 shipped three SSO Playwright specs that were `test.fixme()`'d pending the Step 1 OIDC mock server. With that server now live, this step re-enables them.

- **Action:**
  1. In each of `apps/web/__e2e__/auth/sso-happy-path.spec.ts`, `hd-restriction.spec.ts`, `account-linking.spec.ts`: remove the `test.fixme(true, '...')` block. Leave the env-conditional `test.skip(!OIDC_CLIENT_ID, ...)` in place — it still serves the "OIDC config not present" path.
  2. Rewrite `apps/web/__e2e__/support/oauth-mock.ts`: the existing `mockOidc(page, ...)` helper uses `page.route()` (browser-only) and DOES NOT WORK against Better Auth's server-side OAuth fetches. Replace it with a small helper that **seeds the in-process OIDC mock server (Step 1) with the profile to return** for the next sign-in (e.g., `await setMockProfile({ email, name, hd })` which POSTs to a control endpoint on the mock server like `http://127.0.0.1:9999/_test/profile`). The spec then clicks the SSO button; Better Auth's server-side flow hits the mock; the mock returns the seeded profile via /userinfo; the callback completes server-side; the browser sees the redirect back to `/`.
- **Verification:** all three previously-fixme'd specs now pass:
  - `sso-happy-path.spec.ts` — Alumni user created with `role: 'Alumni'`; user lands on `/`.
  - `hd-restriction.spec.ts` — non-HD profile → redirect to `/login?error=hd_restriction`; zero `users` rows for that email.
  - `account-linking.spec.ts` — same email signed up via invite-token then SSO → one `users` row, two `account` rows (one `credential`, one `google-workspace`).

### Step 4 — Commit

- **Action:** commit per Outputs.

## 5. Verification

- [ ] `pnpm --filter web e2e` passes — both the new `walking-skeleton.spec.ts` AND the three previously-fixme'd SSO specs from PLAN-004 (`sso-happy-path`, `hd-restriction`, `account-linking`) now run + pass against the OIDC mock server from Step 1.
- [ ] Run the test 5x in a row; all 5 pass (no flake).
- [ ] The audit-log assertion at the end correctly identifies the 7 expected transitions:
  - `null → awaiting_moderation` (Alumni, on PostJob)
  - `awaiting_moderation → approved` (Moderator, on Approve)
  - `approved → enrollment_open` (system, immediately after)
  - `enrollment_open → locked` (Alumni, on Lock)
  - `locked → completed` (Alumni, on Complete)
  - `completed → payment_sent` (Alumni, on MarkPaymentSent)
  - `payment_sent → closed` (Active, on ConfirmReceipt)
- [ ] `OIDC_DISCOVERY_URL` env-var override is honored by `packages/auth/src/config.ts` — confirmed by the SSO specs hitting the local mock, not real Google.
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
| 2026-05-14 | Tom Haynes | Plan-decomposition pass: frontmatter `related.plans` reshaped to `{prerequisite, lateral}` with VALIDATION-008 paired. PLAN-008 is the walking-skeleton happy-path; non-happy-path E2E specs (dispute, min-Admin, role-management, Admin view) are owned by VALIDATION-010 / VALIDATION-011 / VALIDATION-012. |
| 2026-05-15 | Tom Haynes | Step 1 rewritten + Step 3.5 added: PLAN-004's validation surfaced that `page.route()` only intercepts browser-context requests, so Better Auth's server-side OIDC fetches (discovery, token, userinfo) bypass it entirely — the 3 SSO Playwright specs PLAN-004 authored were marked `test.fixme()` pending this plan. Step 1 now lands a local in-process OIDC mock server (4 endpoints: `.well-known/openid-configuration`, `/oauth/authorize`, `/oauth/token`, `/userinfo`) on a fixed port, plus an `OIDC_DISCOVERY_URL` env var override in `packages/auth/src/config.ts` so tests can point Better Auth at the mock. Step 3.5 un-fixme's the three specs and replaces the broken `oauth-mock.ts` `page.route()` helper with one that seeds the mock server's "next profile to return" via a control endpoint. §5 verification updated to require all four specs (walking-skeleton + 3 SSO) pass. |
| 2026-05-16 | Tom Haynes | Post-execution deviations from landed commit `54ea551`, captured for future readers: (a) Resend test route lives at `apps/web/app/api/test/resend-calls/` not `…/api/_test/…` — Next.js 16 treats `_`-prefixed folders as private and skips them from routing, so the underscore name would have yielded a true 404 even with `RESEND_TEST_MODE=true`. (b) SSO specs landed as a single consolidated `apps/web/__e2e__/auth/sso.spec.ts` running `mode: 'serial'` (4 tests: `sso-happy-path` AC-01, `hd-restriction` AC-02, `account-linking` R-09, `sso-no-name-claim` AC-09) — the OIDC mock's `nextProfile` slot is shared global state and parallel workers race on seed/consume; serial+co-located is read-friendly. (c) Cross-spec isolation: per-spec UUID-suffixed identifiers + scoped assertions (no truncation; legacy `truncateAll` / `truncateWalkingSkeleton` reduced to no-ops). The chained spec filters the Resend recorder by `idempotencyKey = job:<id>:payment_sent`. (d) OIDC mock port is OS-assigned (Trap 1's lean), persisted to `apps/web/.playwright-tmp/env.json` (gitignored). (e) Better Auth `accountLinking.requireLocalEmailVerified: false` set in `packages/auth/src/config.ts` — Better Auth defaults to refusing trusted-provider auto-link against an unverified credential user; MVP has no email-verification UI on credential signup, so without this override the account-linking happy-path 401s. Aligns with PRD-003 R-09's "trustedProviders just-works" intent. (f) `apps/web/__e2e__/auth/bootstrap-admin.spec.ts` is `test.skip(true, …)` with documented rationale — globalSetup pre-seeds `BOOTSTRAP_ADMIN_EMAIL` as Admin so the chained walking-skeleton spec can sign in via the form, which makes the "sign up THEN bootstrap-promote" browser premise no longer reproducible. Bootstrap-hook behavior remains covered by `packages/auth/__tests__/hooks/bootstrap-admin.test.ts` (unit) + `signup-flow.test.ts` (integration) + implicit firing during walking-skeleton Admin sign-in. Reshape (let the spec own a non-pre-seeded `BOOTSTRAP_ADMIN_EMAIL`) is a follow-up — pick up if a regression slips past unit + integration. | |
