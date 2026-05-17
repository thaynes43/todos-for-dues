---
id: VALIDATION-013
title: Validation — PLAN-013 SDLC hardening
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-16
last_updated: 2026-05-17
estimate: S
related:
  prds: [PRD-001]
  adrs: [ADR-006]
  bounded_contexts: []
  aggregates: []
  designs: []
  plans:
    pairs_with: PLAN-013
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-013's three tracks: CI/release automation (Playwright in CI, `GITHUB_TOKEN`-tag-push trap fix, RESEND fail-fast), test hygiene (`installPageerrorListener` retrofit + `my-postings.spec.ts` flake fix), and live smoke + health + runbook. Every backlog item the coordinator has tracked since handoff 008 closed.

## 2. Inputs

- **Paired implementation plan:** `docs/plans/013-live-instance-ops-implementation.md`.
- **ADRs / designs:** `docs/adrs/006-hosting.md` (cluster + Traefik + External Secrets).
- **Prior plans:** PLAN-009 (deploy) shipped; v0.6.0 is live on the chapter cluster.
- **Running artifacts:** the deployed instance at `${LIVE_URL}` (default: `https://todos-for-dues.haynesops.com`); the `haynes-ops` cluster with kubectl access.

## 3. Coverage matrix

| Concern | Verification surface |
|---|---|
| Playwright runs in CI | `.github/workflows/e2e.yml` exists; PR-event runs are visible in `gh run list --workflow=e2e`; `playwright` job conclusion = SUCCESS on this PLAN-013 PR |
| `GITHUB_TOKEN`-tag-push trap closed | `.github/workflows/ci.yml` `build-image` job triggers on `release: types: [published]`; the next release (v0.7.0 — opened by release-please after this PR merges) auto-fires `build-image` WITHOUT manual tag re-push; GHCR has v0.7.0 within 5 min of release-PR merge |
| `RESEND_FROM_ADDRESS` boot fail-fast | `packages/notifications` Vitest test asserts the module throws on placeholder; production-mode boot fails with a clear message |
| `installPageerrorListener` in every mvp spec | `grep -L 'installPageerrorListener' apps/web/e2e/mvp/*.spec.ts` returns empty |
| `my-postings.spec.ts` flake closed | `pnpm --filter web e2e -- e2e/mvp/` exits 0 across 3 consecutive runs under DEFAULT workers (or `--workers=1` documented + accepted per Q-PLN-04) |
| `/api/health` returns healthy state | `curl ${LIVE_URL}/api/health` returns `200` + `{ status: 'ok', version: …, db: true }`; Vitest covers both healthy + degraded branches |
| readiness probe wired (haynes-ops follow-up) | After the haynes-ops PR merges, `kubectl describe pod` shows the readiness probe path is `/api/health` (NOT `/`) |
| `playwright.config.live.ts` + smoke spec exist | `pnpm --filter web e2e:live` script defined; `apps/web/playwright.config.live.ts` parses |
| Live smoke passes against v0.6.0+ | `LIVE_URL=https://todos-for-dues.haynesops.com pnpm --filter web e2e:live` exits 0 across 3 consecutive runs |
| Live smoke is read-only | `git grep -E 'jobs\.post\|invites\.mint\|users\.changeRole' apps/web/e2e/live/` returns nothing — no mutations |
| Ops runbook has 10 sections | `grep -c '^## ' docs/ops/runbook.md` ≥ 10 |
| Runbook has `Last verified` lines | `grep -c 'Last verified' docs/ops/runbook.md` ≥ 10 |

## 4. Unit tests

- **`packages/notifications/__tests__/send-email.test.ts`** (extended or new) — given `NODE_ENV=production` + missing or placeholder `RESEND_FROM_ADDRESS`, importing or invoking the module throws with a clear message. Given a valid FROM, no throw.
- **`apps/web/__tests__/api/health.test.ts`** — given a mocked db Proxy that returns OK → `GET /api/health` returns 200 with `{ status: 'ok', db: true }`; given a Proxy that throws → returns 503 with `{ status: 'degraded', db: false }`. No external dependencies in the test.

## 5. Playwright E2E tests

### Local-only (existing suites — verified for no regression)

- `pnpm --filter web e2e -- e2e/walking-skeleton/` exits 0 (PLAN-006).
- `pnpm --filter web e2e -- --grep walking-skeleton.spec.ts --repeat-each=5` exits 0 (PLAN-008 chained, 5× no-flake).
- `pnpm --filter web e2e -- __e2e__/auth/` exits 0 (PLAN-008 SSO).
- `pnpm --filter web e2e -- e2e/mvp/` exits 0 **3× consecutively under default workers** (PLAN-010 + the new flake fix).
- `pnpm --filter web e2e -- e2e/admin/` exits 0 (PLAN-011 + the invites spec from PLAN-014).
- `pnpm --filter web e2e -- e2e/roles/` exits 0 (PLAN-012).

### Live-only (new in this plan)

- `apps/web/e2e/live/smoke.spec.ts`:
  - `GET /` returns 200 (page renders).
  - On `/login`, the SSO button is visible (feature-detect: check selector existence; do NOT depend on env var values).
  - `GET /api/health` returns 200 + JSON body with `status: 'ok'` + `db: true`.
  - No `console.error` during the run (`installPageerrorListener`).
  - **MUST NOT mutate state.** No signin form submission, no posting, no role changes.

Run pattern: 3× in a row, no flake (lighter than the 5× gate on local chained, since this exercises real systems we don't own).

## 6. Pass/fail gates

- [ ] All Vitest suites pass: `pnpm --filter @app/{db,domain,auth,api,notifications,settings} test` + `pnpm --filter web test`.
- [ ] `pnpm -r typecheck` exits 0.
- [ ] `unset DATABASE_URL && pnpm --filter web build` exits 0.
- [ ] CI on the PR green: `lint-and-typecheck` ✓ + `test` ✓ + **`e2e` ✓** (advisory-only but expected to pass on this PR's own branch).
- [ ] PR title starts with `feat(ci):` (release-please reads as minor bump → v0.7.0).
- [ ] **Track A:**
  - [ ] `.github/workflows/e2e.yml` exists; advisory-only (not in required-status-checks list per `gh api repos/.../branches/main/protection`).
  - [ ] `.github/workflows/ci.yml` `build-image` triggers on `release: types: [published]`.
  - [ ] **Synthetic verification of the trap fix:** after this PR merges + release-please opens v0.7.0 + that release-PR is admin-merged + the v0.7.0 GitHub Release is created, `build-image` MUST fire within 60s and v0.7.0 image lands in GHCR within 5 min, **WITHOUT manual tag re-push.** This is the headline gate; if it fails, the Subagent A trigger swap is wrong and needs the PAT fallback.
  - [ ] `RESEND_FROM_ADDRESS` boot fail-fast: production-mode + placeholder throws; production-mode + valid passes. Vitest covers both.
- [ ] **Track B:**
  - [ ] `apps/web/e2e/mvp/support.ts` re-exports `installPageerrorListener`.
  - [ ] Every spec under `apps/web/e2e/mvp/` invokes `installPageerrorListener` (grep-verifiable).
  - [ ] `pnpm --filter web e2e -- e2e/mvp/` exits 0 across 3 consecutive runs under DEFAULT workers. If the agent had to fall back to `--workers=1`, the spec's top-comment documents the reason AND the plan changelog records it.
  - [ ] No `retries` added to any mvp spec.
- [ ] **Track C:**
  - [ ] `apps/web/app/api/health/route.ts` exists; both branches covered by Vitest.
  - [ ] `apps/web/playwright.config.live.ts` exists; parses; refuses to run without `LIVE_URL`.
  - [ ] `apps/web/e2e/live/smoke.spec.ts` exists; no state mutations.
  - [ ] `apps/web/package.json` has the `"e2e:live"` script.
  - [ ] **Live smoke passes:** `LIVE_URL=https://todos-for-dues.haynesops.com pnpm --filter web e2e:live` exits 0 across 3 consecutive runs. Validator does this run BEFORE the synthetic v0.7.0 release-trap verification, since v0.6.0 is the currently-deployed image.
  - [ ] `docs/ops/runbook.md` has 10 `## ` sections; each ends with a `Last verified` line.
- [ ] **Cross-plan invariants ALL green:**
  - PLAN-003 `no-direct-state-writes` exit 0; allowlist unchanged.
  - PLAN-005 integration ≥ 120 (PLAN-014 baseline).
  - PLAN-006 per-page Playwright 7/7.
  - PLAN-007 notifications green (with the new fail-fast test counting up).
  - PLAN-007 settings 6/6.
  - PLAN-008 chained 5× + SSO serial.
  - PLAN-010 mvp 9/9 under DEFAULT workers (the headline win of this plan).
  - PLAN-011 admin 11/11.
  - PLAN-012 roles 7/7.
  - PLAN-014 (no specific Playwright suite — the invites spec is part of `e2e/admin/`'s 11).
- [ ] **Branch-protection cross-check:** every commit on `plan-013-sdlc-hardening`; no direct push to main.

## 7. Resume notes

- If the `release: types: [published]` trap fix doesn't actually fire `build-image` (the synthetic verification gate fails on the v0.7.0 release): the fallback is a fine-grained PAT for release-please. Coordinate with the user to mint the PAT, add it as a repo secret, and update `release-please.yml` to consume it.
- If `e2e.yml` is flaky on CI day-one: investigate Playwright browser-install caching, dev-server boot time on the runner, and parallel-spec memory pressure. Don't disable specs to make CI green.
- If the live smoke spec fails on the deployed instance: that's a real production bug. Surface to the user; don't ship the PR.
- The validator does NOT need to flip `e2e` to required-status-check — that's a backlog item.

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-16 | Tom Haynes | Initial Draft. Mostly placeholders pending the post-deploy review. |
| 2026-05-17 | Tom Haynes | **Reshaped Draft → Proposed** after today's deploys. Three tracks: CI/release automation, test hygiene, live smoke + health + runbook. Adds the synthetic release-trap verification gate (the headline test of Subagent A's work). Defers Grafana dashboards/alerts to PLAN-015. |
