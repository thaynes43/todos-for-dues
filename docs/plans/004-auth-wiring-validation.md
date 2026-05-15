---
id: VALIDATION-004
title: Validation — PLAN-004 auth wiring (Better Auth + Workspace OIDC + invite tokens + Server Actions)
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: M
related:
  prds: [PRD-001, PRD-003, PRD-008]
  adrs: [ADR-002, ADR-007, ADR-011]
  bounded_contexts: [BCC-01]
  aggregates: [ADC-02]
  designs: [DESIGN-004]
  plans:
    pairs_with: PLAN-004
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-004 implements DESIGN-004 end-to-end: Better Auth instance with `genericOAuth`, HD-restriction hook, session-extension hook attaching `role`, bootstrap-admin hook on first matching login, invite-token-gated signup, account linking on first SSO of an existing app-managed account, and the three Server Actions. Every PRD-003 AC is covered.

## 2. Inputs

- **Paired implementation plan:** `docs/plans/004-auth-wiring-implementation.md`.
- **PRDs / designs:**
  - `docs/designs/004-auth-wiring.md` §4 + §8 testing approach.
  - `docs/prds/003-identity-and-access.md` §5 R-01..R-10 + §5.1 AC-01..AC-09.
  - `docs/prds/001-todos-for-dues-overview.md` R-01 (invite-link signup); R-10 (OIDC SSO).
  - `docs/adrs/007-google-workspace-oidc.md` (HD restriction mechanism).
- **Running artifacts:** `packages/auth` package + the Better Auth handler at `/api/auth/[...all]` + the three Server Actions, served from `pnpm dev` on `localhost:3000`. Workspace OIDC is mocked at the integration test layer (no real Workspace traffic).

## 3. Coverage matrix

| PRD R-NN / AC-NN | Unit/integration test | Playwright spec |
|---|---|---|
| PRD-003 R-01 / AC-01 (two account paths) | `invite-token signup creates Active`; `SSO mock creates Alumni` | `apps/web/e2e/auth/sso-happy-path.spec.ts` + `apps/web/e2e/auth/invite-signup-happy-path.spec.ts` |
| PRD-003 R-02 / AC-03 (invite required for app-managed) | `signup without token → rejected before user row created` | `apps/web/e2e/auth/no-token-signup.spec.ts` |
| PRD-003 R-03 / AC-01 (first SSO → role Alumni) | `SSO mock test asserts users.role = 'Alumni'` | same as AC-01 |
| PRD-003 R-04 / AC-02 (HD restriction at callback) | `hd-restriction.test.ts` rejects non-HD; `integration test asserts no user row created` | `apps/web/e2e/auth/hd-restriction.spec.ts` |
| PRD-003 R-05 / AC-04 (env-var OIDC config) | `OIDC env vars set → SSO button visible + works` | `apps/web/e2e/auth/sso-happy-path.spec.ts` |
| PRD-003 R-05 / AC-05 (no OIDC env → no SSO button) | `OIDC env vars unset → SSO button absent from /login` | `apps/web/e2e/auth/no-oidc-config.spec.ts` |
| PRD-003 R-06 (MFA delegation) | n/a (Workspace-admin responsibility; documented) | — |
| PRD-003 R-07 / AC-06 (no privileged role at signup) | integration test asserts first-SSO user is `Alumni` not Moderator/Admin | implicit in AC-01 specs |
| PRD-003 R-08 / AC-07 (Admin deactivation blocks signin — deferred for MVP per PRD-003 §10) | not tested in MVP — deactivation is post-MVP | — |
| PRD-003 R-09 / AC-01 latter (account linking — same email → same account) | `integration: existing app-managed user → first SSO → no duplicate row` | `apps/web/e2e/auth/account-linking.spec.ts` |
| PRD-003 R-10 / AC-08 (app-managed display name required) | `signup with empty displayName → 400 + no user row` | `apps/web/e2e/auth/signup-no-display-name.spec.ts` |
| PRD-003 R-10 / AC-09 (SSO fallback display-name prompt) | `OIDC callback with no name claim → "What should we call you?" form` | `apps/web/e2e/auth/sso-no-name-claim.spec.ts` |
| PRD-001 R-01 (invite-link signup gated per role) | `invite token's preselectedRole sets users.role at signup` | implicit |
| ADR-002 + ADR-011 (`BOOTSTRAP_ADMIN_EMAIL`) | `bootstrap-admin.test.ts` + integration | `apps/web/e2e/auth/bootstrap-admin.spec.ts` |
| DESIGN-004 §4.2 (HD hook checks `hd` claim AND email domain) | `hd-restriction.test.ts` covers both branches | — |
| DESIGN-004 §4.3 (session.user.role populated) | `session-extension.test.ts` | implicit — every authenticated Playwright test exercises this |
| DESIGN-004 §4.4 (bootstrap-admin writes user_role_transitions) | `bootstrap-admin.test.ts` asserts the audit row | — |
| DESIGN-004 §4.5 (verifyInviteToken — valid/not_found/revoked) | `verify-invite-token.test.ts` | — |
| DESIGN-004 §4.6/§4.7/§4.8 (3 Server Actions) | Server Action unit tests + happy-path Playwright | included in the auth specs above |
| DESIGN-004 §4.9 (account linking) | integration test verifies same user_id post-link | account-linking.spec.ts |
| DESIGN-004 §4.10 (OAuth catch-all route) | smoke test the route exists + returns expected for unauthorized callbacks | implicit |

## 4. Unit tests

All under `packages/auth/__tests__/`.

- **`hd-restriction.test.ts`** — given `profile.hd === expected AND email endsWith @<expected>` → no throw; either mismatch → `HdRestrictionError`.
- **`verify-invite-token.test.ts`** — valid token → returns `preselectedRole`; not-found → throws `InviteTokenError('not_found')`; revoked → throws `InviteTokenError('revoked')`.
- **`session-extension.test.ts`** — given user id → returns `{ role, displayName }` from `users` table.
- **`bootstrap-admin.test.ts`** — user matching `BOOTSTRAP_ADMIN_EMAIL` → role becomes Admin + `user_role_transitions` row with `initiatorKind: 'system'`; non-matching → no-op; already-Admin → no-op.

## 5. Playwright E2E tests

All against `pnpm dev` at `http://localhost:3000`. Workspace OIDC mocked via `page.route()` intercepting `/api/auth/callback/oauth/google-workspace` for the SSO specs.

- **`apps/web/e2e/auth/invite-signup-happy-path.spec.ts`** — open `/signup?token=<valid>` → fill form (email + password + display name) → submit → land on `/` signed in → assert `users.role = 'Active'` (or `'Alumni'` per token).
- **`apps/web/e2e/auth/no-token-signup.spec.ts`** — open `/signup` without token → submit → see "Invite link is invalid or has been revoked." → no user row created (verify via direct DB).
- **`apps/web/e2e/auth/sso-happy-path.spec.ts`** — click "Sign in with Google" → mocked callback returns valid HD payload → land on `/` → assert user row exists with `role: 'Alumni'`.
- **`apps/web/e2e/auth/hd-restriction.spec.ts`** — click "Sign in with Google" → mocked callback returns non-HD email → land on `/login?error=hd_restriction` with the user-facing message → no user row created.
- **`apps/web/e2e/auth/no-oidc-config.spec.ts`** — start dev server with `OIDC_HOSTED_DOMAIN` unset (env override via test scenario); open `/login` → "Sign in with Google" button absent.
- **`apps/web/e2e/auth/account-linking.spec.ts`** — first sign up app-managed as `user@<HD>`; sign out; sign in via mocked Workspace SSO for the same email; assert the same user_id is used (no duplicate row in `users`).
- **`apps/web/e2e/auth/signup-no-display-name.spec.ts`** — open `/signup?token=<valid>` → submit with empty `displayName` → see field-level error → no user row created.
- **`apps/web/e2e/auth/sso-no-name-claim.spec.ts`** — mocked callback returns valid HD but empty `name` → "What should we call you?" form appears → submit non-empty → session created with `displayName` set.
- **`apps/web/e2e/auth/bootstrap-admin.spec.ts`** — set `BOOTSTRAP_ADMIN_EMAIL` for the test scenario; sign in as that user → assert `users.role = 'Admin'` + a `user_role_transitions` row with `initiatorKind: 'system'`.

## 6. Pass/fail gates

- [ ] `pnpm --filter @app/auth typecheck && test` passes all unit + integration tests.
- [ ] `pnpm --filter web e2e -- --grep auth/` passes every spec listed in §5 **except the three SSO-mock-dependent specs** (`sso-happy-path`, `hd-restriction`, `account-linking`) — those are formally deferred to PLAN-008 / VALIDATION-008. The deferral is recorded as `test.fixme(true, '...')` on each spec with a reference back to PLAN-008's Step 1 (in-process OIDC mock server) and Step 3.5 (un-fixme + rewrite the mock helper). **Why deferred:** Playwright's `page.route()` intercepts only browser-context requests, but Better Auth fetches the OIDC discovery / token / userinfo endpoints server-side from the Next.js process, bypassing the mock. The proper fix is test-infra work (local in-process OIDC mock server + `OIDC_DISCOVERY_URL` env override) that PLAN-008's globalSetup already plans. The three flows themselves (signup, HD-restriction, account-linking) are verified by `packages/auth/__tests__/integration/` against real PG16 testcontainers — PLAN-008's specs add browser-level confirmation, not the primary safety net.
- [ ] No console errors in the auth Playwright specs that DO run (the 6 non-SSO ones).
- [ ] After running the signup + bootstrap-admin specs, the DB contains exactly the expected `users`, `account`, and `user_role_transitions` rows (assertions inside specs).
- [ ] **Schema reshape gates (Better Auth ↔ DESIGN-001 reconciliation):**
  - The four PLAN-004 schema-reshape migrations apply cleanly to a fresh PG16: (a) `session` / `account` / `verification` tables created per Better Auth 1.6.x's drizzle adapter shape with `ON DELETE CASCADE` from both `session.user_id` and `account.user_id` to `users(id)`; (b) `users.email_verified BOOLEAN NOT NULL DEFAULT false` added; (c) `users_account_kind` CHECK constraint dropped; (d) legacy `users.password_hash` / `users.oidc_subject` / `users.oidc_provider` columns dropped.
  - Drizzle schema declarations under `packages/db/src/schema/` include typed exports for `session`, `account`, `verification`; the barrel exports them.
  - `packages/db/__tests__/constraints.test.ts` no longer asserts the `users_account_kind` CHECK (the assertion was removed because the constraint no longer exists). Re-run `pnpm --filter @app/db test` — green.
  - Integration test in `packages/auth/__tests__/integration/` asserts: invite-token signup → `users` row + `account` row with `providerId: 'credential'` + `password: <hash>`; SSO sign-in → `users` row with `role: 'Alumni'` + `account` row with `providerId: 'google-workspace'` + `accountId: <oidc sub>`; account linking → one `users` row + TWO `account` rows (one per provider) with same `user_id`.
- [ ] **Cross-plan invariant:** `pnpm --filter @app/domain test` still exits 0, especially `no-direct-state-writes.test.ts`. The bootstrap-admin hook from Trap 1 must route through `transitionRole` from `@app/domain`.
- [ ] Repo-wide `pnpm -r typecheck` exit code 0.
- [ ] One PLAN-004 commit on the branch.

## 7. Resume notes

Specs are independent. If a spec hangs, kill the dev server and re-run. The mocked OIDC callback must reset `page.route()` between tests (Playwright handles this per-`test.beforeEach` if registered there).

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-004. Maps every PRD-003 AC to a unit + Playwright spec. Workspace OIDC mocked at the callback URL; no real Workspace traffic in tests. |
| 2026-05-14 | Tom Haynes | §6: added the Better-Auth ↔ DESIGN-001 reconciliation gates. PLAN-004's execution surfaced that Better Auth 1.6.x stores credentials in its own `account` table — incompatible with DESIGN-001 §4.2's `users.password_hash` / `oidc_subject` + `users_account_kind` CHECK (DESIGN-001 §2.2 already ceded Better Auth's internal layout to DESIGN-004, but §4.2 had drifted). PLAN-004 now also ships: Better Auth's session/account/verification tables, a `users.email_verified` column, drops the `users_account_kind` CHECK + the legacy `password_hash` / `oidc_subject` / `oidc_provider` columns, and updates `packages/db/__tests__/constraints.test.ts` to remove the now-stale CHECK assertion. New integration tests in `packages/auth/__tests__/integration/` assert the post-signup row shapes (users + account) and the linking behavior (two account rows per user). Cross-plan invariant (PLAN-003's `no-direct-state-writes.test.ts`) remains hard-required. |
| 2026-05-15 | Tom Haynes | §6: formally deferred the three SSO-mock-dependent Playwright specs (`sso-happy-path`, `hd-restriction`, `account-linking`) to PLAN-008. Validation surfaced that `page.route()` intercepts only browser-context requests but Better Auth fetches OIDC endpoints server-side, so the existing mock structurally doesn't work. The three specs are now `test.fixme(true, '...')` with a clear handoff to PLAN-008 Step 1 (in-process OIDC mock server) and Step 3.5 (un-fixme + rewrite). The wiring is already verified by `packages/auth/__tests__/integration/`. Separately: `fix(auth): SSO button uses POST per Better Auth genericOAuth contract` landed as a follow-up commit on top of PLAN-004 — the SSO button was rendered as a `<a href>` (GET, 404s against Better Auth's POST endpoint); replaced with a client-side fetch+redirect to `/api/auth/sign-in/oauth2`. |
