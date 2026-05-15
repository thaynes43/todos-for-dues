---
id: VALIDATION-012
title: Validation — PLAN-012 role management UI
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: M
related:
  prds: [PRD-008, PRD-003, PRD-007]
  adrs: [ADR-001, ADR-011]
  bounded_contexts: [BCC-03]
  aggregates: [ADC-02]
  designs: [DESIGN-006]
  plans:
    pairs_with: PLAN-012
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-012's role-management UI implements every PRD-008 AC: self-service Active ↔ Alumni round-trips on `/profile`, Moderator/Admin step-down via the profile dropdown, Admin grant/demote on `/admin/users`, role-change history per user, and the load-bearing min-Admin error UX (banner + contextual link) from PRD-008 R-06 + AC-04 / AC-05 / AC-06.

## 2. Inputs

- **Paired implementation plan:** `docs/plans/012-role-management-ui.md`.
- **PRDs / designs:**
  - `docs/prds/008-role-management.md` §5 R-01..R-10 + §5.1 AC-01..AC-11 + §5.2 example wording + §6 UX rules.
  - `docs/designs/006-ui-components.md` §3 (component list) + §4.3 (`MinAdminErrorBanner` sketch).
  - `docs/adrs/011-role-partition-in-better-auth.md` (role enum + invariant).
- **Running artifacts:** `pnpm dev` + a seeded DB with at least one Admin, one Moderator, one Alumni, one Active. Mocked OIDC for any persona switching that requires SSO (otherwise app-managed signup is used).

## 3. Coverage matrix

| PRD R-NN / AC-NN / §6 UX rule | Component or route | Test |
|---|---|---|
| PRD-008 AC-01 (self-service Active → Alumni) | `RoleChangeDropdown` on `/profile` | `apps/web/e2e/roles/self-service.spec.ts` |
| PRD-008 AC-02 (Admin grants Moderator) | `UserListTable` role chip → grant menu | `apps/web/e2e/roles/admin-grant.spec.ts` |
| PRD-008 AC-03 (crafted self-grant to Admin → 403) | server-side enforcement; UI never offers it | `apps/web/__tests__/components/RoleChangeDropdown.test.tsx` (dropdown options) |
| PRD-008 AC-04 (last-Admin self-demote → 422) | `RoleChangeDropdown` catches `MIN_ADMIN_INVARIANT_VIOLATED` | `apps/web/e2e/roles/last-admin-blocked.spec.ts` |
| PRD-008 AC-05 (atomic swap UX flow) | promote-then-demote via two UI steps | `apps/web/e2e/roles/admin-swap.spec.ts` |
| PRD-008 AC-06 (error banner + contextual link) | `MinAdminErrorBanner` | `last-admin-blocked.spec.ts` |
| PRD-008 AC-07 (every role change writes user_role_transitions) | covered at DB layer by VALIDATION-003; UI assertion = audit row visible in role history | `admin-grant.spec.ts` + `self-service.spec.ts` |
| PRD-008 AC-08 (`/admin/users` shows all users with role chip) | `UserListTable` | `apps/web/e2e/roles/admin-users-list.spec.ts` |
| PRD-008 AC-09 (Active sees Active + Alumni in dropdown) | `RoleChangeDropdown` filter | unit test |
| PRD-008 AC-10 (Mod sees Active + Alumni + Mod-current) | same | unit test |
| PRD-008 AC-11 (user history shows 3 transitions descending) | `RoleChangeHistoryTable` | `apps/web/e2e/roles/role-history.spec.ts` |
| PRD-008 R-06 (contextual link only for Admins) | `MinAdminErrorBanner` `canPromote` prop | unit test (banner rendered with/without link) |
| PRD-008 §6 UX rule "self-service dropdown filtered" | `RoleChangeDropdown` never includes Mod/Admin as targets | unit test |
| PRD-008 §6 UX rule "Admin demotion confirm" | `UserListTable` confirms before demoting another Admin | unit test on `UserListTable` |
| PRD-008 §6 UX rule "role-change history read-only" | `RoleChangeHistoryTable` has no editable affordances | snapshot |
| DESIGN-006 §3 `RoleChangeDropdown`, `UserListTable`, `MinAdminErrorBanner` | all three exist and render | unit tests on each |

## 4. Unit tests

`apps/web/__tests__/components/`.

- **`MinAdminErrorBanner.test.tsx`** — with `canPromote=true` → link to `/admin/users` rendered; with `canPromote=false` → link absent; ARIA `role="alert"` present; wording matches PRD-008 §5.2.
- **`RoleChangeDropdown.test.tsx`**:
  - Active viewer: options are `Active (current)` + `Alumni`. NEVER includes Moderator or Admin.
  - Alumni viewer: options are `Active` + `Alumni (current)`.
  - Moderator viewer: options are `Active` + `Alumni` + `Moderator (current)`.
  - Admin viewer: options are `Active` + `Alumni` + `Admin (current)`.
  - Selecting a non-current option calls `users.changeRole` with the toRole.
  - On `MIN_ADMIN_INVARIANT_VIOLATED` error, calls `onMinAdminError` callback (parent renders the banner).
- **`UserListTable.test.tsx`**:
  - Renders one row per user with display name, email, role chip.
  - Clicking the role chip opens a menu of valid target roles (excluding current).
  - Selecting Active or Alumni (for a Moderator/Admin row) opens a confirm dialog if demoting an Admin; for non-Admin demotions, no extra confirm.
  - On `MIN_ADMIN_INVARIANT_VIOLATED` error, renders `<MinAdminErrorBanner canPromote={true} />` inline (the viewer is necessarily Admin).
- **`RoleChangeHistoryTable.test.tsx`** — given 3 transitions, renders chronological-descending; timestamps via `formatChapterLocal`; initiator labelled "system" when `initiatorKind === 'system'`.

## 5. Playwright E2E tests

- **`apps/web/e2e/roles/self-service.spec.ts`** — sign in as Active → `/profile` → dropdown shows Active (current) + Alumni → select Alumni → role updates everywhere; reload `/profile` → dropdown now shows Active + Alumni (current); audit row visible in Admin's `/admin/users/<id>` after switching to Admin context.
- **`apps/web/e2e/roles/admin-grant.spec.ts`** — sign in as Admin → `/admin/users` → click role chip on Alumni row → menu opens → select Moderator → confirmation NOT shown (Alumni → Mod is a grant, not a demotion of an Admin) → role updates → audit row written.
- **`apps/web/e2e/roles/admin-demote-admin.spec.ts`** — Admin A demotes Admin B → confirm dialog appears → confirm → B's role becomes Alumni → audit row written.
- **`apps/web/e2e/roles/last-admin-blocked.spec.ts`** — sign in as the only Admin → `/profile` → select Alumni → server responds 422 `MIN_ADMIN_INVARIANT_VIOLATED` → `<MinAdminErrorBanner>` renders with the wording from PRD-008 §5.2 → "Promote another user to Admin first →" link visible (viewer is Admin → `canPromote=true`) → role unchanged.
- **`apps/web/e2e/roles/admin-swap.spec.ts`** — last-Admin attempts self-demote (banner shown) → clicks the link → lands on `/admin/users` (with `?returnTo=/profile` per PLAN-012 Q-PLN-03) → grants Admin to user B → returns to `/profile` (via the return link) → now self-demotes successfully → `users.role = 'Alumni'`; B is now sole Admin.
- **`apps/web/e2e/roles/admin-users-list.spec.ts`** — `/admin/users` shows all users with display name + email + role chip; correct columns per PRD-008 R-08 / AC-08.
- **`apps/web/e2e/roles/role-history.spec.ts`** — seed a user with 3 transitions; sign in as Admin → `/admin/users/<id>` → history table shows all 3 rows in descending order with the right initiators per PRD-008 AC-11.

## 6. Pass/fail gates

- [ ] All Vitest component tests pass.
- [ ] All Playwright specs pass against `pnpm dev` (run 3x — no flake).
- [ ] After running `admin-swap.spec.ts`, the DB shows the expected `user_role_transitions` rows (one for the promote, one for the demote) — the deferred-CHECK trigger never fired (verifiable by absence of the 422 in the spec's network log between the promote and the demote).
- [ ] No console.error during runs.
- [ ] `pnpm --filter web build` succeeds.
- [ ] One PLAN-012 commit on the branch.

## 7. Resume notes

The last-Admin specs depend on careful test isolation — each spec starts with EXACTLY one Admin (truncate + reseed in `test.beforeEach` to guarantee). If a spec leaks an additional Admin, subsequent tests fail noisy. Mid-test interrupts: re-truncate + re-run.

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-012. Covers every PRD-008 AC; the load-bearing last-Admin invariant flow is the `admin-swap.spec.ts` — exercising the full "blocked → promote → demote" round-trip including the contextual link with `?returnTo`. |
