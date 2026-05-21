# Prompt for Claude Code agent — Execute test-infra hardening (PLAN-013 §3.1 #1 + #2 + #3)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent — load `.agents/profiles/developer.md` first.** Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). **Current state:** v0.6.0 live in production; v0.7.0 + v0.7.1 cut and image-built (deploy paused per user); PLAN-001..014 + PLAN-013 all merged and green. The project is on PR-flow + release-please: `main` is branch-protected; CI requires `lint-and-typecheck` + `test`; `e2e` is **advisory-only** (this work is the precondition for flipping it to required later).

PLAN-013 (SDLC hardening, just-merged) added Playwright to CI as an **advisory** workflow. Iteration 2 of that PR shipped two **workarounds** in `.github/workflows/e2e.yml`: per-suite invocation patterns for the `roles/` and `admin/` suites, each costing ~70s of CI wall time, to mask two real underlying defects in the e2e helpers/specs. This prompt closes the underlying defects and collapses the workaround.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Land a small `fix(e2e):` PR that:

1. **Scope-narrows `demoteAllOtherAdmins`** in `apps/web/e2e/roles/support.ts` to a per-spec ID allowlist so it stops clobbering admin rows seeded by concurrent specs (PLAN-013 §3.1 #1).
2. **Self-filters the invite count assertion** in `apps/web/e2e/admin/invites.spec.ts` (line ~24) by description prefix so it stops racing other suites for shared invite rows (PLAN-013 §3.1 #2).
3. **Collapses the per-suite invocation workaround** in `.github/workflows/e2e.yml` back to a single `pnpm --filter web e2e` invocation, recovering ~70-140s of CI wall time. Verify 3× green locally before pushing.
4. **(Exploratory, OPTIONAL)** If after (1) + (2) the `e2e/admin/` suite still shows any flake under `fullyParallel: true`, run a 10-run comparison vs. `fullyParallel: false` and document the verdict in the PR body. Defer if your time budget is tight — surface as a follow-up note instead. (PLAN-013 §3.1 #3.)

This is **NOT** a versioned change — `fix(e2e):` will not trigger a release-please version bump (only `fix:` against shipped code does; e2e is test-infra). PR title MUST use `fix(e2e):` so the release CHANGELOG stays clean.

No new plan doc is required for this work — scope is fully captured in PLAN-013 §3.1 #1 + #2 + #3.

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — the developer role. §1–§7 are the loop.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root project context.
4. **`docs/plans/013-live-instance-ops-implementation.md` §3.1 (items #1, #2, #3)** — the authoritative description of each defect, the workaround in place, and the recommended fix lean. This is your source of truth for scope and approach.
5. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — Next.js 16 reminder (not directly relevant here but always worth the read).
6. **The defect surfaces — read end-to-end before editing:**
   - `apps/web/e2e/roles/support.ts` — find `demoteAllOtherAdmins`; understand all callers (grep `demoteAllOtherAdmins` across `apps/web/e2e/`).
   - `apps/web/e2e/roles/*.spec.ts` — every caller of `demoteAllOtherAdmins`. Trace what each spec seeds via `seedCast` (or equivalent) so you know which IDs the allowlist must contain.
   - `apps/web/e2e/admin/invites.spec.ts` — line ~24 has the assertion (`expect(rows.count()).toBeGreaterThan(2)` or similar). Read the full spec; understand what it mints (description prefix is the key).
   - `apps/web/e2e/admin/support.ts` — see the pattern other admin specs use for self-filtering by description / id.
7. **The workaround in place:**
   - `.github/workflows/e2e.yml` — find the per-suite invocations (each `pnpm exec playwright test` call gated to one spec or suite). This is what you collapse.
   - `apps/web/playwright.config.ts` — verify the `projects` shape; understand which project the `roles/` and `admin/` specs run under.
8. **Sanity for iteration-2 hardening (don't undo it):**
   - `apps/web/e2e/fixtures/global-setup.ts:prewarmRoutes()` — KEEP. Parallel `fetch()` GET to spec-facing routes to force Next.js compile before specs start.
   - `apps/web/playwright.config.ts:expect.timeout: 15_000` — KEEP.
   - `waitForLoadState('networkidle')` post-navigation in `signInAs` / `reAuth` / `driveToLocked` — KEEP.

## What you do NOT do

- **Do not push directly to `main`** — branch protection rejects it.
- **Do not modify anything under `docs/`** (PRDs, ADRs, designs, plans, DDD). Scope is in PLAN-013 §3.1 already; no doc edits needed. Coordinator will add a changelog entry to PLAN-013 after merge.
- **Do not modify `packages/db/`, `packages/domain/`, or `packages/db/migrations/`.** This work has no schema changes.
- **Do not modify any production code** (`apps/web/app/**`, `apps/web/src/**`, `packages/*/src/**`). Scope is e2e helpers + one spec + one workflow file.
- **Do not flip `e2e` to required-status-check** in branch protection. That's a separate coordinator action after 2 weeks of green main runs (PLAN-013 §3.1 #4).
- **Do not relax the iteration-2 hardening** (`prewarmRoutes()`, `expect.timeout: 15_000`, `networkidle` waits in support helpers) — those fixes are still load-bearing.
- **Do not add `retries` to any spec** to mask remaining flake. Root-cause it.
- **Do not bypass branch protection** with `gh pr merge --admin` or `--no-verify`.
- **Do not change the test DB engine** — PG16 via testcontainers per ADR-004.
- **Do not change `fullyParallel` for any suite EXCEPT** as part of the optional exploratory comparison in scope-item #4, and only if you also document the 10-run results in the PR body.

## Specific traps to watch for

**Trap 1 — `demoteAllOtherAdmins` callers may rely on the broad behavior.**

Read every caller before changing the signature. The current implementation demotes "all admins in the chapter except `keepId`"; some specs may be implicitly counting on that broad sweep (e.g., a spec that doesn't track its own seeded user IDs and just trusts there'll be exactly one admin left at the end). The fix is to scope-narrow to a per-spec allowlist of IDs the caller created via `seedCast` (per PLAN-013 §3.1 #1 lean) — which means callers need to pass that list in. If any caller can't easily produce the list, surface it; do NOT silently break the spec.

**Right pattern:** signature becomes `demoteAllOtherAdmins(seededUserIds: string[], keepId: string)` or similar; helper filters its `SELECT` to `id IN ($1, $2, …, $n) AND id <> $keepId`. Assertion semantics change from "count(Admin in chapter) = 1" to "count(Admin among my seeded users) = 1" — same correctness, no cross-spec blast radius.

**Trap 2 — `invites.spec.ts:24` count assertion needs the right discriminator.**

The current `expect(rows.count()).toBeGreaterThan(2)` passes alone and fails when other suites consume/invalidate invite rows concurrently. PLAN-013 §3.1 #2 lean: the spec already mints its own invites; filter the listed invites by description prefix (the spec knows what it minted) and count ONLY those.

**Right pattern:** look earlier in the spec for the `invites.mint` (or equivalent) calls; capture the description (or a UUID-suffixed prefix) per `newSuffix()` / `randomUUID()`; then filter the rendered rows in the DOM by that prefix before counting. The assertion becomes `expect(rowsMatchingMyPrefix.count()).toBe(N)` where N is the number you minted. No cross-suite race.

**Trap 3 — Collapsing `e2e.yml` to single-invocation must NOT undo the foundational fix.**

After (1) + (2), the per-suite workaround is unnecessary. **But:** the workflow may have other reasons for per-suite invocations (e.g., setting different `WORKERS` env vars per suite, or cordoning admin-only env). Read `e2e.yml` end-to-end before deleting anything. If you find per-suite logic that's not workaround-related, preserve it; if you find only the workaround, collapse to one `pnpm --filter web e2e` (or equivalent — check `apps/web/package.json` for the `e2e` script's actual invocation pattern).

**Right pattern:** the final `e2e.yml` should have one `pnpm --filter web e2e` step (or one `pnpm exec playwright test` without a path filter) that covers ALL specs, with the cache + browser-install steps preserved.

**Trap 4 — Verifying the collapse locally requires DEFAULT workers, not `--workers=1`.**

The whole point of (1) + (2) is to let admins + roles run in parallel with each other and with mvp/auth/walking-skeleton without cross-spec interference. After your fix, run `pnpm --filter web e2e` (the full suite, DEFAULT workers) **3 times consecutively**. ALL THREE must pass with no flake. If any run fails, EITHER your fix is incomplete OR there's another cross-spec dependency PLAN-013 §3.1 didn't anticipate — surface it before pushing.

**Trap 5 — Cross-plan invariants.**

After your work, the full list (15 plans deep, PLAN-001..014 + PLAN-013) MUST all be green locally:
- `pnpm -r typecheck` exits 0.
- `pnpm -r lint` exits 0 (if a lint script exists at the leaf).
- `pnpm -r test` exits 0 (all Vitest suites — counts must not drop).
- `pnpm --filter @app/domain test no-direct-state-writes` exits 0 (PLAN-003 invariant — every FSM transition routes through `transitionJob`/`transitionRole`).
- `pnpm --filter web e2e` exits 0 across 3 consecutive runs under DEFAULT workers (the new bar after collapse).
- `unset DATABASE_URL && pnpm --filter web build` exits 0 (PLAN-002 lazy-Proxy invariant).

**Trap 6 — Optional exploratory item (#3, `fullyParallel: false` for admin).**

If you do this: write a small shell loop that runs `pnpm --filter web e2e -- e2e/admin/` 10 times under `fullyParallel: true`, count pass/fail; flip to `fullyParallel: false` (in `playwright.config.ts`'s admin project block), repeat. Document both counts in the PR body. If `fullyParallel: false` is clearly better (≥1 flake out of 10 with parallel, 0/10 serial), flip it; if both are 0/10 leave it parallel. **Defer this entirely** if your wall clock is tight — surface in the report as "deferred, PLAN-013 §3.1 #3 remains open." Do not invent a verdict without running the comparison.

**Trap 7 — PR title prefix.**

Use `fix(e2e):` — release-please's MANIFEST treats `fix:` as a patch bump ONLY for shipped production code; test-infra is changelog-only in this repo's conventions. If the post-merge release-please PR DOES bump (say to v0.7.2 → v0.7.3), that's a release-please quirk; flag in the report, coordinator decides whether to skip the bump or let it ride.

**Recommended title:** `fix(e2e): scope-narrow demoteAllOtherAdmins + self-filter invites count + collapse per-suite workaround`

**Trap 8 — The iteration-2 hardening (prewarm + timeout + networkidle).**

These were added in PLAN-013 iteration 2 and are still load-bearing — they absorb Next.js compile-lag + Better Auth cookie-jar timing. Do NOT remove them. The defects you're closing here are ORTHOGONAL to those fixes; both sets need to coexist.

**Trap 9 — `seedCast` (or whatever the role-specs use) may need extension.**

If `demoteAllOtherAdmins` is changing signature to take an ID list, the seed helper that produces those IDs is the natural source. Check `apps/web/e2e/roles/support.ts` for a helper like `seedCast` / `seedAdminCohort` / `seedRolesCast` that returns the seeded user IDs. Pass those returned IDs into the new `demoteAllOtherAdmins` signature. If the seed helper doesn't return IDs today, extending it is in-scope (it's still test infra; not production code).

## PR-flow specifics

1. `git checkout main && git pull --ff-only origin main`.
2. `git checkout -b fix-e2e-test-infra-hardening` off latest `origin/main`.
3. Make the changes (Trap-1 fix → Trap-2 fix → Trap-3 collapse, in that order so you can verify each step independently).
4. Run cross-plan invariants locally (see Trap 5). All must be green.
5. Run `pnpm --filter web e2e` 3× under DEFAULT workers. All 3 must be green.
6. Commit. Single logical commit is fine: `fix(e2e): scope-narrow demoteAllOtherAdmins + self-filter invites count + collapse per-suite workaround`. Body explains WHY (cross-spec clobber / cross-suite race + ~70-140s wall time recovered).
7. `git push -u origin fix-e2e-test-infra-hardening`.
8. `gh pr create --base main --head fix-e2e-test-infra-hardening --title 'fix(e2e): scope-narrow demoteAllOtherAdmins + self-filter invites count + collapse per-suite workaround' --body '<PR body — see below>'`.
9. Wait for CI green (`lint-and-typecheck` + `test`; `e2e` advisory should now be the SINGLE-INVOCATION shape and green).
10. **Gate 1 — STOP.** Tell the user the PR is up + CI green + your 3× local e2e run pass; await merge authorization.

**Do not merge the PR yourself.**

**PR body template:**

```
Closes PLAN-013 §3.1 #1 + #2 + #3.

### What changed
- `demoteAllOtherAdmins`: now takes a per-spec ID allowlist; only demotes admins seeded by the calling spec. No more cross-spec clobber.
- `admin/invites.spec.ts:24`: count assertion now filters by description prefix; no more cross-suite count race.
- `.github/workflows/e2e.yml`: collapsed N per-suite invocations to a single `pnpm --filter web e2e` call. Recovered ~70-140s of CI wall time.

### Verification
- `pnpm --filter web e2e` 3× under DEFAULT workers — 3/3 green.
- Cross-plan invariants — all green (typecheck + Vitest + no-direct-state-writes + lazy-Proxy build).

### Optional item #3 (admin fullyParallel comparison)
[FILL OR DELETE]

### Follow-ups remaining
- PLAN-013 §3.1 #4 (flip `e2e` to required-status-check after 2 weeks of green main).
- PLAN-013 §3.1 #5-8 (other architecture follow-ups, separate effort each).
```

## Definition of done

- [ ] `apps/web/e2e/roles/support.ts:demoteAllOtherAdmins` scope-narrowed to per-spec allowlist; all callers updated.
- [ ] `apps/web/e2e/admin/invites.spec.ts` count assertion self-filters by minted-description prefix.
- [ ] `.github/workflows/e2e.yml` collapsed to single-invocation (or per-suite preserved with documented non-workaround reason).
- [ ] `pnpm -r typecheck` exits 0.
- [ ] `pnpm -r test` exits 0; Vitest counts not regressed.
- [ ] `pnpm --filter @app/domain test no-direct-state-writes` exits 0.
- [ ] `unset DATABASE_URL && pnpm --filter web build` exits 0.
- [ ] `pnpm --filter web e2e` exits 0 across **3 consecutive runs** under DEFAULT workers.
- [ ] Iteration-2 hardening intact (`prewarmRoutes`, `expect.timeout: 15_000`, `networkidle` waits all present).
- [ ] PR open against `main` with `fix(e2e):` title; required CI green; advisory `e2e` green and single-invocation-shape.
- [ ] No production code touched; no `docs/` touched.

## What to report back (under 300 words)

- PR URL + commit hash.
- The exact signature change to `demoteAllOtherAdmins` and how many caller sites you updated.
- The exact discriminator you used for `invites.spec.ts` self-filtering.
- The before/after wall-time delta on the e2e workflow (compare last green run on `main` to your run).
- Confirmation each cross-plan invariant green.
- **If you did the optional item #3:** the 10-run pass/fail counts under both `fullyParallel: true` and `fullyParallel: false`, and your verdict. If you skipped: say so.
- Any caller of `demoteAllOtherAdmins` that needed special handling.

## If you get stuck

Escalate with: (1) which scope-item / which trap, (2) exact error, (3) what you tried, (4) your lean. Do NOT invent.

Particular escalation candidates:
- After your fix, `pnpm --filter web e2e` is STILL flaky under DEFAULT workers (suggests a third cross-spec dependency PLAN-013 §3.1 didn't catch). Flag with the failing spec + the reproducer command; do NOT collapse the workflow.
- `demoteAllOtherAdmins` has a caller that genuinely needs the broad sweep (no per-spec ID list available). Flag with the caller path; lean toward "extend that caller's seed helper to return IDs" rather than reverting the signature change.
- The `invites.spec.ts` mint sites are minted by a SHARED helper that other suites also use, so the prefix isn't unique to this spec. Flag with the helper path; lean toward "UUID-suffix the description at this spec's call site."
- release-please bumps to a patch version on merge despite the `fix(e2e):` prefix (release-please config quirk). Flag; coordinator decides.
- An iteration-2 hardening line genuinely needs to change to make this work (very unlikely — they're orthogonal). Flag BEFORE you change it.

Begin.
