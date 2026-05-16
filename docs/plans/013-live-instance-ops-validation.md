---
id: VALIDATION-013
title: Validation — PLAN-013 live-instance ops (deployed Playwright + runbook + Grafana)
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-16
last_updated: 2026-05-16
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

Verify PLAN-013's live-instance-ops artefacts work as advertised: the deployed Playwright smoke spec passes consistently against the real URL, the `/api/health` endpoint correctly distinguishes healthy vs. degraded states, the ops runbook is searchable and accurate, and the Grafana dashboards + alerts behave on real cluster data (including a deliberately-tripped alert).

> **Circuit-breaker:** like PLAN-013 itself, this validation is `Draft` until the post-PLAN-009-deploy review with the user reshapes the gates against real friction. Do not execute until PLAN-013 is `Proposed`.

## 2. Inputs

- **Paired implementation plan:** `docs/plans/013-live-instance-ops-implementation.md`.
- **ADRs / designs:** `docs/adrs/006-hosting.md` (cluster + Traefik + External Secrets).
- **Prior plans:** PLAN-009 (deploy) must be Done; the live instance is reachable.
- **Running artifacts:** the deployed instance at `${LIVE_URL}`; the Grafana instance behind the user's MCP setup; the `haynes-ops` cluster with kubectl access.

## 3. Coverage matrix

> Reshape after Step 1 (post-deploy review) — current rows are placeholders for the friction the user is most likely to hit first.

| Operational concern | Verification surface |
|---|---|
| Live instance reachable from outside | `LIVE_URL=... pnpm --filter web e2e:live --grep smoke` exits 0 |
| Healthcheck distinguishes healthy / unhealthy | `curl ${LIVE_URL}/api/health` returns 200; scale cluster16 down → 503; scale up → 200 |
| Anonymous user can load `/login` + SSO button visible | `smoke.spec.ts` assertion |
| No `console.error` on page load | Playwright `page.on('pageerror')` listener clean |
| Logs are reachable via `kubectl` | runbook's command works on first try; quoted in runbook with last-verified date |
| Logs are reachable via Grafana Loki | runbook's deeplink (generated via Grafana MCP) loads with the expected query pre-populated |
| DB inspection via `kubectl exec ... psql` | runbook's command works on first try |
| Resend dashboard + idempotency-key lookup | runbook's instructions match Resend's actual UI |
| OIDC redirect mismatch debugging | runbook's recipe produces the expected diagnostic |
| BOOTSTRAP_* missing | runbook's fix instructions resolve the issue |
| Migration stuck on boot | runbook's recovery procedure works |
| App-health dashboard renders | dashboard loads against real data; panels are not "No data" |
| Alert rule trips on forced 5xx | scale to 0 replicas → 5xx alert fires within 5m → scale back; alert resolves |

## 4. Unit tests

Minimal — the validation surface is mostly the operational artefacts themselves, not unit tests. If `/api/health` has non-trivial logic (e.g., DB-connectivity check that times out gracefully), a small Vitest spec is appropriate:

- `apps/web/__tests__/api/health.test.ts` — given a mocked db Proxy that returns OK → `GET /api/health` returns 200; given one that throws → returns 503. No external dependencies in the test.

## 5. Playwright E2E tests

- `apps/web/e2e/live/smoke.spec.ts` — anonymous user loads `/login` against `${LIVE_URL}`; asserts the SSO button is visible (conditional on OIDC being configured), no `console.error` events, `/api/health` returns 200.
- `apps/web/e2e/live/signin-only.spec.ts` (optional, per PLAN-013 §3 final scope) — a known durable test user signs in via the actual production OIDC flow; lands on `/`; signs out. **MUST NOT mutate domain data** (no posting jobs, no role changes).

**Run pattern:** 3x in a row, no flake (lighter than the 5x gate on the local walking-skeleton, since this exercises real systems we don't own).

## 6. Pass/fail gates

> Final list reshaped post-deploy. Current placeholders:

- [ ] `LIVE_URL=... pnpm --filter web e2e:live` exits 0; 3x in a row, no flake.
- [ ] `apps/web/__tests__/api/health.test.ts` (if written) exits 0.
- [ ] `/api/health` returns 200 against the deployed instance; returns 503 when DB unreachable (verified via a scale-down dry-run that's promptly reverted).
- [ ] Ops runbook (`docs/ops/runbook.md`) covers the symptoms enumerated in PLAN-013 §3; each section has a `Last verified: YYYY-MM-DD` line.
- [ ] Each runbook command runs successfully against the real cluster on a fresh shell (no missing tools, no stale paths). Spot-check at least 3.
- [ ] Grafana dashboards listed in PLAN-013 §3 render against real data; no panels are "No data" or "Datasource not found."
- [ ] At least one alert rule successfully fires when intentionally tripped (e.g., scale-to-0 → 5xx alert within 5m); alert resolves cleanly once tripped condition is removed.
- [ ] Dashboard + alert JSON committed to `haynes-ops` under the conventional path (verified during Step 5 review).
- [ ] **Regression:** PLAN-008 local Playwright (`pnpm --filter web e2e -- e2e/walking-skeleton/` + the chained spec) still passes. The new `playwright.config.live.ts` MUST NOT share state with `playwright.config.ts` in ways that break local test isolation.
- [ ] **Cross-plan invariant:** `pnpm --filter @app/domain test no-direct-state-writes` exit 0; allowlist unchanged.
- [ ] PRs landed via the normal PLAN-009 PR-flow (no direct push to `main` from PLAN-013).

## 7. Resume notes

If a gate fails, do NOT relax it — the live-ops surface is the user's debug oxygen. Either fix the implementation or escalate. Common failure modes:

- **Live smoke spec flakes from network jitter:** add appropriate `expect` timeouts (15s+ for cold-start cases against a remote URL), `page.waitForLoadState('networkidle')` for navigations. If still flaky, surface to the user — a flaky live-smoke is worse than no live-smoke.
- **Grafana MCP can't write dashboards:** verify credentials / permissions; fall back to exporting JSON manually and committing via PR.
- **Alert rule fires too eagerly during normal deploys:** dampen with longer "for" durations or rate windows; do NOT silence the alert.
- **Runbook command broke since the post-deploy review:** that's the runbook's job — capture the fix in the same PR. Refresh the `Last verified` line.

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-16 | Tom Haynes | Initial Draft. Pairs with PLAN-013. Status `Draft` until the post-PLAN-009 review reshapes both plan + validation around real friction. |
