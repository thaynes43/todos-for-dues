# Coordinator self-handoff — 2026-05-17 (PLAN-013 iteration 2 + follow-up tracking)

> **You are reading a handoff to yourself.** Cold-start context. **The immediate situation: PLAN-013 execute agent is at Gate 1 on PR #27, iteration 2; required CI is green, advisory CI is rerunning after iteration-2 push. 8 architecture follow-ups have surfaced and are now tracked in PLAN-013 §3.1.**

## Identity & role

Coordinator. Profile: `.agents/profiles/coordinator.md`. You do NOT write production code; your work lands via PR + squash-merge.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters. Live at `https://todos-for-dues.haynesops.com` running **v0.6.0**. PR #27 is queued to ship v0.7.0 (SDLC hardening — no user-facing changes; release is for the infra).

## What you MUST read on cold start (in order)

1. `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`
2. `.agents/profiles/coordinator.md`
3. `CLAUDE.md`
4. `docs/plans/COVERAGE.md`
5. `git log --first-parent main --oneline -25` + `gh pr list --state open`
6. **The most-recent prompts:** `.agents/prompts/030-execute-plan-013.md` + `.agents/prompts/031-validate-plan-013.md`
7. **The PLAN-013 PR (#27)** — `gh pr view 27`; read the dev agent's most recent `.zprompt.md` report (iteration 2).
8. **Prior handoffs:** `.agents/context/00{8..11}-*.md` (skim).

## Current state (snapshot)

### Plans live ✅ on main

- **PLAN-001..014** all merged + deployed (v0.6.0).
- **PR #25** (PLAN-013 reshape + 030 + 031) merged at `741d04b`.

### PR #27 — PLAN-013 execute agent at Gate 1 (iteration 2)

Branch: `plan-013-sdlc-hardening`. Title: `feat(ci): SDLC hardening — Playwright in CI · release-tag automation · test hygiene · live smoke + health · ops runbook (PLAN-013)`. Release-please will bump to v0.7.0 on squash-merge.

Commits (9):

- `d126c10` foundation: pageerror helper, health stub, e2e workflow shell
- `b5b9e2a` build-image trigger → `release: types: [published]`
- `054c688` RESEND_FROM_ADDRESS fail-fast (NEXT_PHASE-aware)
- `001ae1a` pageerror retrofit + my-postings flake + postJob compile-lag
- `1175b31` /api/health endpoint + Vitest
- `5eabe15` live-smoke Playwright config + read-only smoke spec
- `8caec6b` docs/ops/runbook.md (10 sections)
- `01b0b86` exclude e2e/live/ from local config
- `8f7b083` **iteration 2** — prewarm routes + harden support + per-suite invocation in `e2e.yml`

CI status (per latest report): required `lint-and-typecheck` ✓ + `test` ✓; advisory `playwright` rerunning after iteration 2.

### What iteration 2 changed vs iteration 1

After iteration 1 landed required-CI-green but advisory-CI-red, the user pushed for advisory-green too. Iteration 2 hardened CI infrastructure:

- **`apps/web/e2e/fixtures/global-setup.ts:prewarmRoutes()`** — parallel `fetch()` GET to every spec-facing route to force Next.js compilation before specs start.
- **`apps/web/playwright.config.ts`** — global `expect.timeout: 15_000` (was 5s default).
- **`signInAs` / `reAuth` / `driveToLocked`** — `waitForLoadState('networkidle')` post-navigation to absorb Better Auth cookie-jar timing + dev-server compile lag.
- **`.github/workflows/e2e.yml`** — per-suite invocation pattern (each role spec + admin suite gets its own `pnpm exec playwright test` call) as a **workaround** for two pre-existing batch bugs. ~70s extra wall time.

### Architecture follow-ups now tracked in PLAN-013 §3.1

Real issues that this PR does NOT fix; required before flipping `e2e` advisory → required:

1. **`roles/support.ts:demoteAllOtherAdmins` clobbers concurrent specs** (workaround: per-spec invocations).
2. **`admin/invites.spec.ts:24` cross-suite count race** (workaround: per-suite invocations).
3. **`fullyParallel: false` for `e2e/admin/`?** — 10-run flake-rate comparison after #1 + #2.
4. **Flip `e2e` to required-status-check** — 2 weeks of green main.
5. **GHA cold-runner Playwright wall time** — runner upgrade / Playwright shard / fast+slow split.
6. **`RESEND_FROM_ADDRESS` fail-fast → `instrumentation.ts` hook** (cleaner than module-load).
7. **`/api/health` Vitest mock helper** (`vi.resetModules()` quirk).
8. **Smoke spec's `/api/health` against pre-v0.7.0 instances** — currently strict; live smoke fails 1/3 against v0.6.0 (expected).

These are the **launch-readiness gates** before beta widens. Coordinator + user can pick which become a follow-up plan (PLAN-016: test-infra hardening?) and which stay as one-off chores.

### Synthetic verification — the headline test post-merge

After PR #27 squash-merges:

1. Release-please opens v0.7.0 release-PR within ~2 min.
2. User admin-merges (release-please PRs can't get CI on head; `--admin` is documented in dev profile §9).
3. release-please-action creates the v0.7.0 GitHub Release.
4. **The `build-image` workflow MUST fire automatically on the `release.published` event WITHOUT manual tag re-push.**
5. v0.7.0 image lands in GHCR within ~5 min.

If 4 happens automatically: the `GITHUB_TOKEN`-tag-trap is **closed** — 4 tags today required manual re-push; v0.7.0 onward is automatic.

If 4 doesn't fire: fallback is mint a fine-grained PAT, store as `RELEASE_PLEASE_PAT` secret, update `release-please.yml` to use it. **Coordinator + user authorize the secret; developer agent does NOT mint secrets.**

Validator prompt 031 enforces this gate.

### Open PRs (verify on cold start)

- **PR #27** (PLAN-013 implementation) — awaiting user merge authorization at Gate 1.
- **This cycle PR** if not yet merged.

### Branch protection status

Unchanged. `enforce_admins: false` still intentional break-glass. Required checks `[lint-and-typecheck, test]`. **`e2e` is added by PR #27 as ADVISORY-only.** Do NOT flip to required until follow-ups #1–#5 are resolved.

### Cross-plan invariants (latest, after PR #27 merges)

The dev agent verified all 14 plans green locally per iteration 2 report. After PR #27 merges:

- PLAN-002 / PLAN-003 / PLAN-005 (120) / PLAN-006 (7/7) / PLAN-007 (notifications 36 + settings 6) / PLAN-008 (5/5 chained + 7+2skip SSO) / PLAN-010 (mvp 9/9 × 3 DEFAULT workers) / PLAN-011 (admin 11/11) / PLAN-012 (roles 7/8 per-file individually; batch is the §3.1 #1 bug) / PLAN-014 / PLAN-013 (new) — all green.

### Live smoke against v0.6.0

3 runs (per iteration 2 report):
- ✓ Homepage 200 + no console.error
- ✓ /login renders + SSO button feature-detected
- ✗ /api/health 404 (expected; route ships in v0.7.0)

Re-run smoke after v0.7.0 deploys → all 3 should pass.

## Coordinator lessons (accumulating)

- **PLAN-009..014 lessons** carry forward.
- **PLAN-013 iteration-2 lesson (new today):** Advisory CI doing its job. Day-1 advisory red on a new test workflow is the EXPECTED failure mode — it surfaces real (sometimes pre-existing) bugs that would have been hidden by manual smoke. The "no fixes; iterate to advisory green" path the user pushed for is the right discipline; just gate the iteration scope to "workarounds at the workflow level + targeted hardening" rather than "fix every underlying bug." The 8 follow-ups in §3.1 are the price of having uncovered them.

## What you do tomorrow

1. **Read this handoff + cold-start files.**
2. **Check open PRs:** `gh pr list --state open`. Expected:
   - PR #27 (PLAN-013 implementation) — at Gate 1.
   - This cycle PR (if not yet merged).
   - Possibly the v0.7.0 release PR if user already merged PR #27.
3. **Run prompt 031 (validate PLAN-013)** OR have the dev agent re-verify after their advisory CI settles — your call. The validator's headline gate is the post-merge synthetic verification (the `release: types: [published]` swap actually firing `build-image`). Easiest path: user merges PR #27 → release-please opens v0.7.0 PR → admin-merge → watch `gh run list --event=release` for the auto-build → if green, the trap is closed; if not, run the PAT fallback.
4. **Write a new handoff `013-…md` after this cycle closes.**

### Next-plan candidates (your call)

- **PLAN-016 — Test-infra hardening** (groups §3.1 items #1, #2, #3). Cohesive scope: fix `demoteAllOtherAdmins` scope-narrowing + `admin/invites` self-filtering + admin parallel flake comparison. Touches `apps/web/e2e/*/support.ts` and one spec. Could land as a small `fix(e2e):` PR without a fresh PRD.
- **PLAN-015 — Observability** (Grafana dashboards + alerts via MCP). Iterative; doesn't need a Markdown plan upfront. Author when observability gap pinches.
- **Pre-beta validation plan** — PLAN-009's 3 deferred user-driven gates.

## Outstanding low-priority items

- All 8 §3.1 follow-ups (described above; tracked in plan).
- `enforce_admins: true` flip.
- Probe commit `4e2ea9e`.
- `bootstrap-admin.spec.ts` test.skip reshape.
- Email delivery of invite URLs.
- haynes-ops readiness/liveness probe path bump `/` → `/api/health` (post-v0.7.0 deploy; one-line YAML change in `helmrelease.yaml`).

## What's in this cycle's PR

Branch: `coordinator-cycle-plan-013-iter2-tracking`. Files:

- `docs/plans/013-live-instance-ops-implementation.md` — adds §3.1 (8 architecture follow-ups) + updated §6 (out of scope) + iteration 2 changelog entry.
- `.agents/context/012-coordinator-handoff-2026-05-17-plan-013-iter2-tracking.md` — this file.

Docs-only; no code touched. release-please will not bump.

## Quick reference

| Need | Path |
|---|---|
| User auto-memory | `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` |
| Coordinator profile | `.agents/profiles/coordinator.md` |
| Developer profile | `.agents/profiles/developer.md` |
| Coverage matrix | `docs/plans/COVERAGE.md` |
| Past handoffs | `.agents/context/00{1..12}-*.md` |
| Past prompts | `.agents/prompts/NNN-*.md` |
| Live instance | `https://todos-for-dues.haynesops.com` running `v0.6.0` → v0.7.0 after PR #27 + release |
| GHCR | `ghcr.io/thaynes43/todos-for-dues:v0.6.0` (current) |

---

**Begin.** Read the cold-start files. Tell the user you're back in role + that PR #27 is at Gate 1 + that the 8 architecture follow-ups are tracked in PLAN-013 §3.1 for post-merge decisions.
