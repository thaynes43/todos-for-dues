# Prompt for Claude Code agent — Execute PLAN-012 (Role management UI)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). **Current state:** PLAN-001..011 are committed, green, and **deployed** at `https://todos-for-dues.haynesops.com`. PLAN-011 just landed the `/admin/*` route tree (Dashboard / Disputes drill-in + resolve / Settings save-on-blur / Audit log / Users **shell**); PLAN-012 builds the role-management UI surfaces PRD-008 describes — self-service Active ↔ Alumni round-trip on a new `/profile` route, Admin Users list at `/admin/users` (**replacing PLAN-011's shell**), per-user role-change history, and the load-bearing `<MinAdminErrorBanner>` that surfaces the deferred-CHECK trigger error from PRD-008 R-06 with a contextual "Promote another user to Admin first" link.

The project is on **PR-flow + release-please**: `main` is branch-protected, every code change lands via PR after CI green (`lint-and-typecheck` + `test`), conventional commit prefixes drive release-please SemVer bumps, and merging a release PR creates the next `vX.Y.Z` tag.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/012-role-management-ui.md` end-to-end (Steps 1 → 8), then verify against `docs/plans/012-role-management-ui-validation.md` §6 pass/fail gates. You produce:

- **Four new React components** under `apps/web/components/`: `MinAdminErrorBanner`, `RoleChangeDropdown`, `UserListTable`, `RoleChangeHistoryTable`.
- **Three new routes:** `apps/web/app/profile/page.tsx` (server component + `'use client'` island for the dropdown's mutation error-handling), `apps/web/app/admin/users/[userId]/page.tsx` (per-user role-history detail under the existing Admin layout). The third "new" route is the **rewrite** of `apps/web/app/admin/users/page.tsx` — replace PLAN-011's `<div>Users list — implemented in PLAN-012</div>` placeholder with `<UserListTable />`.
- **One extension to `apps/web/components/RoleAwareNav.tsx`** — add a "Profile" link visible to every authenticated user.
- **Four Vitest component tests** under `apps/web/__tests__/components/` (per VALIDATION-012 §4): `MinAdminErrorBanner`, `RoleChangeDropdown`, `UserListTable`, `RoleChangeHistoryTable`.
- **Seven Playwright specs** under `apps/web/e2e/roles/` (per VALIDATION-012 §5): `self-service`, `admin-grant`, `admin-demote-admin`, `last-admin-blocked`, `admin-swap`, `admin-users-list`, `role-history`.
- **No backend changes** — `users.changeRole`, `users.grantRole`, `users.list`, `users.getRoleHistory` all exist and are integration-tested from PLAN-005. The min-Admin invariant trigger lives in DB layer (PRD-008 R-06, migration `0003_min_admin_trigger.sql`) and `transitionRole` maps the trigger error to `MIN_ADMIN_INVARIANT_VIOLATED`. If a missing field projection in `users.getById` blocks Step 6, **flag it** before extending — projection extension is allowed if narrow (same pattern as PLAN-010 `jobs.getById` / PLAN-011 `admin.listDisputed`), but verify first that the field isn't already present.
- **One feature PR** with conventional-commit title `feat(web): role management UI — profile self-service / Admin Users list / role history / min-Admin error per PRD-008 + DESIGN-006`. **No direct push to `main`** — branch protection rejects it.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Honour every feedback memory (ask-don't-invent, brief responses, doc conventions).
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root project context. **`## Pull-request flow (NORMATIVE)`** + **`## Release versioning (release-please)`** sections are load-bearing. `feat:` prefix triggers a minor bump on the next release PR.
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — "This is NOT the Next.js you know." Every App Router page (`/profile`, the rewritten `/admin/users`, the new `/admin/users/[userId]`) is a server component with `'use client'` islands only where needed (the mutation hooks, the menu state, the confirm dialog for Admin-demotes-Admin). **Read `node_modules/next/dist/docs/` for the App Router data-fetching idiom** PLAN-006/010/011 already established.
4. `docs/plans/012-role-management-ui.md` — the plan. §3 Outputs, §4 Steps 1–8, §5 Verification, §7 Risks (the `onMinAdminError` callback bubble, the Admin-demotes-Admin confirm dialog, the session-role staleness after self-demote), §9 Q-PLN-NN (resolved leans, especially Q-PLN-03's `?returnTo=` round-trip).
5. `docs/plans/012-role-management-ui-validation.md` — gates, the 7-spec Playwright list, the 4 Vitest tests, the coverage matrix mapping every PRD-008 AC.
6. `docs/prds/008-role-management.md` §5 R-01..R-10 + §5.1 AC-01..AC-11 + **§5.2 example wording** for the MinAdminErrorBanner (use it verbatim) + §6 UX rules (self-service dropdown filtered to never show privileged options; role-change history read-only; Admin demotion of another Admin requires a single-step confirm; **no bulk role grants**).
7. `docs/designs/006-ui-components.md` §3 (component list — `RoleChangeDropdown`, `UserListTable`, `MinAdminErrorBanner`) + §4.3 (`MinAdminErrorBanner` sketch).
8. `docs/adrs/011-role-partition-in-better-auth.md` §Decision-outcome — the role enum + the **`isPrivileged()` partition helper** the dropdown filters on. The dropdown NEVER shows Mod/Admin as targets, only as `(current)` no-op entries.
9. `docs/designs/002-fsm-module.md` §4.3 — the `MinAdminInvariantError` shape (`code: 'MIN_ADMIN_INVARIANT_VIOLATED'`). The client branches on this code; the typed error already flows through tRPC's error formatter.
10. `docs/designs/003-trpc-api-surface.md` §4.5 (users router: `users.changeRole`, `users.grantRole`, `users.list`, `users.getRoleHistory`) — the procedures this UI calls. **Read the input schemas + return shapes + error codes** before writing the calling components.
11. **PLAN-011's `/admin/layout.tsx`** at `apps/web/app/admin/layout.tsx` — the Admin role gate you inherit. Don't duplicate it; just place the two new admin pages under it.
12. **Existing component idioms to mirror:** `apps/web/components/{JobDetailView,ResolveDisputeModal,SettingsForm,DisputeCardList,RejectModal,CancelJobModal,DisputeJobModal,RoleAwareNav,JobStateBadge}.tsx` — the team's prop shape, mutation+toast pattern, server-side role-gate redirect pattern, confirm-dialog pattern (mirror `ResolveDisputeModal`'s nested-dialog approach for the Admin-demotes-Admin confirm).
13. **Existing e2e helpers** from PLAN-010 (`apps/web/e2e/mvp/support.ts`) and PLAN-011 (`apps/web/e2e/admin/support.ts`). Your role specs need similar persona-seeding + `signInAs(role, suffix)` patterns. **Last-Admin specs need careful test isolation** — see Trap 6 below.

**What's already in the repo you can rely on:**
- `lib/trpc-client.ts` — the React Query / tRPC client. Components do `trpc.users.X.useMutation()` / `.useQuery()`.
- `lib/formatters.ts` — `stateDisplayName` + `formatChapterLocal`.
- shadcn/ui primitives — `Dialog`, `DropdownMenu`, `Button`, `Toast`. Reuse them — especially `<DropdownMenu>` for the role-chip click-to-grant menu in `UserListTable` (handles viewport collision per PLAN-012 §7 risk).
- `packages/auth` — `getServerSession()` + `getSessionRole(userId)` server-side helpers. The `/profile` page uses these for redirect-if-unauthenticated.
- The `MinAdminInvariantError` shape ships from `@app/domain`; tRPC's error formatter exposes it as `err.data?.code === 'MIN_ADMIN_INVARIANT_VIOLATED'` on the client.

## What you do NOT do

- **Do not push directly to `main`** — branch protection rejects it. Open a PR; wait for CI green; the user merges.
- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans, DDD). If a design ambiguity blocks a step, **escalate to the user** — do not improvise.
- Do not modify `packages/db/` or `packages/domain/` source. The min-Admin trigger + `transitionRole` are immutable here.
- Do not modify existing tRPC procedure bodies in `packages/api/` EXCEPT if `users.getById` needs a small projection extension for the per-user detail page (Step 6) — verify the existing return shape first. **No FSM writes added; SELECT-only projections only.**
- Do not add Playwright to CI — that's PLAN-013's scope. Your Playwright specs run LOCALLY only.
- Do not bypass branch protection with `gh pr merge --admin` or `--no-verify`. `enforce_admins: false` is the coordinator's break-glass.
- Do not implement self-service display-name editing — PRD-003 R-10 says "Display name is editable post-signup (TBD which surface owns the editor; not blocking MVP)"; PLAN-012 §6 leaves this as an explicit follow-up. The `/profile` page **displays** the display name; it does NOT edit it.
- Do not add per-user last-active timestamp (PRD-008 Q-03 lean defer), bulk role grants (§7.1 non-goal), time-limited role grants (§7.1 non-goal), or Workspace group sync (§7.1 non-goal).
- Do not ever show Moderator or Admin as a **target** in the self-service dropdown. The only privileged option ever rendered is `<currentRole> (current)` (no-op). Per PRD-008 §6 UX rule + AC-09.
- Do not commit until all PLAN-012 §5 + VALIDATION-012 §6 gates are green locally.
- Do not change the test DB engine — PG16 via testcontainers per ADR-004.

## Specific traps to watch for

**Trap 1 — `pageerror` listener in every new spec.**
PLAN-011 closed VALIDATION-010's deviation by installing `installPageerrorListener` in every admin spec. Carry that forward — every spec under `e2e/roles/` MUST install the listener. Lift into `e2e/roles/support.ts` and call it once in `beforeEach`. Mirror the PLAN-011 helper at `apps/web/e2e/admin/support.ts`.

**Trap 2 — Self-service dropdown filter is AC-load-bearing.**
PRD-008 §6 UX rule + AC-09 / AC-10 specify the dropdown options exactly:
- Active viewer: `Active (current)` + `Alumni`.
- Alumni viewer: `Active` + `Alumni (current)`.
- Moderator viewer: `Active` + `Alumni` + `Moderator (current)`.
- Admin viewer: `Active` + `Alumni` + `Admin (current)`.

**Never** include Moderator or Admin as a non-current target — even the act of rendering them in the menu is forbidden per PRD-008 §6 ("Self-service role dropdown is filtered to never show privileged options"). Write the option list as a pure function of `currentRole` that returns exactly the above. The unit test should assert every viewer case explicitly.

The `(current)` entry is rendered but selecting it is a no-op (doesn't fire the mutation). The page-level wrapper should disable or otherwise gracefully handle re-selection of the current role.

**Trap 3 — `MIN_ADMIN_INVARIANT_VIOLATED` error must bubble from the dropdown to the page-level parent.**
The banner is rendered by the parent, NOT by the dropdown itself. The dropdown takes an `onMinAdminError?: () => void` callback prop. On mutation error: if `err.data?.code === 'MIN_ADMIN_INVARIANT_VIOLATED'`, call `onMinAdminError()` (parent shows banner) AND return early (don't surface as an inline error). Other errors fall through to inline rendering.

Page-level pattern on `/profile`:
```tsx
'use client';
function ProfileBody({ session }: { session: Session }) {
  const [minAdminError, setMinAdminError] = useState(false);
  return (
    <>
      {minAdminError && <MinAdminErrorBanner canPromote={session.user.role === 'Admin'} />}
      <RoleChangeDropdown
        currentRole={session.user.role}
        onMinAdminError={() => setMinAdminError(true)}
      />
    </>
  );
}
```

**Trap 4 — `MinAdminErrorBanner` wording must match PRD-008 §5.2 verbatim.**
DESIGN-006 §4.3 has the component sketch; PRD-008 §5.2 has the example wording. Use the wording exactly. The contextual "Promote another user to Admin first →" link is shown **only when `canPromote` is true** — typically when the viewing user is an Admin (sole Admin → atomic-swap recovery flow). For non-Admin viewers (e.g., a Moderator viewing a stale page), the banner shows the error text without the link.

The link's `href` is `/admin/users?returnTo=/profile` per PLAN-012 Q-PLN-03 — the receiving page reads `returnTo` and after a successful grant brings the user back. Implement this round-trip; the `admin-swap.spec.ts` Playwright spec validates it end-to-end.

**Trap 5 — Admin demoting another Admin requires a confirm dialog.**
PRD-008 §6 UX rule: "Role changes are immediate (no email confirmation, no 'are you sure' modal except for Admin demotion of another Admin)." So in `UserListTable`'s role-chip menu: when the viewer selects a non-Admin target FOR a row whose current role is Admin, open a `<Dialog>` first with "Demote {displayName} from Admin to {newRole}? They will lose access to /admin/* immediately." Confirm → fire mutation. Cancel → close dialog, no mutation.

Mirror `ResolveDisputeModal.tsx`'s nested-dialog approach if useful.

**Trap 6 — Last-Admin spec isolation is FRAGILE.**
The `last-admin-blocked.spec.ts` and `admin-swap.spec.ts` specs require EXACTLY one Admin in the chapter at the start. If a previous spec leaks an additional Admin, the trigger never fires and the spec fails silently (the demote succeeds where it should have been blocked).

Per VALIDATION-012 §7: **truncate + reseed in `test.beforeEach` to guarantee EXACTLY one Admin.** The truncation pattern: `DELETE FROM users WHERE chapter_id = ? AND id != ?` for the one Admin you want to keep; OR run the truncation in a transaction. Test in isolation FIRST, then under `--workers=1` for the full suite.

Mid-test interrupts can leak state — re-truncate + re-run if you suspect contamination.

**Trap 7 — Session role staleness after self-demote.**
Per PLAN-012 Q-PLN-02: after a successful self-demote (Admin → Alumni), the session's `role` field is stale until the next session refresh. Better Auth's session is JWT-backed in this app; you must force a refresh post-mutation.

The pattern: on `users.changeRole` success in the `/profile` flow, call `authClient.getSession({ fresh: true })` (or `router.refresh()` for App Router) to force the server to re-read the role and update the cookie. Without this, the user remains "Admin" client-side until they sign out and back in — and they'd retain visual access to `/admin/*` until the next page load.

Verify by adding an assertion in `self-service.spec.ts` that the role chip in `RoleAwareNav` updates immediately after the dropdown selection.

**Trap 8 — `?returnTo=` round-trip on `/admin/users`.**
Per PLAN-012 Q-PLN-03: the `MinAdminErrorBanner`'s link is `/admin/users?returnTo=/profile`. The receiving `/admin/users` page reads `searchParams.returnTo` (validate it's an internal path — starts with `/` and no `//` or `://`). After a successful `users.grantRole` mutation in `UserListTable`, if `returnTo` is present, navigate to it (`router.push(returnTo)`).

Implement carefully — naively passing `returnTo` as user input is an open-redirect vulnerability. Whitelist or strip in the receiving page: `if (!returnTo?.startsWith('/') || returnTo.startsWith('//') || returnTo.includes('://')) returnTo = '/profile';` (or omit the navigation).

**Trap 9 — `/admin/users/[userId]` uses PLAN-011's Admin gate.**
Don't add a per-page role gate — the parent `/admin/layout.tsx` already redirects non-Admin. The page is a server component that:
1. Reads `params.userId`.
2. Fetches the target user via `trpc.users.getById({ userId })`.
3. Renders the user's display name + email + current role + `<RoleChangeHistoryTable userId={params.userId} />`.

If `users.getById` doesn't currently project the full user shape (it may not — it's an authedProcedure, projection rules may differ from `jobs.getById`), verify before extending. Same projection-extension rules as PLAN-010/011: SELECT-only, narrow change, +1 integration test if added.

**Trap 10 — `RoleChangeHistoryTable` timestamp format.**
Mirror PLAN-011's `AuditLogTable.tsx` pattern verbatim:
```tsx
<time dateTime={transition.createdAt.toISOString()} title={transition.createdAt.toISOString()}>
  {formatChapterLocal(transition.createdAt)}
</time>
```
Sort: chronological **descending** (newest first) per PLAN-012 §4 Step 4 ("chronological-descending"). Note this is the OPPOSITE direction from `AuditLogTable` for jobs (which is oldest-first — "story of this job"). Role history reads more naturally newest-first (per AC-11 + PLAN-012 §4 Step 4).

**Trap 11 — Conventional-commit message + PR title for release-please.**
PLAN-012 §3 specifies `feat(web): role management UI — profile self-service / Admin Users list / role history / min-Admin error per PRD-008 + DESIGN-006`. `feat:` is load-bearing — release-please will bump minor on the next release PR. PR **title** is what release-please reads on squash-merge.

**Trap 12 — Cross-plan invariants (the ones you must not break).**
After your work:
- `pnpm --filter @app/domain test no-direct-state-writes` MUST still exit 0; **IGNORE_DIRS unchanged**.
- `pnpm --filter @app/api test` MUST still exit 0 (≥116 tests; +1 if `users.getById` projection extension added).
- `pnpm --filter web e2e -- e2e/walking-skeleton/` MUST still pass (PLAN-006).
- `pnpm --filter web e2e -- --grep walking-skeleton.spec.ts` MUST still pass (PLAN-008 chained, 5× no-flake).
- `pnpm --filter web e2e -- --grep sso.spec.ts` (or `__e2e__/auth/` — verify path) MUST still pass (PLAN-008 SSO).
- `pnpm --filter web e2e -- e2e/mvp/` MUST still pass (PLAN-010, 3× no-flake — note: VALIDATION-011 surfaced an isolated flake on `my-postings.spec.ts` under parallel-spec contention; if you see this, it's not your regression but flag in the report).
- `pnpm --filter web e2e -- e2e/admin/` MUST still pass (PLAN-011, 3× no-flake — your work touches `/admin/users` so re-verify the admin suite carefully).
- `pnpm --filter @app/notifications test` + `pnpm --filter @app/settings test` MUST still exit 0.
- `unset DATABASE_URL && pnpm --filter web build` MUST succeed (PLAN-002 lazy Proxy intact).
- `pnpm -r typecheck` MUST exit 0.

## PR-flow specifics

1. `git checkout -b plan-012-role-management-ui` (or a descriptive name) **branched off `main`** (not off another open PR's branch — that creates a tangled history; PLAN-011's coordinator-cycle PR mistake).
2. Commit your work in whatever shape makes sense locally — squash-merge will collapse them.
3. Run all gates locally (every Vitest suite + every Playwright spec 3× no-flake + `pnpm --filter web build` + `pnpm -r typecheck`).
4. `git push -u origin plan-012-role-management-ui`.
5. `gh pr create --base main --head plan-012-role-management-ui --title 'feat(web): role management UI — profile self-service / Admin Users list / role history / min-Admin error per PRD-008 + DESIGN-006' --body '<PR body with summary + test plan>'`.
6. Wait for CI green (`lint-and-typecheck` + `test`). Playwright is NOT in CI (PLAN-013 §3.1 backlog).
7. Report back with the PR URL + commit hash + cross-plan-invariant confirmations.

**Do not merge the PR yourself.** Leave it to the user.

## Definition of done

Every box in VALIDATION-012 §6 green:

- [ ] All Vitest component tests pass: `pnpm --filter web test` exit 0 (covers the 4 new component tests).
- [ ] All Playwright role specs pass: `pnpm --filter web e2e -- e2e/roles/` exit 0; run 3× no flake.
- [ ] **`pageerror` listener installed in every role spec.**
- [ ] DB state after `admin-swap.spec.ts` shows: two `user_role_transitions` rows (the promote + the demote); the trigger never fired (no 422 in the spec's network log between the two mutations).
- [ ] No `console.error` during Playwright runs.
- [ ] `pnpm --filter web build` exits 0 (no `DATABASE_URL` needed).
- [ ] `pnpm -r typecheck` exits 0.
- [ ] One PR opened with conventional-commit title (`feat(web): …`); body summarises changes + test plan.
- [ ] CI green on the PR (`lint-and-typecheck` + `test` pass).
- [ ] **Cross-plan invariants** ALL green locally — explicitly confirm each in your report.
- [ ] **`MinAdminErrorBanner` wording matches PRD-008 §5.2 verbatim.**
- [ ] **`/admin/users` shell from PLAN-011 is replaced** — the placeholder `<div>Users list — implemented in PLAN-012</div>` is gone; `<UserListTable />` lives there.
- [ ] **Self-service dropdown never offers Moderator or Admin as a target** (only as `(current)` no-op).
- [ ] **Session role refresh after self-demote** works (role chip in nav updates immediately; Active session can no longer see `/admin/*` per Q-PLN-02).
- [ ] **`?returnTo=` round-trip** is path-validated (open-redirect-safe).

Report back (under 350 words): PR URL, commit hash, any escalations, **whether you extended `users.getById` (with new field name if so)**, **how you handled session-role refresh** (Better Auth's pattern), **how the open-redirect validation is implemented for `?returnTo=`**, and **explicit confirmation of each cross-plan invariant** including PLAN-011's admin specs still green.

## If you get stuck

Escalate with: (1) which step, (2) exact error, (3) what you tried, (4) your lean. Do not invent product or architectural decisions. Do not modify any design or upstream plan.

Particular escalation candidates:
- The `MIN_ADMIN_INVARIANT_VIOLATED` error doesn't surface with `err.data?.code` (tRPC's error formatter may strip it) — read `packages/api/src/trpc.ts` to see the formatter; if the code is being dropped, that's a backend fix (small `fix(api):` commit on the same PR branch), not a UI workaround.
- The session refresh after self-demote doesn't work via Better Auth's SDK pattern you tried — flag the symptom; lean on `router.refresh()` as a fallback that re-runs the server component and re-reads the session.
- The `admin-swap.spec.ts` round-trip is flaky because the `?returnTo=` navigation races the mutation completion — use `await page.waitForResponse(/users\.grantRole/)` before asserting the `router.push` happened.
- The last-Admin reseed in `beforeEach` is slow (truncating all users every spec) — investigate whether scoping by `chapter_id` or by suffix is sufficient; do NOT skip the isolation.

Begin.
