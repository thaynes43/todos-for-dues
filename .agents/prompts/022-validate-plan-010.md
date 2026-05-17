# Prompt for Claude Code agent — Validate PLAN-010 (against VALIDATION-010)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright). PLAN-010 added the MVP job-loop UI completion (rejection / reschedule / cancel / unenroll / revert / dispute / list views) on top of PLAN-006's walking-skeleton subset. Your job is the validation half — run every gate in `docs/plans/010-mvp-job-loop-ui-completion-validation.md` §6 + the cross-plan invariants and report.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/010-mvp-job-loop-ui-completion-validation.md`'s §6 pass/fail gates + §4 unit tests + §5 Playwright specs against the PLAN-010 PR currently open on the branch. You run the gates, confirm each is green, and report. If a gate fails, you do **not** relax it — small mechanical fixes only, otherwise escalate.

The **cross-plan invariants** are non-negotiable:
1. PLAN-003's `no-direct-state-writes.test.ts` must still pass with no IGNORE_DIRS allowlist changes.
2. PLAN-005's @app/api integration tests (111+, possibly +2 if `jobs.getById` projection was extended) must still pass.
3. PLAN-006's 7 per-page walking-skeleton Playwright specs must still pass.
4. PLAN-007's notifications + settings tests must still pass.
5. PLAN-008's chained walking-skeleton + 4 SSO Playwright specs must still pass — 5x no-flake gate from VALIDATION-008 carries forward.
6. `pnpm --filter web build` exits 0 without `DATABASE_URL` set (PLAN-002 lazy Proxy regression check).

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.**
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root context. **`## Pull-request flow (NORMATIVE)` section** is load-bearing: any fix you make is a new commit on the same branch + push + the PR auto-updates. Do NOT push directly to `main` (rejected by protection anyway).
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — Next.js 16 reminder, relevant when inspecting the two new server-component routes.
4. `docs/plans/010-mvp-job-loop-ui-completion-validation.md` — your gate list. §3 coverage matrix (every AC → component → test), §4 unit tests, §5 Playwright specs, §6 pass/fail gates.
5. `docs/plans/010-mvp-job-loop-ui-completion.md` §3 Outputs, §4 Steps, §5 Verification, §9 Q-PLN-NN (the implementation lean for "non-confirmed Active sees you weren't confirmed").
6. **The PLAN-010 PR on the current branch** — `git log -10 --oneline` + `gh pr view` to find it. Read the PR description carefully — the execute agent should have flagged any `jobs.getById` projection extension, the JobDetailView refactor approach, and the Q-PLN-01 implementation.
7. `docs/designs/006-ui-components.md` §3 + §4.3 (the role-conditional contract `JobDetailView` extends).

## What you do NOT do

- Do not modify any doc under `docs/` (plans, PRDs, ADRs, designs).
- Do not push directly to `main` — branch protection rejects it.
- Do not modify `packages/db/` or `packages/domain/` source. If a cross-plan invariant fails, the fix is in PLAN-010's modifications, not in the invariant test.
- Do not modify the existing tRPC procedure bodies in `packages/api/` EXCEPT if the execute agent's `jobs.getById` projection extension has a bug — and only with a tiny `fix(api):` commit, branched + PR'd separately.
- Do not relax a gate. Small mechanical fixes (missing import, off-by-one assertion, Playwright timeout that needs bumping for cold-start, modal-disable-state assertion that needs `.toBeDisabled()` instead of `.toHaveAttribute('disabled')`) are OK; anything bigger → **escalate**.
- Do not add any path to PLAN-003's `no-direct-state-writes.test.ts` IGNORE_DIRS allowlist.
- Do not skip flaky-test runs. If a Playwright spec fails 1 of 3, INVESTIGATE the flake source — do not "just run it again." Common flake sources: tRPC mutation pending → success timing; the `confirm-race.spec.ts` race-condition trigger; modal close animation timing.
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not amend the PLAN-010 PR's commits. If an implementation fix is needed, push a new commit to the same branch — the PR auto-updates.
- Do not merge the PR yourself. The user merges.
- Do not skip the bootstrap-admin spec un-skip — it's `test.skip(true, …)` from PLAN-008 deviation and STAYS skipped unless the execute agent un-skipped it (which they shouldn't have).

## Definition of done

Every box in VALIDATION-010 §6 green, verified by running the commands:

- [ ] **All Vitest component tests pass:** `pnpm --filter web test` exit 0. Confirm the new component tests under `apps/web/__tests__/components/` are present (per VALIDATION-010 §4 — ~12 test files) AND that the `JobDetailView.test.tsx` snapshot tests cover the new state×viewer combinations (Alumni-poster on `locked` → reschedule + cancel + complete; Active enrolled on `payment_sent` → confirm + dispute; rejected state → only RejectedJobBanner; cancelled state → only CancelledJobBanner).
- [ ] **All MVP Playwright specs pass 3×:** `pnpm --filter web e2e -- e2e/mvp/` exit 0; run 3 times in a row; all 3 must pass. Capture pass/fail per run. Expected specs (per VALIDATION-010 §5):
  - `reject-flow.spec.ts`
  - `unenroll.spec.ts`
  - `reschedule.spec.ts`
  - `cancel.spec.ts`
  - `revert-completion.spec.ts`
  - `dispute-flow.spec.ts`
  - `confirm-race.spec.ts`
  - `my-postings.spec.ts`
  - `my-enrollments.spec.ts`
- [ ] **No `console.error` during Playwright runs:** check `playwright-report/` (or whatever output the project produces) for `pageerror` events; assertion is implicit if the spec's pageerror listener is in place (PLAN-006 pattern).
- [ ] **`pnpm --filter web build`** exits 0; the extended `JobDetailView` compiles.
- [ ] **`pnpm -r typecheck`** exits 0.
- [ ] **CI green on the PR:** `gh pr checks <PR-number>` shows `lint-and-typecheck` ✓ + `test` ✓. The `build-image` job is dormant (no tag push); that's correct.
- [ ] **PR title is conventional-commit-prefixed correctly:** `gh pr view <PR-number> --json title` returns a title starting with `feat(web):` — release-please reads this on squash-merge to bump the next minor version. If the title is `chore:` / `refactor:` / etc., **escalate** to the execute agent (or fix the title via `gh pr edit <N> --title '…'` if you have the auth) — release-please would otherwise not bump the version for a deploy that delivers user-visible features.
- [ ] **Cross-plan invariants ALL green (run locally):**
  - `pnpm --filter @app/domain test no-direct-state-writes` exit 0; `grep -A3 IGNORE_DIRS packages/domain/__tests__/no-direct-state-writes.test.ts` shows the same allowlist as before PLAN-010.
  - `pnpm --filter @app/api test` exit 0; integration count is 111 or 113 (if `jobs.getById` projection extension added 2 tests). Spot-check the PR diff to confirm the count matches.
  - `pnpm --filter web e2e -- e2e/walking-skeleton/` exit 0; 7/7 PLAN-006 per-page specs pass.
  - `pnpm --filter web e2e -- --grep walking-skeleton.spec.ts` exit 0; PLAN-008's chained spec passes. Run 5× in a row (VALIDATION-008's invariant; carries forward).
  - `pnpm --filter web e2e -- --grep sso.spec.ts` exit 0; PLAN-008's 4 SSO specs pass (serial mode).
  - `pnpm --filter @app/notifications test && pnpm --filter @app/settings test` exit 0.
  - `unset DATABASE_URL && pnpm --filter web build` exit 0 (PLAN-002 lazy Proxy intact).
- [ ] **Q-PLN-01 implementation present:** open `apps/web/components/CompletedJobActiveView.tsx`; verify the non-confirmed-Active branch renders "You weren't confirmed for this job; no dues credit recorded." (or equivalent — should be a clear "you don't get a credit" message). PR body should flag this as a Q-PLN-01 product lean.
- [ ] **`JobDetailView` refactor approach is reasonable:** if the file is now >300 lines of inline conditional rendering, the execute agent didn't follow Trap 3's "extract sub-components when a branch grows past ~20 lines." Surface as a deviation; recommend the user request a follow-up refactor PR. If the agent extracted sub-components into `components/job-detail-view/` (or alongside `JobDetailView.tsx`), confirm the dispatcher is clean.
- [ ] **`jobs.getById` projection extension** (if added): open `packages/api/src/routers/jobs.ts`; the new fields (`closedByDisplayName`, `viewerCredit`) MUST respect PRD-004 R-05's role projection (non-enrolled Actives see counts only, not names). Spot-check the SELECT shape + role-conditional logic.
- [ ] **Post-job CTA from RejectedJobBanner does NOT pre-fill:** open `apps/web/components/RejectedJobBanner.tsx`; the "Post a new job" CTA is a plain `<Link href="/jobs/new">` with no query params. PRD-002 Q-01 / §7.1 non-goal.
- [ ] **Branch-protection cross-check:** the execute agent's commits all landed on the feature branch (not main). Verify via `gh pr view <N> --json commits` — every commit should be on the branch. `git log --first-parent main --oneline -5` should show no direct push from PLAN-010 (only PR squash-merges + release-please bot commits).

Report back (under 350 words): which gates passed, any implementation fixes you made (with new commit hash on the SAME PR branch — never directly to main), anything escalated, **and explicit confirmation that (1) PLAN-003 static check still passes, (2) PLAN-005 integration tests still pass, (3) PLAN-006 per-page Playwright still pass, (4) PLAN-007 notifications + settings still pass, (5) PLAN-008 chained walking-skeleton + 4 SSO specs still pass (chained 5× no-flake), (6) `JobDetailView` refactor stayed within bounds, (7) the PR title is `feat(web):` so release-please will bump on merge, (8) the 9 MVP Playwright specs all passed 3× without flake.**

## Specific things to look hard at

1. **The PR title prefix is critical for release-please.** A `chore:` or `refactor:` PR title for a feature plan would skip the version bump on merge and the next deploy wouldn't carry a marker for "this is the version with the MVP UI in it." Open `gh pr view <N>` and check the title. Edit with `gh pr edit <N> --title '…'` if it's wrong AND you have write access (most likely yes since `enforce_admins: false` allows admin bypass; confirm with the user).

2. **The 9 Playwright specs are NOT in CI.** PLAN-013 §3.1 backlog covers Playwright-in-CI as a future item. So the 3×-no-flake gate is a LOCAL run. The execute agent should have run locally; you verify locally too. **Don't accept "CI green" as evidence that Playwright passed** — CI only runs vitest.

3. **`confirm-race.spec.ts` race-trigger reliability.** This spec is the trickiest in the set. Look at how it dispatches the simultaneous clicks. Patterns that work:
   - `Promise.all([context1.locator(...).click(), context2.locator(...).click()])` — fires both clicks in the same Node event-loop tick; whichever browser context responds first wins the race.
   - Bad pattern: `await context1.click(); await context2.click()` — sequential; no race.
   - Bad pattern: `setTimeout(() => context1.click(), 0); setTimeout(() => context2.click(), 0)` — non-deterministic ordering, often serial.
   If the spec is sequential, it'll PASS but it doesn't actually test the race condition — escalate.

4. **`JobDetailView` snapshot test coverage.** The snapshot tests should cover the most-frequent state×viewer combinations per VALIDATION-010 §4's last bullet. If the snapshot file doesn't show diff outputs for the new states (rejected, cancelled, disputed, closed) × the relevant viewers, coverage is partial.

5. **Modal `disabled-until-non-empty` is real.** Open one of the modal tests (e.g., `CancelJobModal.test.tsx`); verify it actually checks the disabled state with empty + whitespace-only textarea content. `value.trim().length >= 1` is the rule. Empty AND whitespace-only must both disable.

6. **The role-gate redirects on `/my-postings` + `/my-enrollments`.** Open both page files. The gate must be:
   - Server-side (at the top of the page component, before any data fetch).
   - Tested via Playwright: sign in as wrong role → navigate → expect redirect to `/`.
   If the gate is client-side (`useEffect` redirect), surface as a deviation — that pattern leaks data on slow networks before the redirect fires.

7. **Cross-plan invariant test counts are baselines.** PLAN-005's 111-test count is a baseline. If PLAN-010 added projection-extension tests, the count rises. Don't fail the gate on a *higher* count — fail it on a *lower* count.

8. **release-please open PR is unrelated.** Release PRs (e.g., `chore(main): release 0.2.x`) opened by the release-please bot are unrelated to PLAN-010's PR. Leave them; the user merges releases.

## If a gate fails

1. **Mechanical fix (allowed; push to PR branch):** missing import in a component, wrong prop name, off-by-one assertion in a test, Playwright timeout needing a bump for cold-start, modal's `disabled` attribute used instead of the React `disabled` prop. Branch is already the PR branch — `git checkout <branch>`, fix, commit (`fix(web): …` conventional prefix), `git push` (PR auto-updates). Wait for CI; the user can merge when green.
2. **Cross-plan invariant regression (FIX in PLAN-010 code, do not allowlist):** if PLAN-003's test fails, the fix is in PLAN-010's code that wrote directly to a state table — refactor through `transitionJob` / `createJob` / `recordRelationshipEvent` from `packages/domain`.
3. **PLAN-005/006/007/008 regression (FIX, do not skip):** if any prior suite fails, the fix is in PLAN-010's modifications. Do NOT mark the regressing test as `.skip` or `test.fixme`.
4. **Flake on a Playwright spec (INVESTIGATE):** identify the flake source. Common: tRPC mutation pending state vs. modal-close-animation race; `await page.waitForLoadState('networkidle')` after each role-switching navigation; `expect(...).toBeVisible()` with default 5s timeout occasionally too short for cold-start.
5. **Test reveals an upstream design problem (escalate):** do not edit the design — surface to the user.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Begin.
