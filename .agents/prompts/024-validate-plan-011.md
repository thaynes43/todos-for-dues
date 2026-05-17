# Prompt for Claude Code agent — Validate PLAN-011 (against VALIDATION-011)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright). PLAN-011 added the `/admin/*` route tree (Admin layout shell, Dashboard, Disputes drill-in + resolve, Settings save-on-blur, Audit log, Users shell). Your job is the validation half — run every gate in `docs/plans/011-admin-view-ui-validation.md` §6 + the cross-plan invariants and report.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute VALIDATION-011 §6 pass/fail gates + §4 unit tests + §5 Playwright specs against the PLAN-011 PR currently open on the branch. Run the gates, confirm each is green, and report. If a gate fails, you do **not** relax it — small mechanical fixes only, otherwise escalate.

The **cross-plan invariants** are non-negotiable:
1. PLAN-003's `no-direct-state-writes.test.ts` must still pass with no IGNORE_DIRS allowlist changes.
2. PLAN-005's @app/api integration tests (≥115; possibly +1-2 if `admin.listDisputed` projection was extended) must still pass.
3. PLAN-006's 7 per-page walking-skeleton Playwright specs must still pass.
4. PLAN-007's notifications + settings tests must still pass.
5. PLAN-008's chained walking-skeleton + 4 SSO Playwright specs must still pass — 5x no-flake gate from VALIDATION-008 carries forward.
6. PLAN-010's 9 MVP specs under `e2e/mvp/` must still pass — 3x no-flake gate from VALIDATION-010 carries forward.
7. `unset DATABASE_URL && pnpm --filter web build` exits 0 (PLAN-002 lazy Proxy regression check).

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.**
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root context. **`## Pull-request flow (NORMATIVE)` section** is load-bearing: any fix is a new commit on the same branch + push + the PR auto-updates. Do NOT push directly to `main` (rejected by protection anyway).
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — Next.js 16 reminder, relevant when inspecting the 6 new server-component routes.
4. `docs/plans/011-admin-view-ui-validation.md` — your gate list. §3 coverage matrix (every AC → component → test), §4 unit tests, §5 Playwright specs, §6 pass/fail gates.
5. `docs/plans/011-admin-view-ui.md` §3 Outputs, §4 Steps, §5 Verification, §9 Q-PLN-NN (combined `<JobDetailView>` + `<AuditLogTable>` on `/admin/jobs/<id>`; helper-text under each settings field; defer "longest-stalled" stat).
6. **The PLAN-011 PR on the current branch** — `git log -10 --oneline` + `gh pr view` to find it. Read the PR description — the execute agent should have flagged any `admin.listDisputed` projection extension, the `/jobs?state=` query-param extension, and the `pageerror`-listener installation.
7. `docs/designs/006-ui-components.md` §3 (the route tree) + §4.3 (`AggregateCountsCards`, `AuditLogTable`, `SettingsForm` sketches) + §4.7 (chapter-local timestamp format).

## What you do NOT do

- Do not modify any doc under `docs/` (plans, PRDs, ADRs, designs).
- Do not push directly to `main` — branch protection rejects it.
- Do not modify `packages/db/` or `packages/domain/` source. If a cross-plan invariant fails, the fix is in PLAN-011's modifications, not in the invariant test.
- Do not modify existing tRPC procedure bodies in `packages/api/` EXCEPT if the execute agent's `admin.listDisputed` projection extension has a bug — small `fix(api):` commit on the same PR branch.
- Do not relax a gate. Small mechanical fixes (missing import, off-by-one assertion, Playwright timeout that needs bumping for cold-start, modal-disable-state assertion that needs `.toBeDisabled()` instead of `.toHaveAttribute('disabled')`) are OK; anything bigger → **escalate**.
- Do not add any path to PLAN-003's `no-direct-state-writes.test.ts` IGNORE_DIRS allowlist.
- Do not skip flaky-test runs. If a Playwright spec fails 1 of 3, INVESTIGATE the flake source — do not "just run it again." Common flake sources: `SettingsForm`'s 200ms blur-debounce racing the spec's next assertion; the disputes badge's count fetch lagging behind a just-completed mutation; the `AuditLogTable` query returning before the resolve transition committed.
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not amend the PLAN-011 PR's commits. If an implementation fix is needed, push a NEW commit to the same branch — the PR auto-updates.
- Do not merge the PR yourself. The user merges.
- Do not skip the `bootstrap-admin.spec.ts` un-skip — it's `test.skip(true, …)` from PLAN-008 deviation and STAYS skipped unless the execute agent un-skipped it (which they shouldn't have).

## Definition of done

Every box in VALIDATION-011 §6 green, verified by running the commands:

- [ ] **All Vitest component tests pass:** `pnpm --filter web test` exit 0. Confirm 6 new component tests under `apps/web/__tests__/components/` are present per VALIDATION-011 §4: `AdminLayout`, `AggregateCountsCards`, `DisputeCardList`, `ResolveDisputeModal`, `SettingsForm`, `AuditLogTable`.
- [ ] **All admin Playwright specs pass 3×:** `pnpm --filter web e2e -- e2e/admin/` exit 0; 3 times in a row; all 3 must pass. Capture pass/fail per run. Expected specs (per VALIDATION-011 §5):
  - `layout-shell.spec.ts`
  - `dashboard.spec.ts`
  - `disputes-list.spec.ts`
  - `dispute-resolve-closed.spec.ts`
  - `dispute-resolve-cancelled.spec.ts`
  - `dispute-resolve-false-alarm.spec.ts`
  - `audit-log.spec.ts`
  - `audit-log-search.spec.ts`
  - `settings-save.spec.ts`
  - `users-shell.spec.ts`
- [ ] **`pageerror` listener installed in every admin spec** (the VALIDATION-010 deviation must NOT repeat — instructed in 023-execute-plan-011.md Trap 1). Grep for `pageerror` in `e2e/admin/`; expect every spec or a shared `beforeEach` to install it. If missing, surface as a deviation (not a blocker unless dev-server logs are noisy).
- [ ] **`pnpm --filter web build`** exits 0; the new `/admin/*` routes appear in the route table; build succeeds with `DATABASE_URL` unset.
- [ ] **`pnpm -r typecheck`** exits 0.
- [ ] **CI green on the PR:** `gh pr checks <PR-number>` shows `lint-and-typecheck` ✓ + `test` ✓. The `build-image` job is dormant.
- [ ] **PR title is conventional-commit-prefixed correctly:** `gh pr view <PR-number> --json title` returns a title starting with `feat(web):` — release-please reads this on squash-merge. If the title is `chore:` / `refactor:`, **escalate** (or fix via `gh pr edit <N> --title '…'` if you have write access).
- [ ] **Cross-plan invariants ALL green (run locally):**
  - `pnpm --filter @app/domain test no-direct-state-writes` exit 0; `grep -A3 IGNORE_DIRS packages/domain/__tests__/no-direct-state-writes.test.ts` shows the same allowlist as before PLAN-011.
  - `pnpm --filter @app/api test` exit 0; integration count ≥ 115 (or higher if `admin.listDisputed` projection extension added tests).
  - `pnpm --filter web e2e -- e2e/walking-skeleton/` exit 0; 7/7 PLAN-006 per-page specs pass.
  - `pnpm --filter web e2e -- --grep walking-skeleton.spec.ts` exit 0; PLAN-008's chained spec passes. Run 5× in a row (VALIDATION-008's invariant; carries forward).
  - `pnpm --filter web e2e -- --grep sso.spec.ts` exit 0 (or no-op if absent).
  - `pnpm --filter web e2e -- e2e/mvp/` exit 0; PLAN-010's 9 specs pass. 3x in a row, no flake.
  - `pnpm --filter @app/notifications test && pnpm --filter @app/settings test` exit 0.
  - `unset DATABASE_URL && pnpm --filter web build` exit 0.
- [ ] **DB-state assertions after dispute-resolve specs:** after running `dispute-resolve-closed.spec.ts`, `dispute-resolve-cancelled.spec.ts`, `dispute-resolve-false-alarm.spec.ts`, the DB shows the expected `job_state_transitions` rows: `disputed → closed` with the resolution note for the closed spec; `disputed → cancelled` for the cancelled spec; `disputed → payment_sent` for the false-alarm spec. Each row should have `actorId = <admin user>` and a non-empty `note`.
- [ ] **DB-state assertion after settings-save spec:** the `chapter_settings` row for `treasurer_recipient_email` shows the updated value AND `updatedBy = <admin user uuid>` AND `updatedAt` ≈ now.
- [ ] **`admin.listDisputed` projection extension** (if added): the new `disputedAt` field (or however the agent named it) is sourced from `job_state_transitions` (the latest `to_state: disputed` `created_at`), not from `jobs.updated_at` or another column. Spot-check the SELECT.
- [ ] **`/jobs?state=<state>` query-param extension** (if added): `apps/web/app/jobs/page.tsx` reads `searchParams.state`, validates against `JOB_STATES`, passes to the role-aware list procedure. Open the file; confirm the projection is correct.
- [ ] **AuditLogTable timestamp format:** open one of the rendered rows in `audit-log.spec.ts`'s assertions; the `<time datetime>` attribute carries the raw UTC ISO; the visible text is the chapter-local format. Both must be present.
- [ ] **AdminLayout role-gate is server-side:** open `apps/web/app/admin/layout.tsx`; the redirect should be at the top of the component, before any tRPC call. If the gate is `useEffect`-based, surface as a deviation (data leaks on slow networks).
- [ ] **`/admin/users/page.tsx` is a placeholder shell:** the body should be a brief `<div>Users list — implemented in PLAN-012</div>` or equivalent. NOT a real list — that's PLAN-012's scope.
- [ ] **`ResolveDisputeModal` empty-note disable:** open `ResolveDisputeModal.test.tsx`; confirm the spec covers empty-textarea AND whitespace-only-textarea (`'   '`) both disabling submit. `value.trim().length >= 1` is the rule.
- [ ] **Branch-protection cross-check:** the execute agent's commits all landed on the feature branch (not main). Verify via `gh pr view <N> --json commits` — every commit is on the branch. `git log --first-parent main --oneline -5` shows no direct push from PLAN-011 (only PR squash-merges + release-please bot commits).

Report back (under 350 words): which gates passed, any implementation fixes you made (with new commit hash on the SAME PR branch — never directly to main), anything escalated, **and explicit confirmation that (1) PLAN-003 static check still passes, (2) PLAN-005 integration tests still pass (count ≥ 115), (3) PLAN-006 per-page Playwright still pass, (4) PLAN-007 notifications + settings still pass, (5) PLAN-008 chained walking-skeleton + 4 SSO specs still pass, (6) PLAN-010 MVP specs still pass 3× no flake, (7) the PR title is `feat(web):` so release-please will bump on merge, (8) the 9 admin Playwright specs all passed 3× without flake, (9) `pageerror` listener present in every new admin spec**.

## Specific things to look hard at

1. **The PR title prefix is critical for release-please.** A `chore:` PR title would skip the minor bump. Open `gh pr view <N>` and check the title. Edit with `gh pr edit <N> --title '…'` if wrong.

2. **The 10 Playwright specs are NOT in CI.** PLAN-013 §3.1 backlog covers Playwright-in-CI. So the 3×-no-flake gate is a LOCAL run. CI only runs vitest.

3. **`SettingsForm` save-on-blur debounce.** Spec must rapid-Tab between fields and assert only the FINAL blur fires `settings.set` per field (not one mutation per intermediate blur). If the spec doesn't assert this, the debounce isn't actually validated — surface as a partial-coverage deviation.

4. **`settings-save.spec.ts` invalid input.** The spec must enter an invalid value (`not-an-email`), blur, and assert: (a) field-level error appears, (b) the mutation was NOT called (verify via `page.on('request')` or by checking the DB row is unchanged), (c) the existing value is preserved.

5. **Dispute-resolve flow round-trip.** After `dispute-resolve-closed.spec.ts` resolves a job, the row must disappear from `/admin/disputes` AND navigating to `/admin/jobs/<id>` must show:
   - JobDetailView rendering the ClosedJobBanner (because state is now `closed`).
   - AuditLogTable showing the new `disputed → closed` row with the resolution note.
   - Both timestamps in chapter-local format with UTC `<time datetime>` attribute.

6. **Disputes nav badge updates on mutation.** After resolving the last disputed job, the layout badge should disappear (or show "0") on next page render. The spec should assert this.

7. **AuditLogTable handles `actorId = null` (system events).** Some transitions may have `actorId IS NULL` (e.g., system-triggered transitions if any exist). The table should render "system" or similar in that case. Open `AuditLogTable.test.tsx` to confirm.

8. **Combined `/admin/jobs/[jobId]` page.** Per PLAN-011 Q-PLN-01 lean, this route renders `<JobDetailView>` + `<AuditLogTable>` together. Confirm both render via the audit-log spec; confirm `JobDetailView` receives `viewer.role = 'Admin'` so the Admin sees the `disputeReason` on a `disputed` job (gated on `isAdmin` in JobDetailView from PLAN-010).

9. **release-please open PR is unrelated.** Release PRs (`chore(main): release v0.x.y`) by the bot are unrelated to PLAN-011's PR. Leave them; the user merges releases.

10. **`/jobs?state=` role-gate tightness.** Open `apps/web/app/jobs/jobs-list.tsx` — the execute agent gated the filter to Admin/Moderator only (`filteredEnabled = stateFilter != null && (role === 'Admin' || role === 'Moderator')`). The execute prompt's Trap 5 said only "narrow the filter" — it did NOT mandate gating the filter by role. Since the AggregateCountsCards click-through only exists inside `/admin/*` (Admin-only), this gate never bites a real user, but Active/Alumni manually typing `?state=enrollment_open` silently get the default view instead of an error or the filter applying within their role-projection. **Confirm:** is the silent-fallback intentional UX, or should it (a) apply the filter within role-projection (PLAN-006's `/jobs` page is already role-aware) or (b) return a 400/redirect for unprivileged roles? Lean: silent-fallback is fine for MVP since there's no UI path leading non-Admin to those URLs, but the validator should flag this as a deviation-from-prompt for the coordinator to confirm.

11. **`admin.listDisputed` N+1 query + AdminLayout try/catch fallback to 0.** Open `packages/api/src/routers/admin.ts:62-103` — the loop does a per-job `select` against `job_state_transitions` and a per-job `select` against `users`. At MVP scale (<100 disputed jobs at any time, more realistically < 10) this is fine. Open `apps/web/app/admin/layout.tsx:20-25` — the `try/catch` swallows errors from `caller.admin.listDisputed()` and falls back to `disputedCount = 0`, which would silently mask a real procedure failure (the Admin would see no disputes badge even when the table is broken). **Confirm:** are both of these acceptable MVP trade-offs? Lean: N+1 is fine; the try/catch silent-fallback is borderline — better to let the error propagate to Next.js's error boundary so an actual outage surfaces. Validator should flag the try/catch behavior for the coordinator to confirm.

12. **Branch base / merge ordering.** Open `gh pr view 17 --json baseRefName,commits`. The PLAN-011 branch was created off the coordinator-cycle PR branch (so its diff against main currently includes the `.agents/*` files from that other PR). This is a coordinator-cycle concern, not a code concern — but worth a single-sentence note in your report so the coordinator knows whether the upstream cycle PR landed cleanly first. Do NOT attempt to rebase or alter the branch base; just observe and report.

## If a gate fails

1. **Mechanical fix (allowed; push to PR branch):** missing import, wrong prop, off-by-one assertion, Playwright timeout bump for cold-start, debounce-vs-assertion ordering. Branch is already the PR branch — fix, commit (`fix(web): …`), push (PR auto-updates), wait for CI.
2. **Cross-plan invariant regression (FIX in PLAN-011 code):** if PLAN-003's test fails, the fix is in PLAN-011's code that wrote directly to a state table — refactor through `transitionJob` from `packages/domain`. (Unlikely; PLAN-011 is read-mostly + dispute-resolve which routes through the existing procedures.)
3. **PLAN-005/006/007/008/010 regression (FIX, do not skip):** if any prior suite fails, the fix is in PLAN-011's modifications. Do NOT `.skip` the regressing test.
4. **Flake on a Playwright spec (INVESTIGATE):** common: `SettingsForm`'s debounce racing the spec's next assertion (use `await page.waitForResponse(/settings\.set/)`); the dispute-resolve row-disappearance racing the cache invalidation (use `await expect(row).toBeHidden({ timeout: 5_000 })`); `AuditLogTable` rendering before the resolve transition committed (use `await pollJobState(pool, jobId, 'closed')` first).
5. **Test reveals an upstream design problem (escalate):** do not edit the design — surface to the user.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Begin.
