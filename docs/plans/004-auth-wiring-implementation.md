---
id: PLAN-004
title: Auth wiring implementation — Better Auth + Workspace OIDC + invite tokens + 3 Server Actions
status: Draft
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
  plans: [PLAN-001, PLAN-002, PLAN-003]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Implement DESIGN-004 end-to-end: Better Auth instance with `genericOAuth` plugin, HD-restriction hook at the OAuth callback (per ADR-007), session-extension hook attaching `role` to the session payload, `BOOTSTRAP_ADMIN_EMAIL` boot-time promotion hook, invite-token verification helper, and the three Server Actions for signup / login / forgot-password.

> **Definition of success:** invite-token signup creates a user with the link's pre-selected role + auto-signs them in; Workspace SSO with a matching `@<HD>` account creates an Alumni user and signs in; non-HD SSO requests are rejected before any session is created; `BOOTSTRAP_ADMIN_EMAIL` set + matching user signs in → user becomes Admin (with `user_role_transitions` audit row); session payload includes `role`. All verified by integration tests against testcontainers PG16 with mocked Workspace OIDC.

## 2. Inputs

1. `docs/designs/004-auth-wiring.md`
2. `docs/adrs/002-auth.md` + `docs/adrs/007-google-workspace-oidc.md`
3. `docs/prds/003-identity-and-access.md`
4. PLAN-001 (Better Auth scaffolded with `emailAndPassword.enabled = true`)
5. PLAN-002 (users + invite_tokens + user_role_transitions tables exist)
6. PLAN-003 (`transitionRole()` available)

## 3. Outputs

- `packages/auth/src/config.ts` per DESIGN-004 §4.1
- `packages/auth/src/hooks/hd-restriction.ts` per §4.2 + `HdRestrictionError` class
- `packages/auth/src/hooks/session-extension.ts` per §4.3
- `packages/auth/src/hooks/bootstrap-admin.ts` per §4.4
- `packages/auth/src/invite-tokens/verify.ts` per §4.5 + `InviteTokenError` class
- `packages/auth/src/index.ts` exporting `auth`, `getServerSession`, types
- `apps/web/app/signup/page.tsx` + `actions.ts` per §4.6
- `apps/web/app/login/page.tsx` + `actions.ts` per §4.7
- `apps/web/app/forgot-password/page.tsx` + `actions.ts` per §4.8
- `apps/web/app/api/auth/[...all]/route.ts` per §4.10
- Integration tests in `packages/auth/__tests__/integration/`
- Playwright E2E `apps/web/e2e/auth.spec.ts` covering signup + login + SSO (mocked)
- One commit: `feat(auth): wire Better Auth + Workspace OIDC + invite tokens per DESIGN-004`

## 4. Steps

### Step 1 — Better Auth instance + drizzleAdapter

- **Action:** implement `packages/auth/src/config.ts` per DESIGN-004 §4.1. Add deps: `better-auth`, `better-auth/plugins/generic-oauth`, `better-auth/adapters/drizzle`. Configure with `emailAndPassword`, the OIDC plugin (using env vars), session config, and the three hook arrays.
- **Verification:** typecheck passes. `pnpm dev` boots; `curl localhost:3000/api/auth/sign-up/email -d '{...}'` returns Better Auth's response.

### Step 2 — Hooks (HD restriction, session extension, bootstrap admin)

- **Action:** copy DESIGN-004 §4.2, §4.3, §4.4 verbatim into `packages/auth/src/hooks/`. Each hook exports as a function callable from the Better Auth `hooks` config.
- **Verification:** typecheck passes. Mock-test for each hook in `packages/auth/__tests__/`:
  - HD restriction: profile with matching HD + matching email → no throw; non-matching → `HdRestrictionError`.
  - Session extension: given a user_id, returns `{ role, displayName }`.
  - Bootstrap admin: given a user matching env var → role becomes Admin + `user_role_transitions` row written; non-matching → no-op.

### Step 3 — Invite-token verification helper

- **Action:** copy DESIGN-004 §4.5 into `packages/auth/src/invite-tokens/verify.ts`.
- **Verification:** unit tests for valid token / not found / revoked.

### Step 4 — Server Actions for signup / login / forgot-password

- **Action:** create the three Server Action files per DESIGN-004 §4.6 / §4.7 / §4.8. Pages (UI) are created in PLAN-006; this plan creates the actions + minimal placeholder pages that import them.
- **Verification:** `pnpm --filter web build` succeeds. E2E test (Step 6) covers behavior.

### Step 5 — OAuth callback route

- **Action:** replace `apps/web/app/api/auth/[...all]/route.ts` with `toNextJsHandler(auth.handler)` per DESIGN-004 §4.10.
- **Verification:** boot the dev server; OAuth flow URL `/api/auth/sign-in/oauth/google-workspace` returns a redirect.

### Step 6 — Integration tests

- **Action:** `packages/auth/__tests__/integration/` — invite-token signup happy path; SSO mock happy path (use a Workspace mock library or stub the OAuth callback); HD restriction rejection; account linking on first SSO of existing app-managed account; `BOOTSTRAP_ADMIN_EMAIL` end-to-end.
- **Verification:** all tests pass against testcontainers PG16.

### Step 7 — E2E signup + login flow

- **Action:** `apps/web/e2e/auth.spec.ts` — Playwright tests for the form flows. Mock Workspace OIDC via Playwright route interception.
- **Verification:** E2E suite passes against `pnpm dev`.

### Step 8 — Commit

- **Action:** commit per Outputs.

## 5. Verification

- [ ] `pnpm --filter @app/auth typecheck && test` passes.
- [ ] `pnpm --filter web build` succeeds.
- [ ] Integration tests cover: invite-token signup, SSO signup, HD restriction, account linking, bootstrap admin promotion.
- [ ] Playwright E2E covers: signup form → land on app; login form → land on app; "Sign in with Google" (mocked) → land on app; wrong-domain SSO → see HD-restriction banner.
- [ ] All PRD-003 ACs verified.
- [ ] One commit.

## 6. Out of scope

- UI styling / shadcn integration on the form pages (PLAN-006 polish).
- Admin's invite-token generation UI (PLAN-006).
- Role grants UI (PLAN-006).
- Notifications side effects on signup (none in MVP).

## 7. Risks & gotchas

- **Risk:** Better Auth's exact API for adding `role` as a custom session field varies by version. **Mitigation:** verify at install time and adjust `mapProfileToUser` / session-extension shape.
- **Risk:** Workspace mock for E2E tests may need an OIDC provider stub. **Mitigation:** use `next-auth-mock` or a hand-rolled OAuth-callback handler keyed by an env-var test mode.
- **Risk:** the HD-restriction hook fires AFTER the OAuth callback but before user creation. If the hook order is wrong, a non-HD user could end up with a user row. **Mitigation:** Step 6's HD restriction test verifies no user row exists after a non-HD attempt.
- **Risk:** Session-extension hook makes a per-request DB query for `role`. **Mitigation:** acceptable at MVP scale; cache or include in the session JWT post-MVP if it becomes a hot path.

## 8. Resume points

- After Step 1: Better Auth instance configured.
- After Step 2: hooks exist + unit tests pass.
- After Step 5: OAuth callback wired.
- After Step 7: E2E passes.
- After Step 8: committed.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Does Better Auth's account-linking (PRD-003 R-09) work transparently? | Test with integration test in Step 6 — write the test to find out; if not transparent, add the custom hook from DESIGN-004 §4.9. |
| Q-PLN-02 | Workspace SSO mock for E2E — what library or pattern? | Lean: Playwright `page.route()` interception of the OAuth callback URL with a stubbed JSON payload. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. 8 steps from Better Auth config to passing E2E auth tests. |
