# Prompt for Claude Code agent — Execute PLAN-013 (SDLC hardening)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent — load `.agents/profiles/developer.md` first.** Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). **Current state:** v0.6.0 just deployed today; PLAN-001..014 are committed, green, and live. PLAN-013 hardens the SDLC before the user broadens testing — currently zero automated UI tests in CI, a recurring release-trap that's required manual tag re-pushing 4× today, and one known parallel-flake on the e2e/mvp suite.

The project is on **PR-flow + release-please**: `main` is branch-protected, every code change lands via PR after CI green (`lint-and-typecheck` + `test`), conventional commit prefixes drive release-please SemVer bumps, and merging a release PR creates the next `vX.Y.Z` tag.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/013-live-instance-ops-implementation.md` (status: Proposed; reshaped 2026-05-17 from `Draft`). Three subagent tracks in one PR:

- **Track A — CI / release automation.** New `.github/workflows/e2e.yml` (advisory-only) + `.github/workflows/ci.yml` swap to `release: types: [published]` trigger for `build-image` + `RESEND_FROM_ADDRESS` boot-fail-fast.
- **Track B — Test hygiene.** Retrofit `installPageerrorListener` onto every `apps/web/e2e/mvp/*.spec.ts` + root-cause + fix `my-postings.spec.ts` parallel-flake.
- **Track C — Live smoke + health + runbook.** `/api/health` route + Vitest tests + `playwright.config.live.ts` + `e2e/live/smoke.spec.ts` (read-only) + `docs/ops/runbook.md` (10 sections from today's deploys).

You orchestrate, integrate, and open ONE PR.

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — the developer role. §1–§7 are the loop; §10 onward is the deploy flow (skip for this run — coordinator handles deploy separately after merge).
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root project context.
4. **`.agents/context/011-coordinator-handoff-2026-05-17-eod-v2.md`** (or whichever 011 file exists) — captures the `GITHUB_TOKEN`-tag-trap history (we've manually re-pushed 4 tags today: v0.3.0, v0.4.0, v0.5.0, v0.6.0). This is the trap Track A closes.
5. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — Next.js 16 reminder.
6. `docs/plans/013-live-instance-ops-implementation.md` — the plan. **§3 (outputs grouped by track), §4 (steps including subagent prompts), §7 (risks — especially Risk 1 on the `release: types: [published]` assumption), §9 (Q-PLN leans).**
7. `docs/plans/013-live-instance-ops-validation.md` — VALIDATION-013 gates.
8. **The CI/release files you'll modify:**
   - `.github/workflows/ci.yml` (existing — read all 78 lines).
   - `.github/workflows/release-please.yml` (existing — short).
   - `release-please-config.json` + `.release-please-manifest.json` at repo root.
9. **Existing e2e support patterns to mirror:**
   - `apps/web/e2e/admin/support.ts` — has `installPageerrorListener` (copy-source for Track B).
   - `apps/web/e2e/roles/support.ts` — same pattern.
   - `apps/web/e2e/mvp/support.ts` — currently lacks the listener; Track B fixes this.
10. **The flake spec:** `apps/web/e2e/mvp/my-postings.spec.ts` — read end-to-end before investigating.
11. **playwright config:** `apps/web/playwright.config.ts` — Track C mirrors its shape for the live config.

## What you do NOT do

- **Do not push directly to `main`** — branch protection rejects it.
- **Do not modify anything under `docs/`** (PRDs, ADRs, designs, plans, DDD). The plan + validation were authored by the coordinator and are final for this run.
- **Do not modify `packages/db/`, `packages/domain/`, or `packages/db/migrations/`.** This plan has no schema changes.
- **Do not bypass branch protection** with `gh pr merge --admin` or `--no-verify`. The release-please `--admin` exception is the user's call later.
- **Do not flip `e2e` to required-status-check** in branch protection. Advisory-only on day one per Q-PLN-02. The coordinator handles the flip after 2 weeks of green runs.
- **Do not add retries to any Playwright spec** to mask the `my-postings` flake. Root-cause it.
- **Do not add Grafana dashboards or alerts** — explicitly deferred to PLAN-015 per §6.
- **Do not write a haynes-ops PR** for the readiness-probe path bump. Surface it as a follow-up note in your report; coordinator authors that PR.
- **Do not commit until ALL PLAN-013 §5 + VALIDATION-013 §6 gates green locally.**
- **Do not change the test DB engine** — PG16 via testcontainers per ADR-004.

## Specific traps to watch for

**Trap 1 — `release: types: [published]` may NOT actually fire `build-image` from `GITHUB_TOKEN`.**

Per Plan §7 Risk 1: the assumption is that `release` events fire regardless of who created them, unlike tag-push events from `GITHUB_TOKEN`. Subagent A MUST verify this assumption before claiming success — either by reading the GitHub docs explicitly, or by inspecting `release-please-action`'s commit shape to confirm it creates a real GitHub Release on the release-PR merge (which it does by default; verify config).

The headline gate in VALIDATION-013 §6 Track A is the **synthetic verification:** after this PR merges, release-please opens v0.7.0; that PR is admin-merged; the v0.7.0 GitHub Release is created; `build-image` MUST fire within 60s automatically — NO MANUAL TAG RE-PUSH. If that fails, the trigger swap is wrong; fallback is a fine-grained PAT for release-please.

You can't test the synthetic verification yourself (it requires merging this PR, which is the user's job). What you CAN do: read `release-please-action`'s default behavior carefully and document in your report whether you expect the trigger to fire. The coordinator + user will validate post-merge.

**Trap 2 — Locking the type contract before forking subagents.**

PLAN-014 worked well because the main agent landed the foundation (nav-link + tRPC router stub) before forking subagents. Do the same here:

1. Land Step 1 yourself (per Plan §4 Step 1): touch `apps/web/e2e/mvp/support.ts` to add a stub `installPageerrorListener` export; create `apps/web/app/api/health/route.ts` with a placeholder body; create `.github/workflows/e2e.yml` with the basic shell. These don't break anything but lock the file paths.

2. Spawn the three subagents in parallel. Each works on the same branch. File ownership is mostly track-disjoint, so conflicts are unlikely — but if two subagents touch the same file (e.g., Subagent C's runbook references Subagent A's workflow), the order of integration matters. You integrate.

**Trap 3 — Subagent B's `my-postings` investigation order.**

VALIDATION-011 report: "1/3 full-suite runs failed; 0/1 in isolation." Investigation paths in order of likelihood:

- **`--workers=1` not set for the mvp project.** Check `playwright.config.ts` for project config. If mvp project is missing the `workers` override, that's likely the entire issue.
- **Dev-server compile-lag.** Next.js compiles `/my-postings` on first hit; under parallel specs the second hit may wait or fail. Fix: `await page.waitForLoadState('networkidle')` post-navigation.
- **Session-cookie race.** Check `support.ts`'s persona-seeding — does each spec UUID-suffix its personas (per `newSuffix()`)?

Subagent B's report MUST include the chosen root-cause and the fix. If they fall back to `--workers=1` because the parallel race is a deeper bug, that's acceptable but it goes in the plan's changelog + the spec's top comment.

**Trap 4 — Health route doesn't depend on `DATABASE_URL` at module-load time.**

`/api/health` imports `db` from `@app/db`. The db package uses a lazy Proxy (PLAN-002) — `Pool` construction is deferred to first query. So importing `db` at the top of `route.ts` is fine; only the `await db.execute(sql\`SELECT 1\`)` call would fail without `DATABASE_URL`. Track this: `unset DATABASE_URL && pnpm --filter web build` MUST still pass. Subagent C verifies.

**Trap 5 — Live smoke spec doesn't accidentally mutate state.**

Per Plan §3 Track C: "MUST NOT mutate state." Live data is precious; the launch chapter has a real Admin + real test users. The smoke spec is anonymous-user only — `page.goto('/')`, `page.goto('/login')`, `fetch /api/health`. NO `signIn` calls, NO form submits, NO state-machine moves. Subagent C: if you find yourself reaching for `signIn`, that's out of scope.

**Trap 6 — `playwright.config.live.ts` shares no `webServer` block.**

The local config has `webServer: { command: 'pnpm dev', port: 3000, … }`. The live config does NOT — `baseURL` is `process.env.LIVE_URL`. If the live config inherits or imports from the local config, ensure no `webServer` leakage; the live runner doesn't have a dev server to start.

**Trap 7 — `e2e.yml` cold-start wall time.**

A full `pnpm --filter web e2e` run is ~5min locally; on a free GitHub runner it could be 10-15min. Mitigations: `concurrency` cancels stale PR runs; `cache: pnpm` on setup-node; Playwright browser cache via `actions/cache@v4` keyed on the Playwright version. If wall time still bothers, split into `e2e-fast` (walking-skeleton + mvp + admin) and `e2e-slow` (chained + SSO) — but only if needed.

**Trap 8 — `RESEND_FROM_ADDRESS` fail-fast on tests.**

Adding the boot-time check in `send-email.ts` could break the existing Vitest suite if any test imports the module without setting a valid FROM. Subagent A: gate the check on `process.env.NODE_ENV === 'production'` ONLY. Tests run with `NODE_ENV=test` → the check is bypassed → no false positives.

**Trap 9 — `release-please-action` Release creation.**

Verify `release-please-action` emits a GitHub Release (not just a tag) on the release-PR merge. The action's default behavior is to create both — but `release-please-config.json` could disable Release creation via `release-type: simple` (which only tags) vs. the default which is the package type. Subagent A reads the config.

**Trap 10 — Conventional-commit message for release-please.**

PR title: `feat(ci): SDLC hardening — Playwright in CI · release-tag automation · test hygiene · live smoke + health · ops runbook (PLAN-013)`. `feat:` triggers minor → v0.7.0. The new e2e capability counts as a feature (`feat:`); the others (`fix:`, `chore:`, `docs:`) are honest per-commit prefixes that get squashed.

**Trap 11 — Cross-plan invariants.**

After your work, the full list (now 14 plans deep) MUST all be green. The most likely regression: the `my-postings` fix breaks another spec; the health-route Vitest spec floors web Vitest count somewhere unexpected; the e2e workflow conflicts with the existing ci workflow's `pull_request` trigger. Cross-check each.

## PR-flow specifics

1. `git checkout -b plan-013-sdlc-hardening` **off latest `origin/main`** (PLAN-011 lesson).
2. Land Step 1 (foundation: pageerror helper stub, health route placeholder, e2e workflow shell). Commit.
3. Spawn subagents A + B + C in parallel.
4. Wait for all three reports. Integrate.
5. Run cross-plan invariants locally.
6. Run live smoke against v0.6.0: `LIVE_URL=https://todos-for-dues.haynesops.com pnpm --filter web exec playwright test --config=playwright.config.live.ts`. 3× no-flake.
7. `git push -u origin plan-013-sdlc-hardening`.
8. `gh pr create --base main --head plan-013-sdlc-hardening --title 'feat(ci): SDLC hardening — Playwright in CI · release-tag automation · test hygiene · live smoke + health · ops runbook (PLAN-013)' --body '<PR body per Plan §4 Step 5>'`.
9. Wait for CI green (`lint-and-typecheck` + `test` + the new `e2e` advisory).
10. **Gate 1 — STOP.** Tell the user the PR is up + CI green; await merge authorization.

**Do not merge the PR yourself.**

## Definition of done

Every box in VALIDATION-013 §6 green:

- [ ] All Vitest suites pass.
- [ ] `pnpm -r typecheck` exits 0.
- [ ] `unset DATABASE_URL && pnpm --filter web build` exits 0.
- [ ] CI on the PR green (lint-and-typecheck + test + advisory e2e).
- [ ] PR title `feat(ci):` for release-please minor bump.
- [ ] **Track A:** workflow files modified per §3; `RESEND_FROM_ADDRESS` boot-fail-fast lands.
- [ ] **Track B:** `installPageerrorListener` in every `e2e/mvp/*.spec.ts`; `my-postings.spec.ts` flake closed (3× no-flake, prefer DEFAULT workers).
- [ ] **Track C:** `/api/health` route + Vitest + live config + smoke spec + runbook.
- [ ] **Live smoke passes 3× against v0.6.0.**
- [ ] **Cross-plan invariants ALL green** (PLAN-003 through PLAN-014).
- [ ] Subagent reports integrated; tree clean.

Report back (under 400 words): PR URL, commit hashes, **subagent root-cause notes for `my-postings` flake**, **whether you verified the `release: types: [published]` trigger fires from `GITHUB_TOKEN` (or whether it's an untested assumption)**, **the haynes-ops readiness-probe follow-up note**, **explicit confirmation of each cross-plan invariant.**

## If you get stuck

Escalate with: (1) which step / which subagent, (2) exact error, (3) what you tried, (4) your lean. Do NOT invent.

Particular escalation candidates:
- The `release: types: [published]` trigger swap turns out to NOT fire from `GITHUB_TOKEN` — flag; fallback is the PAT path (the user mints a fine-grained PAT, adds it as `RELEASE_PLEASE_PAT` secret, and `release-please.yml` consumes it). Don't attempt the PAT path yourself — coordinator + user authorize secrets.
- The `my-postings` flake is a real correctness bug — flag; surface the failing assertion. Don't paper over.
- `e2e.yml` is consistently flaky on CI even after caching — flag; suggest the split-into-fast-and-slow path; don't disable specs.
- The health route's `db.execute(sql\`SELECT 1\`)` somehow breaks the `unset DATABASE_URL` build — flag; lean is dynamic import inside the handler.

Begin.
