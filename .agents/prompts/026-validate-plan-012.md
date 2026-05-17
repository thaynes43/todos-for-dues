# Prompt for Claude Code agent — Validate PLAN-012 (against VALIDATION-012)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright). PLAN-012 added the role-management UI: `/profile` self-service dropdown, `/admin/users` list (replacing PLAN-011's placeholder), `/admin/users/[userId]` role-change history, and the load-bearing `<MinAdminErrorBanner>` from PRD-008 R-06. Your job is the validation half — run every gate in `docs/plans/012-role-management-ui-validation.md` §6 + the cross-plan invariants and report.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute VALIDATION-012 §6 pass/fail gates + §4 unit tests + §5 Playwright specs against the PLAN-012 PR currently open on the branch. Run the gates, confirm each is green, and report. If a gate fails, you do **not** relax it — small mechanical fixes only, otherwise escalate.

The **cross-plan invariants** are non-negotiable:
1. PLAN-003's `no-direct-state-writes.test.ts` must still pass with no IGNORE_DIRS allowlist changes.
2. PLAN-005's @app/api integration tests (≥116; +1 if `users.getById` projection was extended) must still pass.
3. PLAN-006's 7 per-page walking-skeleton Playwright specs must still pass.
4. PLAN-007's notifications + settings tests must still pass.
5. PLAN-008's chained walking-skeleton + 4 SSO Playwright specs must still pass — 5x no-flake gate from VALIDATION-008 carries forward.
6. PLAN-010's 9 MVP specs under `e2e/mvp/` must still pass — 3x no-flake gate (note: VALIDATION-011 surfaced an isolated parallel-spec flake on `my-postings.spec.ts`; if it recurs in isolation under `--workers=1`, that's a real bug; if only under parallel, flag as a PLAN-010 retro item).
7. PLAN-011's 10 admin specs under `e2e/admin/` must still pass — 3x no-flake gate. **PLAN-012 explicitly replaces `/admin/users/page.tsx`** — verify PLAN-011's `users-shell.spec.ts` either still passes (if the agent updated it to assert against the new content) or has been retired in favour of PLAN-012's `admin-users-list.spec.ts`. If the agent silently broke the shell spec, escalate.
8. `unset DATABASE_URL && pnpm --filter web build` exits 0 (PLAN-002 lazy Proxy regression check).

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.**
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root context. **`## Pull-request flow (NORMATIVE)` section** is load-bearing: any fix is a new commit on the same branch + push + the PR auto-updates. Do NOT push directly to `main`.
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — Next.js 16 reminder, relevant when inspecting the 3 new server-component routes.
4. `docs/plans/012-role-management-ui-validation.md` — your gate list. §3 coverage matrix, §4 unit tests, §5 Playwright specs, §6 pass/fail gates, §7 resume notes (last-Admin spec isolation guidance).
5. `docs/plans/012-role-management-ui.md` §3 Outputs, §4 Steps, §5 Verification, §9 Q-PLN-NN (especially Q-PLN-02 session-refresh and Q-PLN-03 `?returnTo=` round-trip).
6. **The PLAN-012 PR on the current branch** — `git log -10 --oneline` + `gh pr view` to find it. Read the PR description — the execute agent should have flagged any `users.getById` projection extension, the session-refresh approach (Better Auth SDK vs. `router.refresh()`), and the `?returnTo=` open-redirect validation.
7. `docs/prds/008-role-management.md` §5 R-01..R-10 + §5.1 AC-01..AC-11 + **§5.2 example wording** for `MinAdminErrorBanner` (must match verbatim).
8. `docs/adrs/011-role-partition-in-better-auth.md` — the role enum + `isPrivileged()` invariant.

## What you do NOT do

- Do not modify any doc under `docs/` (plans, PRDs, ADRs, designs).
- Do not push directly to `main` — branch protection rejects it.
- Do not modify `packages/db/` or `packages/domain/` source. If a cross-plan invariant fails, the fix is in PLAN-012's modifications.
- Do not modify existing tRPC procedure bodies in `packages/api/` EXCEPT if the execute agent's `users.getById` projection extension has a bug — small `fix(api):` commit on the same PR branch.
- Do not relax a gate. Small mechanical fixes (missing import, off-by-one assertion, Playwright timeout that needs bumping for cold-start, modal-disable-state assertion that needs `.toBeDisabled()` instead of `.toHaveAttribute('disabled')`) are OK; anything bigger → **escalate**.
- Do not add any path to PLAN-003's `no-direct-state-writes.test.ts` IGNORE_DIRS allowlist.
- Do not skip flaky-test runs. If a Playwright spec fails 1 of 3, INVESTIGATE the flake source. **Common flake source unique to PLAN-012:** the `admin-swap.spec.ts` `?returnTo=` navigation racing the `users.grantRole` mutation completion — fix the spec with `await page.waitForResponse(/users\.grantRole/)`, not blind sleeps.
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not amend the PLAN-012 PR's commits. If an implementation fix is needed, push a NEW commit to the same branch — the PR auto-updates.
- Do not merge the PR yourself. The user merges.
- Do not skip the `bootstrap-admin.spec.ts` un-skip — it's `test.skip(true, …)` from PLAN-008 deviation and STAYS skipped.
- **Do not delete or `.skip` PLAN-011's `users-shell.spec.ts`** — it should either be updated to assert against the new `<UserListTable />` content, OR replaced by PLAN-012's `admin-users-list.spec.ts`. Verify by reading the file.

## Definition of done

Every box in VALIDATION-012 §6 green, verified by running the commands:

- [ ] **All Vitest component tests pass:** `pnpm --filter web test` exit 0. Confirm 4 new component tests under `apps/web/__tests__/components/`: `MinAdminErrorBanner`, `RoleChangeDropdown`, `UserListTable`, `RoleChangeHistoryTable`.
- [ ] **All role Playwright specs pass 3×:** `pnpm --filter web e2e -- e2e/roles/` exit 0; 3 times in a row; all 3 must pass. Capture pass/fail per run. Expected specs (per VALIDATION-012 §5):
  - `self-service.spec.ts`
  - `admin-grant.spec.ts`
  - `admin-demote-admin.spec.ts`
  - `last-admin-blocked.spec.ts`
  - `admin-swap.spec.ts`
  - `admin-users-list.spec.ts`
  - `role-history.spec.ts`
- [ ] **`pageerror` listener installed in every role spec** (carries PLAN-011's hygiene forward). Grep for `pageerror` or `installPageerrorListener` in `e2e/roles/`.
- [ ] **`pnpm --filter web build`** exits 0; the 3 new routes appear (`/profile`, `/admin/users/[userId]`); `/admin/users` rewritten (no placeholder).
- [ ] **`pnpm -r typecheck`** exits 0.
- [ ] **CI green on the PR:** `gh pr checks <PR-number>` shows `lint-and-typecheck` ✓ + `test` ✓.
- [ ] **PR title is `feat(web):`** — `gh pr view <PR-number> --json title` returns a title starting with `feat(web):` — release-please reads this on squash-merge.
- [ ] **Cross-plan invariants ALL green (run locally):**
  - `pnpm --filter @app/domain test no-direct-state-writes` exit 0; IGNORE_DIRS unchanged.
  - `pnpm --filter @app/api test` exit 0; integration count ≥ 116.
  - `pnpm --filter web e2e -- e2e/walking-skeleton/` exit 0; 7/7 PLAN-006.
  - `pnpm --filter web e2e -- --grep walking-skeleton.spec.ts` exit 0; 5× no-flake PLAN-008 chained.
  - `pnpm --filter web e2e -- --grep sso.spec.ts` (or `__e2e__/auth/`) exit 0; PLAN-008 SSO.
  - `pnpm --filter web e2e -- e2e/mvp/` exit 0; PLAN-010 9 specs; 3× no-flake. If `my-postings.spec.ts` flakes once under parallel-spec but passes in isolation, that's the PLAN-010 retro item — flag but do not block.
  - `pnpm --filter web e2e -- e2e/admin/` exit 0; PLAN-011 10 specs; 3× no-flake. **Especially `users-shell.spec.ts`** — must still pass against the new content.
  - `pnpm --filter @app/notifications test && pnpm --filter @app/settings test` exit 0.
  - `unset DATABASE_URL && pnpm --filter web build` exit 0.
- [ ] **DB-state assertions:**
  - After `self-service.spec.ts`: one new `user_role_transitions` row with `initiatorKind = 'self'`.
  - After `admin-grant.spec.ts`: one new `user_role_transitions` row with `initiatorKind = 'admin'` and the Admin's `initiatorId`.
  - After `admin-swap.spec.ts`: TWO new `user_role_transitions` rows (the promote, then the demote); the deferred-CHECK trigger never fired (no 422 between them in the network log).
  - After `last-admin-blocked.spec.ts`: NO new `user_role_transitions` row; the 422 surfaced and the role remains Admin.
- [ ] **`MinAdminErrorBanner` wording matches PRD-008 §5.2 verbatim.** Open `apps/web/components/MinAdminErrorBanner.tsx`; compare to the PRD §5.2 example. Confirm verbatim.
- [ ] **Self-service dropdown filter respects PRD-008 §6 + AC-09 / AC-10:**
  - Active: only `Active (current)` + `Alumni`.
  - Alumni: only `Active` + `Alumni (current)`.
  - Moderator: only `Active` + `Alumni` + `Moderator (current)`.
  - Admin: only `Active` + `Alumni` + `Admin (current)`.
  - **NEVER include Moderator or Admin as a non-current target.** Open `RoleChangeDropdown.test.tsx`; verify every case is asserted.
- [ ] **PLAN-011 `/admin/users` shell replaced:** open `apps/web/app/admin/users/page.tsx`; the `<div>Users list — implemented in PLAN-012</div>` placeholder must be gone, replaced by `<UserListTable />`.
- [ ] **`?returnTo=` open-redirect validation:** open `apps/web/app/admin/users/page.tsx` (or wherever the redirect target is read); confirm the value is validated against `^/[^/]` (starts with `/` but not `//`, no `://`). If the validation is missing, this is a security bug — escalate or fix with a small `fix(web): validate returnTo` commit.
- [ ] **Session role refresh after self-demote:** open `apps/web/app/profile/page.tsx` (or its client island); the success handler of `users.changeRole` must call `router.refresh()` OR `authClient.getSession({ fresh: true })` (or equivalent). Verify the `self-service.spec.ts` asserts the nav role chip updates immediately, not on next navigation.
- [ ] **Admin-demotes-Admin confirm dialog:** open `UserListTable.test.tsx`; confirm the spec covers (a) demoting an Admin opens a confirm dialog, (b) demoting a non-Admin does NOT open one, (c) cancel closes without firing the mutation.
- [ ] **`RoleChangeHistoryTable` is descending:** open `RoleChangeHistoryTable.tsx`; the sort order is newest-first (opposite of `AuditLogTable` for jobs). Confirm in the test.
- [ ] **Branch-protection cross-check:** the execute agent's commits all landed on the feature branch (not main). Verify via `gh pr view <N> --json commits`. `git log --first-parent main --oneline -5` shows no direct push from PLAN-012.

Report back (under 350 words): which gates passed, any implementation fixes you made (with new commit hash on the SAME PR branch — never directly to main), anything escalated, **and explicit confirmation that (1) PLAN-003 static check still passes, (2) PLAN-005 integration ≥116, (3) PLAN-006 per-page Playwright still pass, (4) PLAN-007 notifications + settings still pass, (5) PLAN-008 chained walking-skeleton + 4 SSO specs still pass, (6) PLAN-010 MVP specs still pass (or the `my-postings` flake recurred under parallel — flag), (7) PLAN-011 admin specs still pass — ESPECIALLY `users-shell.spec.ts` against the new content, (8) `MinAdminErrorBanner` wording matches PRD-008 §5.2 verbatim, (9) self-service dropdown filter is correct for all 4 viewer roles, (10) `?returnTo=` open-redirect validation present, (11) session refresh after self-demote works, (12) the 7 role Playwright specs all passed 3× without flake, (13) `pageerror` listener in every role spec**.

## Specific things to look hard at

1. **PR title prefix is critical for release-please.** A `chore:` title would skip the minor bump. Check + edit if wrong.

2. **The 7 Playwright specs are NOT in CI.** 3×-no-flake is LOCAL only.

3. **`admin-swap.spec.ts` is the load-bearing flow.** This spec exercises the full recovery: last-Admin attempts self-demote → banner appears → clicks contextual link → lands on `/admin/users?returnTo=/profile` → grants Admin to user B → returns to `/profile` → demotes successfully. If any segment is brittle, the spec catches it. Verify the spec actually navigates back via the `?returnTo=` flow (not by hardcoded `page.goto('/profile')`).

4. **Last-Admin spec isolation.** Per VALIDATION-012 §7: each spec MUST start with EXACTLY one Admin. If the suite passes 3× under `--workers=1` but fails under `--workers > 1`, that's a real isolation bug worth flagging — even if the prompt asked for `--workers=1`. The spec should be parallel-safe via per-spec UUID-suffixed chapters or strict scoped truncation.

5. **`MIN_ADMIN_INVARIANT_VIOLATED` error code visibility.** Open `packages/api/src/trpc.ts` (the error formatter); verify `err.data.code` is exposed on the client. If the formatter strips `code`, the dropdown's branching breaks silently and the banner never shows. Read the formatter; if `data.code` is in the output shape, good.

6. **Better Auth session-role refresh.** This is the trickiest correctness item. After self-demote, the JWT cookie still says Admin until a fresh issuance. Two correct paths:
   - **(a) `router.refresh()`** — App Router re-runs server components; the layout reads `getServerSession` fresh from the DB.
   - **(b) `authClient.getSession({ fresh: true })`** — Better Auth forces re-issuance.
   Either works. Verify `self-service.spec.ts` asserts the role chip updates IMMEDIATELY (within ~1s), not on next nav. If the chip is stale, the agent didn't implement refresh.

7. **`?returnTo=` open-redirect.** Inspect the receiving page. Whitelist pattern: `returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes('://')`. If missing or weaker (e.g., only checks `startsWith('/')`), it's vulnerable to `//evil.com` which the browser treats as protocol-relative. Fix with a small `fix(web):` commit.

8. **`/admin/users/[userId]` page reuses the layout role gate.** Open the file; confirm there's no duplicated role check (parent `/admin/layout.tsx` already redirects non-Admin). Duplicate gates aren't broken, but they're noisy and create drift risk.

9. **release-please open PR is unrelated.** Release PRs (`chore(main): release v0.x.y`) by the bot are unrelated. Leave them.

## If a gate fails

1. **Mechanical fix (allowed; push to PR branch):** missing import, wrong prop, off-by-one assertion, Playwright timeout bump for cold-start, `?returnTo=` validation tightening. Fix, commit (`fix(web):` or `fix(api):`), push (PR auto-updates), wait for CI.
2. **Cross-plan invariant regression (FIX in PLAN-012 code):** if PLAN-011's admin specs fail because of the `/admin/users` rewrite, the fix is in PLAN-012's rewrite — update `users-shell.spec.ts` to assert against the new content OR retire it in favour of `admin-users-list.spec.ts`. Either is acceptable; do NOT delete the spec without a replacement.
3. **PLAN-005/006/007/008/010/011 regression (FIX, do not skip):** if any prior suite fails, the fix is in PLAN-012's modifications. Do NOT `.skip` the regressing test.
4. **Flake on a Playwright spec (INVESTIGATE):** common: the `admin-swap.spec.ts` race; last-Admin isolation; session-refresh timing.
5. **Test reveals an upstream design problem (escalate):** do not edit the design — surface to the user.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Begin.
