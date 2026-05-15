---
id: PLAN-012
title: Role management UI — profile self-service, Admin Users list, role history, min-Admin error UX
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
    prerequisite: [PLAN-005, PLAN-006, PLAN-011]
    lateral: [VALIDATION-012]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Build the role-management UI surfaces PRD-008 describes: the self-service role-change dropdown on each user's profile page, the Admin Users list at `/admin/users` (replacing PLAN-011's shell), the per-user role-change history, and the `<MinAdminErrorBanner>` component that surfaces the deferred-CHECK trigger error from PRD-008 R-06 with a contextual "Promote another user to Admin first" link.

**Why a new plan rather than extending PLAN-011:** PRD-008 owns its own UI surface (profile + admin-users), and the components are role-management-specific (filtered self-service dropdown, role chip with grant menu, min-Admin error banner) rather than Admin-view-specific. Keeping them separate lets PLAN-012 land after PLAN-011 deploys without coupling the two PRs.

> **Produces:** the role-management UI components and the two routes (`/profile`, `/admin/users` + `/admin/users/<userId>`) DESIGN-006 §3 describes.
> **Definition of success:** VALIDATION-012 passes — every PRD-008 AC has a passing Playwright spec; the last-Admin self-demote flow surfaces the MinAdminErrorBanner with the contextual link; self-service Active ↔ Alumni round-trips work; Admin grant + demote work; role-change history renders per user.

## 2. Inputs

### 2.1 Documents the agent must read first

1. `docs/designs/006-ui-components.md` §3 (component list: `RoleChangeDropdown`, `UserListTable`, `MinAdminErrorBanner`) + §4.3 (sketches for `MinAdminErrorBanner`).
2. `docs/prds/008-role-management.md` §5 R-01..R-10 + §5.1 ACs (especially AC-04..AC-06 for the min-Admin banner) + §5.2 example wording for R-06 ("Cannot demote — this is the chapter's only Admin. …").
3. `docs/prds/003-identity-and-access.md` R-10 (display name on User row — already populated by PLAN-004; UI in this plan reads it).
4. `docs/designs/003-trpc-api-surface.md` §4.5 (users router: `users.changeRole`, `users.grantRole`, `users.list`, `users.getRoleHistory`).
5. `docs/adrs/011-role-partition-in-better-auth.md` §Decision-outcome — for the role enum + `isPrivileged()` partition helper that the dropdown filters on.
6. `docs/designs/002-fsm-module.md` §4.3 — for the `MinAdminInvariantError` shape (`code: 'MIN_ADMIN_INVARIANT_VIOLATED'`) that the client branches on.

### 2.2 Repo state assumed

- PLAN-005 complete: `users.changeRole`, `users.grantRole`, `users.list`, `users.getRoleHistory` all exist + integration-tested incl. the min-Admin error response (422 with code `MIN_ADMIN_INVARIANT_VIOLATED`).
- PLAN-006 complete: ChapterHeader, RoleAwareNav exist (extended here with a "Profile" link); root layout's session context is read by `getServerSession`.
- PLAN-011 complete: `/admin/layout.tsx` Admin-only shell exists; `/admin/users/page.tsx` shell exists (replaced by this plan); the Admin nav already has the "Users" entry.

### 2.3 External dependencies

- Same as PLAN-006: dev server + Postgres.

## 3. Outputs

After this plan completes:

- `apps/web/components/RoleChangeDropdown.tsx` — per DESIGN-006 §3. A filtered dropdown showing only the non-privileged roles (Active, Alumni) plus the user's current role if it's privileged (so a Moderator sees `Active`, `Alumni`, `Moderator (current)`; an Admin sees `Active`, `Alumni`, `Admin (current)`). Selection of a non-current option calls `trpc.users.changeRole.useMutation({ toRole })`. Picking the privileged "(current)" entry is a no-op. Per PRD-008 R-09 + AC-09 / AC-10.
- `apps/web/components/MinAdminErrorBanner.tsx` — per DESIGN-006 §4.3. Plain-language error per PRD-008 R-06 / §5.2 example. Shown by parent components after they catch a tRPC error with code `MIN_ADMIN_INVARIANT_VIOLATED`. Includes the contextual "Promote another user to Admin first →" `<Link>` to `/admin/users`; the link is only shown when the viewing user has Admin role (`canPromote` prop driven by `session.user.role === 'Admin'` per PRD-008 R-06 — "The contextual link is only shown to Admins").
- `apps/web/components/UserListTable.tsx` — per DESIGN-006 §3. Renders the user list from `trpc.users.list.useQuery()`. Columns: display name, email, role-as-chip. The role chip doubles as the role-change affordance per PRD-008 §6 UX rule — clicking opens a small menu of valid target roles for that user (filtered to roles different from current; Admin → other roles include demotion targets; non-Admin viewers of this table → no-op since the page is Admin-only). Selection calls `trpc.users.grantRole.useMutation({ targetUserId, toRole })`. On 422 with `MIN_ADMIN_INVARIANT_VIOLATED` → render `<MinAdminErrorBanner canPromote={true} />` inline above the user row.
- `apps/web/components/RoleChangeHistoryTable.tsx` — chronological history per PRD-008 R-10. Calls `trpc.users.getRoleHistory({ userId })`. Columns: timestamp (chapter-local via `formatChapterLocal`; UTC ISO in `<time datetime>` for tooltip), `from_role → to_role`, initiator (display name + role, or "system" for `BOOTSTRAP_ADMIN_EMAIL` rows), note.
- `apps/web/app/profile/page.tsx` — new route. Server-component: requires a session (redirects unauthenticated to `/login`). Shows the viewing user's display name + email + current role + `<RoleChangeDropdown />`. On a `MIN_ADMIN_INVARIANT_VIOLATED` error from the dropdown's mutation → `<MinAdminErrorBanner canPromote={session.user.role === 'Admin'} />` rendered inline.
- `apps/web/app/admin/users/page.tsx` — **replaces PLAN-011's shell** with `<UserListTable />`. Inherits Admin gate from PLAN-011's `/admin/layout.tsx`.
- `apps/web/app/admin/users/[userId]/page.tsx` — per PRD-008 R-10 + DESIGN-006 §3. Admin-only. Shows the target user's display name + email + current role + `<RoleChangeHistoryTable userId={...} />`.
- `apps/web/components/RoleAwareNav.tsx` — **extended**: add a "Profile" link visible to every authenticated user.
- One git commit: `feat(web): role management UI — profile self-service / Admin Users list / role history / min-Admin error per PRD-008 + DESIGN-006`.

## 4. Steps

### Step 1 — Build MinAdminErrorBanner

- **Action:** copy DESIGN-006 §4.3 verbatim into `apps/web/components/MinAdminErrorBanner.tsx`. Accept a `canPromote: boolean` prop (controls whether the link is rendered). Use the wording from PRD-008 §5.2.
- **Verification:** snapshot tests render with `canPromote=true` (link visible) and `canPromote=false` (link absent); the role-banner ARIA role is `alert`.

### Step 2 — Build RoleChangeDropdown

- **Action:**
  - Client component. Props: `currentRole: Role` (from session).
  - Build the option list:
    - Always include `Active` and `Alumni` (non-privileged options).
    - If `currentRole` is `Moderator` or `Admin`, append `<currentRole> (current)` as the no-op default.
    - NEVER include `Moderator` or `Admin` as targets — even rendering them is a UX antipattern per PRD-008 §6 ("Self-service role dropdown is filtered to never show privileged options"). Confirmed by AC-09.
  - Selecting a non-current option calls `trpc.users.changeRole.useMutation({ toRole })`. On success: invalidate the session query so the role chip updates everywhere.
  - On error: if `err.data?.code === 'MIN_ADMIN_INVARIANT_VIOLATED'`, lift the error state to the parent so it can render `<MinAdminErrorBanner>`. Otherwise surface the error inline.
- **Verification:** AC-09 (Active sees Active + Alumni only); AC-10 (Moderator sees Active + Alumni + Moderator(current)); AC-01 (Active → Alumni round-trip succeeds + `user_role_transitions` row written).

### Step 3 — Build UserListTable

- **Action:**
  - Server-fetch `trpc.users.list.useQuery()`; render rows.
  - Each row: display name | email | role chip with click-to-change menu.
  - The menu shows the four roles, filtered to exclude the current one. Selection calls `trpc.users.grantRole.useMutation({ targetUserId: row.id, toRole })`.
  - Demoting another Admin shows a single-step confirm dialog per PRD-008 §6 UX rule ("No bulk role grants" + "Role changes are immediate (no email confirmation, no 'are you sure' modal except for Admin demotion of another Admin").
  - 422 `MIN_ADMIN_INVARIANT_VIOLATED` → render `<MinAdminErrorBanner canPromote={true} />` inline above the table (the viewer is necessarily an Admin since the page is Admin-only).
- **Verification:** AC-02 (Admin grants Moderator to a user → row updates, audit row written); AC-04 (last-Admin self-demote attempt from the Users page shows the banner — equivalent scenario, also covered on `/profile`); AC-08 (page renders all users with appropriate action menus).

### Step 4 — Build RoleChangeHistoryTable

- **Action:**
  - Server-fetch `trpc.users.getRoleHistory({ userId })`; render chronological-descending table.
  - Columns: timestamp (chapter-local + UTC tooltip), `<fromRole> → <toRole>`, initiator (display name + role; or "system" if `initiatorKind === 'system'`), note.
- **Verification:** AC-11 (a user with 3 role-change rows shows all 3 in descending order with the right initiator labels).

### Step 5 — Build the /profile route

- **Action:**
  - `apps/web/app/profile/page.tsx` — server component reading the session. If session is null → `redirect('/login')`. Otherwise render:
    - User's display name, email, current role.
    - `<RoleChangeDropdown currentRole={session.user.role} />` wrapped in a small client component that catches the `MIN_ADMIN_INVARIANT_VIOLATED` error and conditionally renders `<MinAdminErrorBanner canPromote={session.user.role === 'Admin'} />`.
- **Verification:** Active visits `/profile` → sees the dropdown filtered correctly; Moderator visits → sees the step-down option; last-Admin visits and attempts to self-demote → sees the banner with the contextual link (since the viewer is Admin → `canPromote=true`).

### Step 6 — Replace /admin/users shell + add /admin/users/[userId] detail

- **Action:**
  - Replace `apps/web/app/admin/users/page.tsx` (the PLAN-011 placeholder) with a server component that renders `<UserListTable />`.
  - Add `apps/web/app/admin/users/[userId]/page.tsx` — server component that fetches the target user (via `trpc.users.getById`) and renders display name + email + current role + `<RoleChangeHistoryTable userId={params.userId} />`. Both pages inherit the Admin gate from `/admin/layout.tsx`.
- **Verification:** Admin clicks a user row → navigates to `/admin/users/<id>` → sees the history table.

### Step 7 — Extend RoleAwareNav

- **Action:** add a "Profile" link for every authenticated user (regardless of role).
- **Verification:** nav rendered post-login shows the link.

### Step 8 — Commit

- **Action:** commit per Outputs.
- **Verification:** `git log -1` shows the commit; `pnpm --filter web build` succeeds.

## 5. Verification (end-to-end)

- [ ] VALIDATION-012 passes — every PRD-008 AC has a passing Playwright spec, including the AC-04 / AC-05 / AC-06 min-Admin-banner flow (with atomic-swap as the recovery path).
- [ ] `pnpm --filter web typecheck && build` succeed.
- [ ] Manual click-through:
  - Active opens `/profile` → dropdown shows `Active (current)` and `Alumni`; selects Alumni → role updates everywhere (chip in nav, profile chip); revisits `/profile` → dropdown now shows `Active` and `Alumni (current)`.
  - Moderator opens `/profile` → dropdown shows `Active`, `Alumni`, `Moderator (current)`; selecting `Active` steps down.
  - Last-Admin opens `/profile` → attempts to step down to Alumni → sees `<MinAdminErrorBanner>` with the "Promote another user to Admin first →" link → clicks it → lands on `/admin/users` → grants Admin to another user → returns to `/profile` → steps down successfully.
  - Admin on `/admin/users` → clicks a user's role chip → menu opens with the three other roles → grants Moderator → row updates, `user_role_transitions` row written.
- [ ] One commit on the current branch.

## 6. Out of scope

- Per-user last-active timestamp on the Users list (PRD-008 Q-03 lean defer post-MVP).
- Bulk role grants (PRD-008 §7.1 non-goal).
- Time-limited or scheduled role grants (PRD-008 §7.1 non-goal).
- Workspace group sync (PRD-008 §7.1 non-goal).
- Self-service display-name editing — PRD-003 R-10 says "Display name is editable post-signup (TBD which surface owns the editor; not blocking MVP)"; this plan adds the surface candidate (`/profile`) but does not yet build the editor. Add as a follow-up if the launch chapter requests it.

## 7. Risks & gotchas

- **Risk:** Surfacing the `MIN_ADMIN_INVARIANT_VIOLATED` error from the mutation hook → the dropdown needs to bubble the error up to the page-level parent so the banner renders OUTSIDE the dropdown. **Mitigation:** the dropdown takes an `onMinAdminError` callback; the parent (`/profile/page.tsx`'s client wrapper, or `/admin/users/page.tsx`) catches it and renders the banner.
- **Risk:** Demoting another Admin must surface a single-step confirm per the PRD-008 §6 UX rule. **Mitigation:** when the target user's current role is `Admin` AND the new role would be lower, open a `<ConfirmDialog>` first; on confirm, fire the mutation.
- **Risk:** The role chip clicking opens a menu — on small viewports this may overflow. **Mitigation:** use shadcn `<DropdownMenu>` which handles viewport collision.
- **Risk:** Session role caching — after a self-demote, the session payload's `role` field may be stale until the next session refresh. **Mitigation:** invalidate the session query post-mutation; if Better Auth's session is JWT-backed, force a session refresh via the SDK.

## 8. Resume points

- After Step 1: MinAdminErrorBanner exists.
- After Step 2: RoleChangeDropdown exists.
- After Step 3: UserListTable exists.
- After Step 4: RoleChangeHistoryTable exists.
- After Step 5: `/profile` route works.
- After Step 6: `/admin/users` + `/admin/users/<id>` work; PLAN-011's shell is replaced.
- After Step 7: nav exposes profile.
- After Step 8: committed.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Should the role chip in the Admin Users list show different colors per role (e.g., Admin = red, Moderator = amber)? Lean: **yes, low-cost** — semantic colors improve scannability. | Add Tailwind classes in the chip; revisit colors with the launch chapter post-launch. |
| Q-PLN-02 | After a self-demotion from Admin → Alumni, does the user immediately lose access to `/admin/*`? The session's role field needs to refresh. Lean: **force a session refresh post-mutation** (call `auth.api.getSession({ headers, fresh: true })` or equivalent). | Implement; integration test verifies redirect after self-demote. |
| Q-PLN-03 | "Promote another user to Admin first →" link goes to `/admin/users` — but the banner is rendered on `/profile` where the user is in the act of self-demoting. After they grant Admin to user B, the link should bring them back to `/profile`. Lean: **append `?returnTo=/profile` to the link** + handle the return on `/admin/users` after a successful grant. | Implement the round-trip pattern. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft from plan-decomposition pass. 8 steps to land all PRD-008 UI surfaces — profile self-service dropdown, Admin Users list with role chips + grant menu, role-change history per user, MinAdminErrorBanner with contextual link, and the `/profile` route. Replaces PLAN-011's `/admin/users` shell. Paired with VALIDATION-012. |
