# Prompt for Claude Code agent — Execute `signInAs` glob fix + full e2e.yml collapse (PLAN-013 §3.1 #10 + #3)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent — load `.agents/profiles/developer.md` first.** Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). **Current state:** v0.7.2 image in GHCR, deploy still paused (this is the final pre-deploy wrap-up PR). PLAN-001..014 + PLAN-013 + the prior test-infra hardening (PR #35) all merged + green. CI requires `lint-and-typecheck` + `test`; `playwright` is advisory but should be green-on-every-PR. The GITHUB_TOKEN-trap is closed (PR #31's PAT verified on v0.7.2's auto-build).

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Close the last residual e2e flake the prior PR surfaced + collapse the workflow the rest of the way:

1. **Fix `signInAs`'s post-redirect URL wait** in `apps/web/e2e/walking-skeleton/support/personas.ts:27`. Current: `await page.waitForURL('**/', { timeout: 30_000 })`. The glob `'**/'` matches URLs ending in `/`, but `app/page.tsx` redirects authenticated users to `/jobs` (Active/Alumni/Admin) or `/moderation-queue` (Moderator) — neither has a trailing slash. The transient `/` URL during the redirect chain is only sometimes visible to Playwright; under load (full-suite collapsed runs) it gets missed → 30s timeout → spec fails. ~⅓ reproduction rate under full-collapse shape per PR #35's report. (PLAN-013 §3.1 #10.)
2. **Audit every other `waitForURL('**/')` (or near-equivalent) in `apps/web/e2e/` and `apps/web/__e2e__/`** and fix consistently. Likely candidates: any sign-in / re-auth helper that landed before the post-signin landing was nailed down.
3. **Collapse the 4 suite-level invocations in `.github/workflows/e2e.yml`** (`walking-skeleton`, `__e2e__/auth`, `e2e/mvp`, `e2e/admin`) into a single `pnpm --filter web e2e` call. **Keep** the `e2e/roles` split: chapter-safe-5 in one invocation; `last-admin-blocked` + `admin-swap` each in their own (per PLAN-013 §3.1 #1 amendment — the chapter-state pair still needs solo testcontainer DBs until the min-Admin trigger is chapter-scoped, which is out of scope here). Final shape: 4 invocations (1 main + 1 roles-safe + 2 roles-solo).
4. **Verify by running `pnpm --filter web e2e` 3× consecutively** under DEFAULT workers. All 3 must pass. This is the bar PR #35's agent admitted dropping due to time budget — do NOT drop it.

PR title: `fix(e2e): signInAs waitForURL glob mismatch + full suite-level collapse (PLAN-013 §3.1 #10 + #3)`. `fix(e2e):` prefix — release-please may auto-bump to v0.7.3, which is fine (it'll verify the PAT pipeline again).

This is the FINAL pre-deploy code PR for the MVP wrap-up. After this merges, the coordinator refreshes the deploy prompt and the user runs the deploy.

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — the developer role. §1–§7 loop.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root project context.
4. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line, but read it).
5. **`docs/plans/013-live-instance-ops-implementation.md` §3.1 #10** (the new item the prior agent added) **+ §3.1 #1 amendment** (why the chapter-state pair stays solo). If §3.1 #10 hasn't been written into the plan yet, the description in this prompt's "Your task" §1 is the source of truth.
6. **The files you'll edit:**
   - `apps/web/e2e/walking-skeleton/support/personas.ts` — the `signInAs` helper. Read the whole file before changing line 27.
   - `apps/web/e2e/admin/support.ts`, `apps/web/e2e/roles/support.ts`, `apps/web/e2e/mvp/support.ts`, `apps/web/__e2e__/auth/*.spec.ts` — grep for any `waitForURL('**/')` or `waitForURL('**' + ...)` patterns. Fix consistently.
   - `.github/workflows/e2e.yml` — current shape was set by PR #35; you collapse the 4 suite-level invocations.
   - `apps/web/playwright.config.ts` — for context on which project each suite runs under; do not modify unless absolutely necessary.
7. **Sanity for prior hardening (do NOT undo):**
   - `apps/web/e2e/fixtures/global-setup.ts:prewarmRoutes()` — KEEP.
   - `apps/web/playwright.config.ts:expect.timeout: 15_000` — KEEP.
   - `waitForLoadState('networkidle')` / `waitForLoadState('load')` post-navigation in support helpers — KEEP (they're orthogonal hardening from PLAN-013 iter-2; this fix REPLACES the URL-wait pattern, doesn't replace the load-state wait).
   - `demoteAllOtherAdmins(pool, seededUserIds, keepId)` signature — KEEP (per-spec allowlist; PR #35).
   - `apps/web/e2e/admin/invites.spec.ts` UUID-data-attribute assertion — KEEP.

## What you do NOT do

- **Do not push directly to `main`** — branch protection rejects it.
- **Do not modify anything under `docs/`** (PRDs, ADRs, designs, plans, DDD). The coordinator updates `docs/plans/013-live-instance-ops-implementation.md` §3.1 after your PR merges.
- **Do not modify `packages/db/`, `packages/domain/`, or `packages/db/migrations/`.**
- **Do not modify any production code** (`apps/web/app/**`, `apps/web/src/**`, `packages/*/src/**`). The redirect logic in `app/page.tsx` is correct; the bug is in the e2e helper's URL pattern, not the app.
- **Do not collapse the `e2e/roles` chapter-state pair.** Keep `last-admin-blocked.spec.ts` + `admin-swap.spec.ts` in their own invocations.
- **Do not undo PR #35's `demoteAllOtherAdmins` signature or `invites.spec.ts` UUID assertion.**
- **Do not add `retries` to any spec** to mask remaining flake. If 3× full-suite runs aren't green, root-cause + escalate.
- **Do not relax iteration-2 hardening** (prewarm, expect.timeout 15s, networkidle/load waits).
- **Do not bypass branch protection** (`gh pr merge --admin`, `--no-verify`).
- **Do not change the test DB engine** — PG16 via testcontainers per ADR-004.
- **Do not skip the 3× full-suite verification** under any time-budget rationale. That gap caused last cycle's incomplete-confidence merge.

## Specific traps to watch for

**Trap 1 — Picking the right `waitForURL` pattern.**

Two reasonable options. Pick (a) unless you have a reason for (b):

(a) **Regex matching the actual landing URLs:**
```ts
await page.waitForURL(/\/(jobs|moderation-queue)?$/, { timeout: 30_000 });
```
Matches `/`, `/jobs`, `/moderation-queue` — covers the transient root + both role-based landings without any trailing-slash dependency. Single-line drop-in.

(b) **Wait for a stable post-signin DOM element instead:**
```ts
await page.getByTestId('app-shell-nav').waitFor({ state: 'visible', timeout: 30_000 });
```
Decouples from URL timing entirely. Requires verifying the `data-testid` actually exists in `apps/web/components/AppShellNav.tsx` (or wherever the post-signin shell renders) BEFORE relying on it. If the shell test-id doesn't already exist, do NOT add one to production code — fall back to (a). (Adding a `data-testid` is a tiny production change, but this prompt forbids production-code changes; the URL regex avoids that.)

Document which option you chose and why in the commit body.

**Trap 2 — Audit other support files for the same pattern.**

```sh
grep -rn "waitForURL.*\\*\\*/" apps/web/e2e/ apps/web/__e2e__/
```

Likely hits include `apps/web/e2e/admin/support.ts`, `apps/web/e2e/roles/support.ts`, possibly `apps/web/__e2e__/auth/*.spec.ts`. Fix all of them with the same pattern. If a hit uses `waitForURL('**/dashboard')` or some other concrete path — leave it alone (only `'**/'` is buggy because of trailing-slash dependency).

**Trap 3 — Cross-suite parallelism after the collapse.**

The 4 suite-level invocations were per-suite isolated (each `pnpm exec playwright test ...` gets its own `globalSetup` → fresh testcontainer DB). Collapsing into one invocation means walking-skeleton + auth + mvp + admin all run with the SAME DB. Watch for cross-suite seed conflicts:

- `seedFixtures` (the global-setup seeder) should produce idempotent / suffixed data across suites — verify.
- The `invites.spec.ts` UUID-data-attribute assertion from PR #35 is the model for cross-suite-safe spec patterns; if a different spec relies on "count of X = N" without self-filtering, it'll race under collapse. Surface any such spec.

If the 3× run reveals a new cross-suite count race, surface it; do NOT proceed with the collapse. Land just the `signInAs` fix and keep the suite-level split until the count race is fixed in a follow-up.

**Trap 4 — `e2e/roles` ordering matters in the YAML.**

Final `.github/workflows/e2e.yml` should have, in order:
1. `e2e — main (collapsed)` — `pnpm --filter web e2e -- e2e/walking-skeleton/ e2e/walking-skeleton.spec.ts __e2e__/auth/ e2e/mvp/ e2e/admin/` (or equivalent — `pnpm --filter web e2e` without a path filter MAY work, but the per-path form is more explicit). Verify the path filter doesn't accidentally include the roles dir.
2. `e2e — roles (chapter-safe set, single invocation)` — unchanged from PR #35.
3. `e2e — roles last-admin-blocked (own invocation)` — unchanged.
4. `e2e — roles admin-swap (own invocation)` — unchanged.

`pnpm --filter web e2e` alone (without path filter) would include `e2e/roles/` → the chapter-state pair would run TWICE (once in main, once solo) → flaky. Either pass an explicit set of paths in the main invocation OR add a `--ignore-pattern` for `roles/`.

**Trap 5 — 3× full-suite verification under DEFAULT workers is the gating bar.**

Run locally:
```sh
for i in 1 2 3; do
  echo "=== Run $i ==="
  pnpm --filter web e2e
done
```

(Or whatever command shape `apps/web/package.json:scripts.e2e` resolves to — verify it.) Cross-spec count races have to materialize within 3 runs at >0% rate for the workflow collapse to be safe.

If ANY of the 3 runs fail, do NOT push the collapse. Land just the `signInAs` fix; surface the failing spec + reproducer command in your report.

**Trap 6 — Cross-plan invariants.**

After your work:
- `pnpm -r typecheck` exits 0.
- `pnpm -r test` exits 0 (Vitest counts not regressed).
- `pnpm --filter @app/domain test no-direct-state-writes` exits 0.
- `unset DATABASE_URL && pnpm --filter web build` exits 0 (lazy-Proxy invariant).
- `pnpm --filter web e2e` exits 0 across **3 consecutive runs** under DEFAULT workers.

**Trap 7 — PR title prefix.**

Use `fix(e2e):` — release-please will likely bump to v0.7.3. That's fine; it'll re-verify the PAT pipeline auto-fires `build-image`. If it bumps to a higher minor/major (very unlikely with `fix:`), flag.

**Recommended title:** `fix(e2e): signInAs waitForURL glob mismatch + full suite-level collapse (PLAN-013 §3.1 #10 + #3)`

**Trap 8 — Don't grow scope.**

The user has explicitly framed this as the MVP wrap-up. Don't add unrelated refactors (e.g., the §3.1 #6 `instrumentation.ts` hook, §3.1 #7 Vitest mock helper, `bootstrap-admin.spec.ts` skip reshape). Surface any new findings as items the coordinator should add to PLAN-013 §3.1; don't fix them inline.

## PR-flow specifics

1. `git checkout main && git pull --ff-only origin main`.
2. `git checkout -b fix-e2e-signin-glob-and-collapse` off latest `origin/main`.
3. Make the `signInAs` fix; grep + fix other `waitForURL('**/')` hits; collapse the workflow.
4. Run cross-plan invariants locally.
5. Run `pnpm --filter web e2e` **3× consecutively** under DEFAULT workers. ALL 3 must be green.
6. Commit. Single commit OK: `fix(e2e): signInAs waitForURL glob mismatch + full suite-level collapse`. Body explains the glob bug, the regex (or DOM-element) chosen, the audited-and-fixed sibling support files, the workflow collapse (4→1 invocations for non-chapter-state suites), and that PR #35's chapter-state split is preserved.
7. `git push -u origin fix-e2e-signin-glob-and-collapse`.
8. `gh pr create --base main --head fix-e2e-signin-glob-and-collapse --title 'fix(e2e): signInAs waitForURL glob mismatch + full suite-level collapse (PLAN-013 §3.1 #10 + #3)' --body '<PR body — see template below>'`.
9. Wait for CI green (`lint-and-typecheck` + `test` + advisory `playwright`).
10. **Gate 1 — STOP.** Tell the user the PR is up + CI green + your 3× local e2e runs all passed; await merge authorization.

**Do not merge the PR yourself.**

**PR body template:**

```
Closes PLAN-013 §3.1 #10 (signInAs glob mismatch).
Closes PLAN-013 §3.1 #3 (full suite-level collapse) for non-chapter-state suites.

### What changed
- `apps/web/e2e/walking-skeleton/support/personas.ts:signInAs` — replaced `waitForURL('**/')` with [chosen pattern; explain why].
- [List of other support files audited + fixed for the same pattern.]
- `.github/workflows/e2e.yml` — collapsed 4 suite-level invocations into 1 (`walking-skeleton`, `__e2e__/auth`, `e2e/mvp`, `e2e/admin`). Preserved the chapter-state split for `e2e/roles/last-admin-blocked` + `e2e/roles/admin-swap` per PLAN-013 §3.1 #1 amendment.

### Verification
- `pnpm --filter web e2e` 3× consecutively under DEFAULT workers — 3/3 green.
- Cross-plan invariants — all green (typecheck + Vitest + no-direct-state-writes + lazy-Proxy build).
- Iteration-2 hardening intact (prewarmRoutes, expect.timeout 15s, networkidle/load waits).

### Wall-time impact
[Before / after delta in CI wall time.]

### Follow-ups remaining
- PLAN-013 §3.1 #1 chapter-state architecture (min-Admin trigger chapter-scoping) — unchanged; out of scope for the MVP wrap-up.
- PLAN-013 §3.1 #4 (flip `e2e` to required-status-check) — coordinator's call after 2 weeks of green main.
- PLAN-013 §3.1 #5-7 — refactor / optimization items; not bugs.
```

## Definition of done

- [ ] `apps/web/e2e/walking-skeleton/support/personas.ts:signInAs` no longer uses `waitForURL('**/')`.
- [ ] All other `waitForURL('**/')` hits in `apps/web/e2e/` + `apps/web/__e2e__/` audited and fixed.
- [ ] `.github/workflows/e2e.yml` collapsed for non-chapter-state suites; chapter-state pair preserved with explanatory comments.
- [ ] `pnpm -r typecheck` exits 0.
- [ ] `pnpm -r test` exits 0; Vitest counts not regressed.
- [ ] `pnpm --filter @app/domain test no-direct-state-writes` exits 0.
- [ ] `unset DATABASE_URL && pnpm --filter web build` exits 0.
- [ ] `pnpm --filter web e2e` exits 0 across **3 consecutive runs** under DEFAULT workers. (Non-negotiable.)
- [ ] PR open against `main` with `fix(e2e):` title; required CI green; advisory `playwright` green.
- [ ] No production code touched; no `docs/` touched.
- [ ] PR body documents the chosen `signInAs` fix pattern + the audited support files + the workflow shape change.

## What to report back (under 300 words)

- PR URL + commit hash.
- The `signInAs` fix pattern you chose (regex vs. DOM-element) and why.
- The list of other support files you audited; which had `'**/'` hits; what you replaced them with.
- The CI wall-time before/after on the e2e workflow (compare last main run to your PR's run).
- Confirmation `pnpm --filter web e2e` ran 3× consecutively under DEFAULT workers — all green. **State this explicitly; do not hand-wave.**
- Confirmation each cross-plan invariant green.
- Any new finding that should become a PLAN-013 §3.1 item (e.g., a fresh cross-suite race surfaced by the collapse).

## If you get stuck

Escalate with: (1) which trap / which scope-item, (2) exact error, (3) what you tried, (4) your lean.

Particular escalation candidates:
- **3× run isn't 3/3 green after the `signInAs` fix.** Land just the `signInAs` fix WITHOUT the workflow collapse; surface the failing spec + reproducer. The coordinator decides whether to fix the new race inline or in a follow-up.
- **`signInAs` regex (option a) doesn't actually work** because the redirect path turns out to include a query string or fragment. Lean is to extend the regex; flag with the failing URL Playwright actually saw.
- **The post-signin DOM element (option b) doesn't have a stable `data-testid`** anywhere. Don't add one to production code; fall back to (a).
- **Audit finds a `waitForURL('**/<concrete-path>')` that turns out to be buggy too** (e.g., `'**/jobs/'` matching trailing-slash that doesn't exist). Flag — these need their own analysis; don't blindly regex them.
- **Cross-suite count race surfaces in mvp or admin under collapse** (something like PR #35's `invites.spec.ts` race but in a different spec). Flag with the failing spec + the conflicting state; lean is to apply the UUID-self-filter pattern PR #35 established.

Begin.
