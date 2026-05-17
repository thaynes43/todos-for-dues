# Prompt for Claude Code agent — Validate PLAN-013 (against VALIDATION-013)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright). PLAN-013 hardens the SDLC across three tracks: **CI/release automation** (Playwright in CI, `release: types: [published]` swap for `build-image` to close the `GITHUB_TOKEN`-tag-push trap, `RESEND_FROM_ADDRESS` boot-fail-fast); **test hygiene** (`installPageerrorListener` retrofit on PLAN-010 mvp specs + `my-postings.spec.ts` parallel-flake fix); **live smoke + health + runbook** (`/api/health`, `playwright.config.live.ts`, `docs/ops/runbook.md`). Your job is the validation half — run every gate in `docs/plans/013-live-instance-ops-validation.md` §6 + the cross-plan invariants, AND execute the **synthetic post-merge release-trap verification** that's the headline gate.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute VALIDATION-013 §6 pass/fail gates + §4 unit tests + §5 Playwright specs against the PLAN-013 PR on the branch `plan-013-sdlc-hardening`. Run gates, confirm each is green, and report. If a gate fails, you do **not** relax it — small mechanical fixes only, otherwise escalate.

**Two unusual responsibilities this validate run carries beyond the pattern from VALIDATION-010/011/012/014:**

1. **Live smoke against v0.6.0.** This validate run executes `LIVE_URL=https://todos-for-dues.haynesops.com pnpm --filter web e2e:live` 3× against the deployed v0.6.0 instance. If those runs fail, that's a real prod problem AND a fail-this-PR signal — surface it to the coordinator immediately.

2. **Synthetic post-merge release-trap verification.** This is the headline test of Subagent A's `release: types: [published]` trigger swap. Concretely: AFTER the PR squash-merges to main (the user does that — you don't merge), release-please will open a v0.7.0 release PR (because the merge commit is `feat(ci): …`). When the user admin-merges that release PR, a GitHub Release is created. The `build-image` workflow MUST fire automatically on that Release event WITHOUT manual tag re-push. If it does, v0.7.0 lands in GHCR within ~5 minutes — that's confirmation the trap is closed. If `build-image` doesn't fire, the trigger swap is wrong and the PAT fallback is needed (escalate to coordinator).

   You orchestrate this synthetic verification AFTER the PR merges. Walk the user through it:
   - Confirm v0.7.0 release PR is open after PLAN-013 merges.
   - Ask the user to admin-merge it (it's a release-please PR — can't get CI on head, admin path is documented in developer profile §9).
   - Watch `gh run list --event=release --limit 5` for the build-image trigger.
   - Watch GHCR for v0.7.0: `gh api users/thaynes43/packages/container/todos-for-dues/versions --jq '[.[].metadata.container.tags[]] | sort | unique' | grep v0.7.0`.
   - Report pass/fail to the coordinator.

The cross-plan invariants are non-negotiable:
1. PLAN-003's `no-direct-state-writes.test.ts` exit 0; IGNORE_DIRS unchanged.
2. PLAN-005 integration ≥ 120 (PLAN-014 baseline; PLAN-013 may add 1-2 for the health-route Vitest).
3. PLAN-006 7/7.
4. PLAN-007 notifications + settings green (note: PLAN-013 Track A adds a Vitest test for the `RESEND_FROM_ADDRESS` fail-fast guard — count grows by ~1).
5. PLAN-008 chained 5× no-flake + SSO serial.
6. PLAN-010 mvp 9/9. **Headline gate:** this should now pass under DEFAULT workers (no `--workers=1` requirement), thanks to Subagent B's flake fix. If Subagent B fell back to `--workers=1`, document it.
7. PLAN-011 admin 11/11.
8. PLAN-012 roles 7/7.
9. PLAN-014 invites — covered in `e2e/admin/`.
10. `unset DATABASE_URL && pnpm --filter web build` exit 0.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory.
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root context.
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — Next.js 16 reminder.
4. **`docs/plans/013-live-instance-ops-validation.md`** — your gate list. §3 coverage matrix, §4 unit tests, §5 Playwright specs, §6 pass/fail gates, §7 resume notes.
5. **`docs/plans/013-live-instance-ops-implementation.md`** §3 Outputs (the file list) + §7 Risks (especially Risk 1 on the `release: types: [published]` assumption).
6. **The PLAN-013 PR on the current branch** — `git log -10 --oneline` + `gh pr view` to find it. Read the PR description and the execute agent's report. The execute agent should have flagged whether they verified the `release` trigger assumption.
7. **`.agents/prompts/030-execute-plan-013.md`** — the execute prompt the developer ran. Read the subagent prompts (Trap section) — those describe each subagent's scope, which is what you verify.
8. **The current `.github/workflows/ci.yml`** — verify the `build-image` trigger swap landed correctly.
9. **The current `.github/workflows/e2e.yml`** (new) — verify it exists, runs on PR + push, is advisory-only (NOT in branch protection's required-status-check list).

## What you do NOT do

- Do not modify any doc under `docs/`.
- Do not push directly to `main` — branch protection rejects it.
- Do not modify `packages/db/` or `packages/domain/` source. If a cross-plan invariant fails, the fix is in PLAN-013's modifications.
- Do not modify existing tRPC procedure bodies in `packages/api/` (PLAN-013 doesn't touch them anyway).
- Do not relax a gate. Small mechanical fixes (missing import, off-by-one assertion, Playwright timeout that needs bumping for cold-start) are OK; anything bigger → **escalate**.
- Do not add any path to PLAN-003's `no-direct-state-writes.test.ts` IGNORE_DIRS allowlist.
- Do not skip flaky-test runs. If a Playwright spec fails 1 of 3, INVESTIGATE.
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not amend the PLAN-013 PR's commits. Push NEW commits to the same branch — the PR auto-updates.
- Do not merge the PR yourself. The user merges.
- Do not flip `e2e.yml` to required-status-check. That's a coordinator action 2 weeks post-merge.
- Do not add the `RELEASE_PLEASE_PAT` secret yourself if the trigger swap doesn't work — escalate to the coordinator; secret-handling is the user's authorization.

## Definition of done

Every box in VALIDATION-013 §6 green, verified by running the commands:

- [ ] All Vitest suites pass: `pnpm --filter @app/{db,domain,auth,api,notifications,settings} test` + `pnpm --filter web test`.
- [ ] `pnpm -r typecheck` exits 0.
- [ ] `unset DATABASE_URL && pnpm --filter web build` exits 0.
- [ ] **CI green on the PR:** `gh pr checks <PR-number>` shows `lint-and-typecheck` ✓ + `test` ✓ + `e2e` ✓ (advisory-only on this PR's branch, but expected to pass since this PR creates `e2e.yml`).
- [ ] **PR title starts with `feat(ci):`** — release-please reads this on squash-merge → minor bump → v0.7.0.
- [ ] **Track A:**
  - [ ] `.github/workflows/e2e.yml` exists; runs on `pull_request` + `push: branches: [main]`; advisory-only.
  - [ ] `.github/workflows/ci.yml` `build-image` job triggers on `release: types: [published]` (not on tag-push).
  - [ ] The `lint-and-typecheck` + `test` jobs no longer have the now-redundant skip-on-tag-push condition.
  - [ ] `RESEND_FROM_ADDRESS` boot-fail-fast: open `packages/notifications/src/send-email.ts`; verify the guard is gated on `process.env.NODE_ENV === 'production'`. Test (`packages/notifications/__tests__/send-email.test.ts`) covers both cases.
- [ ] **Track B:**
  - [ ] `grep -L 'installPageerrorListener' apps/web/e2e/mvp/*.spec.ts` returns empty (every spec installs the listener).
  - [ ] `pnpm --filter web e2e -- e2e/mvp/` exits 0 across 3 consecutive runs **under DEFAULT workers** (no `--workers=1` override). If the agent fell back to `--workers=1`, the spec's top-comment + plan changelog document the reason.
  - [ ] No `retries` added to any mvp spec (grep `retries:` to confirm).
- [ ] **Track C:**
  - [ ] `apps/web/app/api/health/route.ts` exists; both branches covered in `apps/web/__tests__/api/health.test.ts`.
  - [ ] `apps/web/playwright.config.live.ts` exists; refuses to run without `LIVE_URL`.
  - [ ] `apps/web/e2e/live/smoke.spec.ts` exists; **no state mutations** (`git grep -E 'jobs\.post\|invites\.mint\|users\.changeRole' apps/web/e2e/live/` returns empty).
  - [ ] `apps/web/package.json` has the `"e2e:live"` script.
  - [ ] **Live smoke passes:** `LIVE_URL=https://todos-for-dues.haynesops.com pnpm --filter web exec playwright test --config=playwright.config.live.ts` exits 0 across 3 consecutive runs. The validator runs this BEFORE the synthetic v0.7.0 verification.
  - [ ] `docs/ops/runbook.md` has 10 `## ` sections; each ends with a `Last verified` line.
- [ ] **Cross-plan invariants ALL green** — confirm each explicitly in your report (PLAN-003 / PLAN-005 / PLAN-006 / PLAN-007 / PLAN-008 / PLAN-010 / PLAN-011 / PLAN-012 / PLAN-014).
- [ ] **Branch-protection cross-check:** every commit on `plan-013-sdlc-hardening`; no direct push to main.

### Post-merge gates (these run AFTER the user merges the PR — orchestrate them)

- [ ] **Synthetic release-trap verification:** after PR merges + release-please opens v0.7.0 release PR + user admin-merges it + a GitHub Release is created for v0.7.0:
  - `gh run list --event=release --workflow=CI --limit 5` shows a `build-image` run within 60s of the Release creation.
  - That run completes SUCCESS within 5 min.
  - `gh api users/thaynes43/packages/container/todos-for-dues/versions --jq '[.[].metadata.container.tags[]] | sort | unique' | grep v0.7.0` returns `v0.7.0` (the image landed without manual tag re-push).
  - If ALL THREE green: the trap is closed. Report success to the coordinator. Update the handoff backlog: "GITHUB_TOKEN-tag-push trap CLOSED 2026-MM-DD — release-event trigger fires build-image automatically."
  - If ANY of the three fail: ESCALATE. The trigger swap is wrong. Fallback path is the PAT — coordinator + user authorize the secret + the release-please-action update.

Report back (under 400 words): which gates passed, any implementation fixes you made (with new commit hash on the SAME PR branch — never to main), anything escalated, **(1) live smoke result against v0.6.0 (3× pass/fail per run), (2) Subagent B root-cause for `my-postings` and whether the fix is parallel-safe or `--workers=1` fallback, (3) Subagent A's `release: types: [published]` assumption verification — pre-merge confidence + post-merge synthetic outcome, (4) explicit confirmation of each cross-plan invariant.**

## Specific things to look hard at

1. **PR title prefix is critical for release-please.** A `chore:` PR title would skip the minor bump → v0.7.0 wouldn't cut → the synthetic verification gate has no opportunity to fire. Open `gh pr view <N>`; check title.

2. **`e2e.yml` advisory-only.** Check branch protection AT THE GATE TIME: `gh api repos/thaynes43/todos-for-dues/branches/main/protection --jq '.required_status_checks.contexts'`. The result should NOT include `e2e` / `playwright` / similar. If it does, the agent overstepped — flag + revert.

3. **`RESEND_FROM_ADDRESS` boot-fail-fast — verify the env-gate.** If the check fires in `NODE_ENV=test`, the existing test suite would all break (the placeholder is normal in test envs). The guard MUST be `if (process.env.NODE_ENV === 'production') { … }`. Read `send-email.ts` to confirm.

4. **`my-postings.spec.ts` flake — verify the root-cause is documented.** Read the spec file for any new top-comment explaining the fix OR the `--workers=1` documentation. Read `apps/web/playwright.config.ts` for any new `workers` override for the mvp project. The dev agent's report should explain what they found.

5. **Live smoke is read-only.** `git grep -E 'jobs\.post|invites\.mint|users\.changeRole|users\.grantRole|jobs\.lock|jobs\.complete' apps/web/e2e/live/` should return zero matches. If any mutation appears, escalate — the launch chapter's prod data can't be churned by CI smoke.

6. **`/api/health` doesn't break the `unset DATABASE_URL` build.** The PLAN-002 lazy Proxy should make this safe, but verify: `unset DATABASE_URL && pnpm --filter web build` exits 0. If it fails because of the health route's `db.execute(sql\`SELECT 1\`)` call at module-load time, the agent needs a dynamic import or top-level guard.

7. **Synthetic verification timing.** The release-please workflow runs on `push to main`. After PLAN-013 merges, expect:
   - T+0: PR squash-merge to main.
   - T+30s: release-please workflow runs; opens v0.7.0 PR.
   - T+5min: user admin-merges v0.7.0 PR.
   - T+10s: release-please-action creates the v0.7.0 GitHub Release.
   - T+30s: `build-image` workflow fires on the Release event (THIS is the gate).
   - T+3min: image pushed to GHCR.
   
   If `build-image` doesn't fire within ~2 min of the Release creation, treat as failed. Check `gh run list --workflow=CI --event=release --limit 5`.

8. **The PAT fallback path.** If the trigger swap fails:
   - Coordinator + user mint a fine-grained PAT (repo: this one; permissions: contents:write, pull-requests:write, actions:write).
   - Add as repo secret `RELEASE_PLEASE_PAT`.
   - Edit `.github/workflows/release-please.yml`: `with: token: ${{ secrets.RELEASE_PLEASE_PAT }}`.
   - Re-run release-please on the next release.
   - This is a separate PR; you don't author it. Escalate.

9. **release-please open PR after merge is the gate trigger.** Don't conflate it with leftover release PRs (there shouldn't be any — v0.6.0 was the latest before this PR).

## If a gate fails

1. **Mechanical fix on PR branch:** missing import, off-by-one assertion, Playwright timeout bump for cold-start, env-gate fix for the `RESEND_FROM_ADDRESS` check. Fix, commit (`fix(ci):` or `fix(web):`), push (PR auto-updates), wait for CI.
2. **Cross-plan invariant regression:** the fix is in PLAN-013's modifications. Do NOT `.skip` the regressing test.
3. **Synthetic verification fails (most consequential):** escalate immediately. The trigger swap is wrong; PAT fallback path is the recovery. Do NOT silently re-push the v0.7.0 tag to band-aid — the whole point of PLAN-013 was to stop doing that manually.
4. **Live smoke fails against v0.6.0:** investigate. If it's a real prod regression, escalate AND mark the PR as not-ready-to-merge until resolved.
5. **Test reveals upstream design problem:** do not edit the design — surface to the user.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Particular candidates:
- The synthetic verification fails to fire `build-image` on the Release event. Fallback: PAT path (coordinator + user authorize).
- `my-postings.spec.ts` still flakes under default workers even after the agent's fix. Fallback: `--workers=1` documented, plan changelog updated.
- Live smoke is flaky from network jitter against the prod URL. Increase `expect` timeouts to 15s+ for cold-start cases; use `page.waitForLoadState('networkidle')`. If still flaky, surface — a flaky live-smoke is worse than no live-smoke.
- `e2e.yml` is consistently slow on CI (>15 min wall time). Suggest the fast/slow split (PLAN-013 §7 Risk 5); don't disable specs.

Begin.
