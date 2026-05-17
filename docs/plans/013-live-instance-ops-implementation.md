---
id: PLAN-013
title: Live-instance ops — deployed-Playwright smoke + Grafana dashboards + ops runbook
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-16
last_updated: 2026-05-16
estimate: M
related:
  prds: [PRD-001]
  adrs: [ADR-006]
  bounded_contexts: []
  aggregates: []
  designs: []
  plans:
    prerequisite: [PLAN-009]
    lateral: [VALIDATION-013]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Close the live-instance debug + observability gap that PLAN-008 (local-only Playwright with mocks) and PLAN-009 (manual smoke + cluster-wide observability deferred) leave open. Land three minimum-viable artefacts: (1) a deployed-Playwright smoke config that exercises the real instance without mocks, (2) an ops runbook with the kubectl + psql + Resend + Better Auth debugging recipes the coordinator/user will reach for first, (3) Grafana dashboards + alert rules for the deployed app, iterated via the user's Grafana MCP tooling.

> **Circuit-breaker (READ BEFORE EXECUTING):** this plan is intentionally lightweight and is drafted *before* the first deploy lands. Once PLAN-009 ships and the user has the instance running on the `haynes-ops` cluster, the user + coordinator will revisit this plan together to:
> - Reshape §3 Outputs based on real friction (e.g., which logs the user actually grep'd to debug the first incident).
> - Decide whether dashboards are spec'd here or iterated entirely through Grafana MCP without a Markdown artefact.
> - Decide what's a real plan vs. what's a one-off `ops/` doc.
>
> **Until that conversation happens, status is `Draft` and the plan is not execution-ready.** Promote to `Proposed` after the post-deploy review.

> **Produces:** `apps/web/playwright.config.live.ts` + `apps/web/e2e/live/*.spec.ts` + `pnpm --filter web e2e:live` script + `docs/ops/runbook.md` + Grafana dashboard JSON committed somewhere appropriate (likely the `haynes-ops` repo) + alert rule stubs.
> **Definition of success:** `pnpm --filter web e2e:live` passes against the deployed URL; the user can grep the runbook to find the kubectl/psql/Resend recipe for a given symptom in <30 seconds; the Grafana dashboard shows request rate / error rate / latency / DB connection-pool stats for the deployed instance.

## 2. Inputs

### 2.1 Documents the agent must read first

Before starting, the agent reads (in this order):

1. This file (the circuit-breaker — confirm with user that the post-deploy review happened).
2. `docs/adrs/006-hosting.md` — cluster layout, External Secrets, Traefik.
3. `docs/plans/009-deploy-prototype.md` — what was deployed; where the manifests live in `haynes-ops`.
4. The user's auto-memory `reference_external_systems.md` — Grafana MCP endpoint, haynes-ops repo path, shared cluster infra.
5. Whatever the user shares from the post-PLAN-009 review (likely a list of "things I had to look up" → these become the runbook's table of contents).

### 2.2 Repo state assumed

- PLAN-009 deployed; `https://todos-for-dues.haynesops.com` (or chosen hostname) is reachable and serving the walking-skeleton UI.
- Branch protection is on `main`; all commits land via PRs.
- release-please is wired; the deployed image is pinned to a specific `:vX.Y.Z` tag.

### 2.3 External dependencies

- Grafana MCP server reachable from this Claude Code session (per user's setup).
- `kubectl` configured with access to the `haynes-ops` cluster.
- A test Workspace user (the bootstrap Admin) plus at least one Active + one Alumni invite token's worth of test users — likely seeded during PLAN-009 Step 6.
- A test inbox that Resend can deliver to (or Resend dashboard access for verification).

## 3. Outputs

> All paths are tentative — finalise during the post-deploy review.

- **`apps/web/playwright.config.live.ts`** — a separate Playwright config:
  - `baseURL: process.env.LIVE_URL` (no default — fail loud if unset).
  - No `webServer` block (we don't start a local dev server).
  - No `globalSetup` mock injection (no testcontainers, no OIDC mock, no Resend test seam).
  - `testDir: 'e2e/live'`.
- **`apps/web/e2e/live/*.spec.ts`** — a small set of read-mostly smoke specs:
  - `smoke.spec.ts` — anonymous user can load `/login`; SSO button visible (if `OIDC_*` configured); `/api/health` returns 200; no `console.error` on page load.
  - `signin-only.spec.ts` (optional) — known test user signs in; sees `/` populated; signs out. **Does NOT post jobs / approve / transition state** — live data is precious; don't churn it from CI.
  - **NOT in scope here:** full walking-skeleton chain. That stays local-only in PLAN-008 (mocked + isolated). If we ever need a "live walking-skeleton" smoke (e.g., to catch deploy regressions the unit + integration tests miss), it lands as a SEPARATE plan with a dedicated test-chapter instance + tear-down semantics.
- **`apps/web/package.json`** — new script: `"e2e:live": "playwright test --config=playwright.config.live.ts"`.
- **`apps/web/app/api/health/route.ts`** (if not already landed by PLAN-009) — `GET` returns `{ status: 'ok', version: process.env.APP_VERSION, db: <can connect via getPool().query('SELECT 1')> }`. 200 on healthy; 503 on DB unreachable. Used by the smoke spec AND Kubernetes readiness probe.
- **`docs/ops/runbook.md`** — short ops guide. Structure:
  - "How do I see logs?" — `kubectl logs -n frontend deploy/todos-for-dues -f` + Grafana Loki link.
  - "How do I inspect the DB?" — `kubectl exec -it -n frontend cluster16-1 -- psql -U todos_for_dues -d todos_for_dues` (commands), schema inspection examples, common queries (recent transitions, stuck jobs, missing chapter_settings).
  - "How do I check email delivery?" — Resend dashboard link + how to find a specific send via `Idempotency-Key`.
  - "Better Auth session debugging" — how to inspect the `session` table; common cookie / domain-mismatch symptoms.
  - "OIDC redirect mismatches" — symptom (sign-in redirects to error page) → check Workspace console redirect URI exactly matches the `OIDC_REDIRECT_URI` env var.
  - "Cert renewal failed" — symptom → who to ping / which Traefik resource to inspect.
  - "BOOTSTRAP_* env var missing" — symptom (`MissingSettingError` in afterCommit logs, emails misfire on `*.invalid` placeholders) → kubectl get secret + apply the missing key.
  - "Migrations stuck on first boot" — init container retry semantics; how to manually run migrate.
- **Grafana dashboards** (via Grafana MCP, JSON committed into `haynes-ops` likely under `kubernetes/main/observability/dashboards/`):
  - **App health dashboard** — request rate, p50/p95/p99 latency, error rate, by route. Datasource: Loki for logs, Prometheus for metrics if scraping is set up (likely cluster-wide).
  - **DB connection pool dashboard** — pg `Pool` size, in-use / idle / waiting connections, slow-query log if PG `log_min_duration_statement` is on.
  - **FSM activity dashboard** — counts of state transitions per type (post / approve / lock / complete / etc.) over time; histogram of time-in-each-state.
  - Possibly: **email send dashboard** — Resend send counts + bounce/complaint events from the webhook receiver's logs.
- **Alert rules** (Grafana MCP, committed to `haynes-ops`):
  - Pod CrashLoopBackoff alert (cluster-wide; may already exist).
  - 5xx error rate >1% sustained for 5m.
  - DB connection pool exhausted (>90% in-use for 5m).
  - p99 latency >2s sustained for 10m.
- **One or more PRs** in this repo (`fix(ops):` or `chore(ops):` prefix where appropriate) + a separate PR in `haynes-ops` for dashboards/alerts. Exact commit count finalised during the post-deploy review.

### 3.1 Backlog from PLAN-009's first deploy (folded in 2026-05-17)

> Items below were surfaced during PLAN-009's deploy + smoke and explicitly deferred to PLAN-013 rather than handled in-flight. Re-evaluate during the post-deploy review (per §1's circuit-breaker) and decide which land here vs. spawn a dedicated plan.

- **Playwright-in-CI** — the GHA `test` job currently runs vitest only (PLAN-005 integration tests + the static-analysis check); PLAN-006 + PLAN-008 Playwright specs run LOCALLY only against testcontainers. The execute agent compensated by manually running PLAN-008's chained walking-skeleton against the deployed URL via Playwright MCP. Wiring `pnpm --filter web e2e` into the CI `test` job needs (a) a testcontainers PG attachable via Playwright's `webServer.env` AND (b) GitHub's runner has Docker available so the spawning works. Likely lands as a new GHA workflow `e2e.yml` separate from `ci.yml` (longer wall time; runs on PR + on `main` push but NOT as a required status check until it's proven stable). Open question for the review: required-status-check or advisory-only on PRs.
- **`RESEND_FROM_ADDRESS` fail-fast at boot** — `packages/notifications/src/send-email.ts` currently silently defaults the FROM header to an unverified placeholder (`noreply@todos-for-dues.app`); the first chapter deploy's first email send failed silently because the env was misconfigured. A boot-time check (`if process.env.NODE_ENV === 'production' && (!RESEND_FROM_ADDRESS || matches placeholder) throw`) would catch the same misconfiguration at pod-start rather than at first-email. Small `fix(notifications):` PR; could be a one-shot or folded into the runbook step.
- **`NODE_OPTIONS=--dns-result-order=ipv4first` documentation in the runbook** — Step 4's runbook should call out the cluster16 IPv4-only egress + Node's Happy-Eyeballs IPv6-first default; symptom is OAuth token-exchange fetches timing out before falling back to IPv4. The env var fix already landed in haynes-ops PR #1771; the runbook entry prevents future debugging cycles.
- **min-Admin trigger fail-mode + bootstrap-admin spec reshape** — DESIGN-001 §5.3 was reconciled 2026-05-17 to short-circuit on INSERT. The PLAN-008 `bootstrap-admin.spec.ts` was `test.skip(true, ...)` during PLAN-008 because globalSetup pre-seeded `BOOTSTRAP_ADMIN_EMAIL` as Admin (so the chained walking-skeleton spec could sign in via the form). Now that the trigger fix has landed, the spec's "sign up THEN bootstrap-promote" premise IS reproducible — but reshaping globalSetup to allow the spec to own a non-pre-seeded `BOOTSTRAP_ADMIN_EMAIL` is still needed. Defer unless a regression slips past unit + integration tests.
- **OIDC redirect URI documentation in the runbook** — Better Auth's `genericOAuth` plugin uses `/api/auth/oauth2/callback/{providerId}`, NOT `/api/auth/callback/oauth/{providerId}` (PLAN-009 §7 was wrong; corrected in PLAN-009's 2026-05-17 changelog). The runbook entry should hard-code the correct path so future chapter deploys don't repeat the same Google Cloud Console registration error.
- **GHCR package visibility default** — first deploy required manually flipping the GHCR package to public via the web UI (no API endpoint for visibility-change). Future repos / future chapter deploys will need the same one-click flip. Runbook entry.

## 4. Steps

> Step shapes are placeholders. Each will be made concrete during the post-deploy review.

### Step 1 — Post-deploy review with the user

- **Action:** the user and coordinator sit down post-PLAN-009 and walk through:
  - What broke during the first deploy attempt?
  - Which log lines or DB rows did the user grep first?
  - Which env vars / secrets needed adjustment?
  - What's the user's mental model of "is the app healthy right now?"
- **Verification:** an updated §3 Outputs reflecting the real friction, with status flipped from `Draft` to `Proposed`.
- **Resume note:** until Step 1 completes, do not execute any subsequent step.

### Step 2 — `/api/health` endpoint + readiness probe

- **Action:** add the route handler if not already present (PLAN-009 may have landed it). Wire haynes-ops `deployment.yaml`'s `readinessProbe` + `livenessProbe` to hit it.
- **Verification:** `curl https://todos-for-dues.haynesops.com/api/health` returns 200; pod recovers from a forced DB unavailability (scale cluster16 down → probe fails → pod marked NotReady; scale up → recovers).

### Step 3 — `playwright.config.live.ts` + read-only smoke specs

- **Action:** create the live config, the `e2e:live` script, and the smoke specs.
- **Verification:** `LIVE_URL=https://todos-for-dues.haynesops.com pnpm --filter web e2e:live` exits 0. Run 3x; no flake.
- **Resume note:** the smoke specs MUST NOT mutate live data. If a future spec needs a real signin, use a dedicated test Workspace user that never posts jobs.

### Step 4 — Ops runbook (`docs/ops/runbook.md`)

- **Action:** write the runbook from the Step 1 review notes. Keep it scannable — short sections, copy-paste-able commands, no narrative.
- **Verification:** the user can find the recipe for any of the 8 listed symptoms in <30 seconds without scrolling.

### Step 5 — Grafana dashboards + alerts (via Grafana MCP)

- **Action:** use the Grafana MCP server to:
  - Search for any existing app dashboards (`search_dashboards`).
  - Create or update the four dashboards listed in §3 Outputs.
  - Generate deeplinks (`generate_deeplink`) for the runbook to reference directly.
  - Configure alert rules per §3 Outputs.
  - Export dashboard JSON; commit to `haynes-ops`.
- **Verification:** dashboards load against real cluster data; alerts fire when tripped (test by scaling the deploy to 0 replicas → 5xx alert fires within 5m).

### Step 6 — Commit + PRs

- **Action:** PR(s) in this repo (`fix(ops):` / `chore(ops):` per PLAN-009's PR-flow); separate PR in `haynes-ops`.

## 5. Verification (end-to-end)

> Will be tightened after Step 1.

- [ ] `LIVE_URL=... pnpm --filter web e2e:live` exits 0; no flake over 3 runs.
- [ ] `/api/health` returns 200 healthy + 503 unhealthy as expected.
- [ ] Grafana app-health dashboard renders against real data.
- [ ] At least one alert rule fires correctly when tripped (validation test, then disarmed).
- [ ] `docs/ops/runbook.md` covers the 8 symptoms in §3.
- [ ] PLAN-008 local Playwright still passes (no regression from the new live config sharing helpers).
- [ ] PLAN-003 `no-direct-state-writes.test.ts` still passes — this plan adds no production-code state writers.

## 6. Out of scope

- **Full walking-skeleton click-through against the live instance.** PLAN-008 covers this locally with mocks; doing it live churns real data and risks polluting the chapter's state. If we need a "live walking-skeleton" smoke, it's a separate plan with a dedicated test-chapter + cleanup semantics.
- **Multi-instance / multi-chapter dashboards.** REL-002+.
- **SLO definitions + error budgets.** Operational maturity comes later; for the MVP launch chapter, basic uptime + error-rate alerts are enough.
- **Synthetic load-testing.** Defer.
- **APM / distributed tracing.** Defer; cluster-wide tracing is probably set up at the haynes-ops level — extend if friction demands.
- **Backup / restore drills.** Cluster-level concern.

## 7. Risks & gotchas

- **Risk:** the live Playwright smoke runs against the real Workspace OIDC, so a known test user needs durable credentials. **Mitigation:** create a dedicated `playwright-smoke@<test-domain>` Workspace user; store the credentials in 1Password Connect; surface via External Secrets to the CI runner (or run the smoke locally, not in CI, to start).
- **Risk:** scheduling the smoke in CI on every PR would create real traffic to the deployed instance. **Mitigation:** smoke runs on a cron (e.g., 4x/day) or post-deploy hook, NOT per-PR. Decide during Step 1.
- **Risk:** Grafana MCP write operations require the right credentials/permissions. **Mitigation:** confirm the user's MCP setup before executing Step 5; fall back to manual dashboard creation if needed.
- **Risk:** dashboards encode assumptions about metric names and Loki label conventions that may not match what the cluster actually exposes. **Mitigation:** Step 5 starts with `list_prometheus_metric_names` / `list_loki_label_names` queries to inventory what's available before defining panels.
- **Risk:** alert rules fire false positives during deploys (a brief 5xx spike from pod restarts). **Mitigation:** rate limits + dampening per Grafana best practice; tune during Step 5.
- **Risk:** the runbook drifts from reality as the cluster changes. **Mitigation:** treat the runbook like code — date each section's "last verified" line; revisit after every incident.

## 8. Resume points

- After Step 1: post-deploy review captured; §3 Outputs reshaped; status flipped to `Proposed`.
- After Step 2: `/api/health` live.
- After Step 3: live smoke spec green.
- After Step 4: runbook published.
- After Step 5: Grafana dashboards + alerts active.
- After Step 6: PRs merged.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Run the live smoke per-PR (gates merges) or on a cron (post-deploy verification)? | Lean: **cron** (4x/day or post-deploy webhook). Per-PR adds real traffic + flake risk to the merge gate; cron catches drift without coupling deploys to live-test stability. Decide during Step 1. |
| Q-PLN-02 | Should dashboards live in `haynes-ops` (GitOps-managed) or in Grafana directly (mutable via UI)? Lean: **`haynes-ops`** for reproducibility (matches the rest of the cluster's GitOps pattern); use Grafana MCP to push updates and export JSON for commit. | Confirm during Step 5. |
| Q-PLN-03 | Should `/api/health` include details like DB connection-pool stats and last-migration version, or stay minimal? Lean: **detailed in dev, minimal in prod** (response body changes based on `NODE_ENV`) — prod shouldn't leak schema info to unauthenticated probes. | Decide during Step 2. |
| Q-PLN-04 | Where does the runbook live: `docs/ops/runbook.md` (this repo) or `haynes-ops/docs/`? Lean: **this repo** — failure modes are mostly app-specific (BOOTSTRAP_*, Better Auth, Resend); cluster-level recipes stay in `haynes-ops`. | Defer until Step 4. |
| Q-PLN-05 | The Grafana MCP setup is one-way (read-only?) or two-way (can create dashboards via MCP)? | Verify during Step 5 — affects whether dashboards are JSON-imported via the haynes-ops Flux pipeline or created interactively via MCP. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-16 | Tom Haynes | Initial Draft. Captures the live-instance debug + observability gap that PLAN-008 (local mocks only) and PLAN-009 (manual smoke + observability deferred) leave open. **Status is intentionally `Draft`:** the §1 circuit-breaker requires a post-PLAN-009-deploy review with the user before the plan executes; §3 Outputs are tentative and will be reshaped based on real friction. Grafana dashboards iterate via the user's Grafana MCP setup rather than being spec'd upfront. |
| 2026-05-17 | Tom Haynes | Added §3.1 "Backlog from PLAN-009's first deploy" — 6 follow-up items the execute agent surfaced and explicitly deferred to this plan rather than handle in-flight (Playwright-in-CI, `RESEND_FROM_ADDRESS` fail-fast at boot, IPv4-first DNS documentation, min-Admin trigger + bootstrap-admin spec reshape, OIDC redirect URI runbook entry, GHCR visibility default). Status stays `Draft` per §1's circuit-breaker; backlog will be triaged during the post-deploy review with the user. |
