---
id: VALIDATION-014
title: Validation — PLAN-014 Invite management UI + admin nav fix
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-17
last_updated: 2026-05-17
estimate: S
related:
  prds: [PRD-003]
  adrs: [ADR-002]
  bounded_contexts: [BCC-03]
  aggregates: []
  designs: [DESIGN-006]
  plans:
    pairs_with: PLAN-014
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-014 implements PRD-003 R-11..R-14 + AC-10..AC-13 + the `/admin` nav-link visibility, and that no prior plan's invariants regress (especially PLAN-004's signup-flow integration tests, which now must include the single-use case).

## 2. Inputs

- **Paired implementation plan:** `docs/plans/014-invite-management-and-admin-nav.md`.
- **PRD / design references:**
  - `docs/prds/003-identity-and-access.md` §5 R-11..R-14 + §5.1 AC-10..AC-13 + §10 release plan note.
  - `docs/designs/006-ui-components.md` §3 (the `/admin/*` route tree this plan extends).
- **Running artifacts:** `pnpm dev` + a seeded DB with at least one Admin persona (mocked OIDC OR app-managed Admin works).

## 3. Coverage matrix

| PRD ref / §6 UX rule | Component / route | Test |
|---|---|---|
| PRD-003 AC-10 (mint creates row) | `invites.mint` | `packages/api/__tests__/integration/invites.test.ts` ("mint inserts row with correct fields") |
| PRD-003 R-11 negative — mint Mod/Admin rejected | `invites.mint` Zod guard + DB CHECK | `invites.test.ts` ("mint rejects privileged roles before DB call") |
| PRD-003 AC-11 (list outstanding) | `invites.list` + `InviteList` | `invites.test.ts` ("list returns only outstanding, DESC order") + `apps/web/__tests__/components/InviteList.test.tsx` |
| PRD-003 AC-12 (revoke) | `invites.revoke` + `RevokeInviteButton` | `invites.test.ts` ("revoke sets revokedAt; second call returns NOT_FOUND") + `apps/web/e2e/admin/invites.spec.ts` (revoke flow) |
| PRD-003 AC-13 (single-use redemption) | signup-action revoke-on-success | `packages/auth/__tests__/integration/signup-flow.integration.test.ts` ("same token cannot be redeemed twice") |
| PRD-003 R-14 race-safety | signup-action revoke-first strategy | `signup-flow.integration.test.ts` ("concurrent redemption: exactly one user created, exactly one row revoked") |
| Gap 1 — RoleAwareNav `/admin` link visible to Admin only | `RoleAwareNav` | `apps/web/__tests__/components/RoleAwareNav.test.tsx` (four-role assertion) |
| AdminNav has Invites entry | `AdminNav` | `apps/web/__tests__/components/AdminNav.test.tsx` |
| `/admin/invites` route loads as Admin | `apps/web/app/admin/invites/page.tsx` | `apps/web/e2e/admin/invites.spec.ts` (smoke) |
| Copy-URL button copies the right URL | `InviteList` | `apps/web/e2e/admin/invites.spec.ts` (clipboard assertion) |
| Outstanding empty-state | `InviteList` | `InviteList.test.tsx` |
| Signup with single-use token → revoke automatic | end-to-end | `apps/web/e2e/admin/invites.spec.ts` (Admin mints → 2nd context signs up → reload → invite gone) |
| Signup with revoked token → existing error | `verifyInviteToken` (unchanged) | `signup-flow.integration.test.ts` (already covered; re-verify) |

## 4. Unit tests

`apps/web/__tests__/components/`:

- **`RoleAwareNav.test.tsx`** (extended) — assert visibility across all 4 roles. For Admin: `/admin` link present. For Active/Alumni/Moderator: absent. Existing per-role assertions for other links remain.
- **`AdminNav.test.tsx`** (extended) — six entries present (existing five + Invites); `data-testid='admin-nav-invites'` resolves to a link with `href='/admin/invites'`.
- **`InviteList.test.tsx`** — given an empty list, renders the empty-state copy. Given a list of 3, renders 3 rows with the role chip, minter name, and copy-URL button. Each row's signup URL is `<baseUrl>/signup?token=<token>` (the baseUrl prop drives this).
- **`MintInviteButton.test.tsx`** — clicking the button opens the modal; the role selector renders Active + Alumni only (never Moderator or Admin); submit fires `invites.mint.useMutation({ preselectedRole })`; on success the modal closes.
- **`RevokeInviteButton.test.tsx`** — clicking opens a confirm dialog; the confirm action fires `invites.revoke.useMutation({ id })`; cancel does NOT fire the mutation.

## 5. Playwright E2E test

`apps/web/e2e/admin/invites.spec.ts`:

- Admin signs in.
- Navigates to `/admin/invites` via the AdminNav "Invites" link (verifies the nav entry works).
- Sees empty state.
- Clicks "Mint invite" → modal opens → selects "Active" → submits → modal closes → row appears with role chip "Active" + a visible URL + Copy + Revoke buttons.
- Clicks Copy → asserts `navigator.clipboard.readText()` returns the expected URL (`<base>/signup?token=<token>`).
- Opens a second browser context, navigates to that URL → signup form appears → completes signup → lands on `/` as Active.
- Returns to Admin context, reloads `/admin/invites` → the previously-minted invite is GONE (revoked-on-redeem per R-14).
- Mints a second invite for Alumni → clicks Revoke → confirms → row disappears immediately.
- Reloads `/admin/invites` → confirms the revocation persisted (still empty).

Spec installs `installPageerrorListener` (PLAN-011 hygiene rule).

## 6. Pass/fail gates

- [ ] All Vitest component tests pass.
- [ ] All integration tests pass: `pnpm --filter @app/api test` (count ≥ baseline + new) + `pnpm --filter @app/auth test` (count ≥ baseline + new).
- [ ] Playwright spec passes 3× consecutively under `--workers=1` with no flake.
- [ ] No `console.error` during Playwright runs.
- [ ] `pnpm --filter web build` exits 0 with `DATABASE_URL` unset.
- [ ] `pnpm -r typecheck` exits 0.
- [ ] CI on the PR green (`lint-and-typecheck` + `test`).
- [ ] PR title starts with `feat(web):` (release-please minor bump → v0.6.0 on next release pass).
- [ ] **Cross-plan invariants ALL green:**
  - PLAN-003 `no-direct-state-writes` exit 0; IGNORE_DIRS unchanged.
  - PLAN-004 signup-flow integration tests still pass (with the added single-use case).
  - PLAN-005 ≥ 117 + new invites tests.
  - PLAN-006 per-page Playwright 7/7.
  - PLAN-007 notifications + settings green.
  - PLAN-008 chained walking-skeleton 5× no-flake + 4 SSO serial.
  - PLAN-010 MVP 9/9 under `--workers=1` (the parallel `my-postings` flake is a separate retro item).
  - PLAN-011 admin 10/10 (the 10 includes whatever was retired or replaced).
  - PLAN-012 roles 7/7.
  - `unset DATABASE_URL && pnpm --filter web build` exits 0.
- [ ] **DB-state assertions after the e2e spec:**
  - After Admin mints + 2nd context signs up: `invite_tokens` shows the row with `revoked_at` set, and a new row in `users` exists with role Active.
  - After Admin revokes the second invite: that token's `revoked_at` is set.
- [ ] **R-14 race-safety asserted:** the integration test for concurrent redemption uses `Promise.all` of two signup calls with the same token; exactly one succeeds; exactly one new user row exists; exactly one revoke happened.
- [ ] **No privileged-role invites possible:** integration test confirms `invites.mint({ preselectedRole: 'Moderator' })` rejects with a Zod parse error (or equivalent) before reaching the DB.
- [ ] **Branch-protection cross-check:** every commit on `plan-014-invite-management-and-admin-nav`; no direct push to main from this work.

## 7. Resume notes

If the Playwright spec flakes on the clipboard assertion: some Playwright runners need explicit `permissions: ['clipboard-read', 'clipboard-write']` in `playwright.config.ts`. Add it before retrying.

If `auth.api.signUpEmail` participates in the Drizzle transaction (Risk 1 strategy (b)), the integration tests should verify rollback on both writes. If it does NOT participate (strategy (a) — revoke-first), the tests should verify the orphan-token-on-account-creation-failure case (token stays revoked, no user row).

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-17 | Tom Haynes | Initial draft paired with PLAN-014. Covers PRD-003 R-11..R-14 + AC-10..AC-13 + the `/admin` nav-link visibility test. Specifies the race-safety integration test for R-14. |
