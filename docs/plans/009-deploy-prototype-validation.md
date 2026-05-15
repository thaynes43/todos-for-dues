---
id: VALIDATION-009
title: Validation — PLAN-009 deploy prototype (Phase 1.1 internal)
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: S
related:
  prds: [PRD-001]
  adrs: [ADR-006]
  designs: []
  plans:
    pairs_with: PLAN-009
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-009 produces a working deployment of the walking-skeleton build to the haynes-ops cluster (Phase 1.1 internal `*.haynesops.com`). Validation is a smoke test against the deployed URL plus a one-time click-through of the walking-skeleton happy path. PRD AC coverage is by reference to VALIDATION-008 (the happy path is already validated against `pnpm dev`; this validation re-runs the same flow against the deployed instance).

## 2. Inputs

- **Paired implementation plan:** `docs/plans/009-deploy-prototype.md`.
- **PRDs / designs:**
  - `docs/adrs/006-hosting.md` — cluster Phase 1.1 / 1.2 split.
  - `docs/releases/001-mvp.md` §5 (rollout — internal-first).
  - PRD-001 R-11 (single-tenant instance per chapter).
- **Running artifacts:** the deployed pod at `https://todos-for-dues.haynesops.com` (or the agreed internal-domain URL); CloudNative-PG `cluster16`'s `todos_for_dues` database; External Secrets-delivered env vars in the namespace.

## 3. Coverage matrix

This is a deploy + smoke validation. No PRD AC is "owned by PLAN-009"; instead, PLAN-009 must produce an environment where VALIDATION-008's walking-skeleton run passes against the deployed URL. Below maps PLAN-009's outputs to smoke checks.

| PLAN-009 output | Verification |
|---|---|
| Dockerfile builds | `docker build -t todos-for-dues .` exits 0 |
| GitHub Actions CI green | latest `main` commit's CI workflow status is green; image pushed to GHCR |
| Per-instance Postgres provisioned | `kubectl exec cluster16-1 -- psql -U todos_for_dues_user -d todos_for_dues -c '\dt'` returns ≥7 tables after init container runs |
| External Secrets delivered | `kubectl get secret todos-for-dues-secrets -o jsonpath='{.data}'` contains the expected keys |
| Init container migrates | pod logs show `drizzle-kit migrate` success on first boot; idempotent on subsequent boots |
| Pod Running | `kubectl get pods -n frontend` shows the app pod Ready |
| IngressRoute reachable | `curl -s -o /dev/null -w '%{http_code}' https://todos-for-dues.haynesops.com/` returns 200 |
| Better Auth handler wired | `curl https://…/api/auth/sign-in/email` returns Better Auth 4xx (no 5xx) |
| tRPC handler wired | `curl https://…/api/trpc/users.getSession` returns valid tRPC response (unauthenticated → null user) |
| Bootstrap admin path | sign in once as `BOOTSTRAP_ADMIN_EMAIL`; assert the user gets Admin role |
| Walking-skeleton happy path | repeat PLAN-008's flow against the deployed URL; assert state ends at `closed` |
| Treasurer email lands | Resend dashboard shows the send; verify recipient inbox or use Resend's test-inbox |
| chapter_settings seeded from env vars | `kubectl exec … -- psql ... -c 'SELECT key, value FROM chapter_settings'` shows the 5 MVP keys with values matching the `BOOTSTRAP_*` env vars |
| ADR-006 §1.1 internal scope | URL is `*.haynesops.com` (internal LAN), not yet `*.haynesnetwork.com` (deferred to Phase 1.2) |

## 4. Unit tests

**None.** Validation here is operational (smoke against a deployed cluster), not code-level.

## 5. Playwright E2E tests

**Optional but recommended:** re-run PLAN-008's `walking-skeleton.spec.ts` with `BASE_URL=https://todos-for-dues.haynesops.com` (Playwright `webServer` config overridden). This proves the deployed instance behaves identically to local dev for the happy path.

Acceptance: spec passes 1x against the deployed URL (full 5x-no-flake gate isn't required for a one-time deploy validation; revisit if the deploy is repeated).

## 6. Pass/fail gates

- [ ] CI workflow on the deploy commit is green; image in GHCR.
- [ ] `kubectl get pods -n frontend` shows the app pod Ready within 5 minutes of Flux reconciliation.
- [ ] HTTPS smoke checks above all return expected status codes.
- [ ] Init-container DB migration completes; `\dt` shows all expected tables.
- [ ] Bootstrap admin path works.
- [ ] Walking-skeleton happy-path click-through completes; mocked-or-real Resend records the treasurer email.
- [ ] Two commits on respective repos (this repo: Dockerfile + CI; haynes-ops: manifests).

## 7. Resume notes

If the deploy fails partway, PLAN-009's resume points map to the failing step (Dockerfile → CI → DB → Secrets → Deployment → smoke). Do NOT delete the External Secrets configuration to "start clean" — investigate the underlying issue first. Resume by re-pushing the deploy commit or re-triggering Flux reconciliation.

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-009. Operational/smoke-only validation; PRD ACs are re-verified via VALIDATION-008's spec rerun against the deployed URL. |
