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
- [ ] `pnpm --filter web e2e -- --grep auth/` passes every spec listed in §5.
- [ ] No console errors in the OIDC happy-path spec.
- [ ] After running the SSO + account-linking specs, the DB contains exactly the expected `users` and `user_role_transitions` rows (assertions inside specs).
- [ ] One PLAN-004 commit on the branch.

## 7. Resume notes

Specs are independent. If a spec hangs, kill the dev server and re-run. The mocked OIDC callback must reset `page.route()` between tests (Playwright handles this per-`test.beforeEach` if registered there).

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-004. Maps every PRD-003 AC to a unit + Playwright spec. Workspace OIDC mocked at the callback URL; no real Workspace traffic in tests. |
