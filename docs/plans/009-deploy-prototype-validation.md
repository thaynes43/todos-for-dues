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
| GitHub Actions CI workflow on PRs | open a throwaway PR; the `lint-and-typecheck` and `test` jobs run and report status against the PR; the `build-image` job does NOT run on PRs |
| **Branch protection on `main`** | `gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/main/protection" -q '.required_status_checks.contexts'` returns `["lint-and-typecheck", "test"]`; `git push origin main` from a fresh local commit is rejected; `required_linear_history` is `true` |
| **Root `CLAUDE.md` PR-flow + versioning sections** | `grep -n "Pull-request flow (NORMATIVE)" CLAUDE.md` and `grep -n "Release versioning (release-please)" CLAUDE.md` each return one match |
| **release-please workflow active** | merge a PR with a `feat:` commit on `main` → within ~2 min, a "chore(main): release vX.Y.Z" PR opens automatically with a generated CHANGELOG |
| **SemVer tag drives image build** | merge the release PR → `git fetch --tags && git tag --list 'v*'` shows the new tag; the `build-image` job runs against the tag and pushes `ghcr.io/thaynes43/todos-for-dues:vX.Y.Z` + `:latest` |
| Per-instance Postgres provisioned | `kubectl exec cluster16-1 -- psql -U todos_for_dues_user -d todos_for_dues -c '\dt'` returns ≥7 tables after init container runs |
| External Secrets delivered | `kubectl get secret todos-for-dues-secrets -o jsonpath='{.data}'` contains the expected keys including all five `BOOTSTRAP_*` chapter-settings keys |
| Init container migrates | pod logs show `pnpm --filter @app/db migrate` success on first boot; idempotent on subsequent boots |
| Pod Running | `kubectl get pods -n frontend` shows the app pod Ready |
| **Deployment pins a specific tag, not `:latest`** | `kubectl get deployment -n frontend todos-for-dues -o jsonpath='{.spec.template.spec.containers[0].image}'` returns `ghcr.io/thaynes43/todos-for-dues:vX.Y.Z` (matching the release-please tag), NOT `:latest` |
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

- [ ] CI workflow runs on PRs (`lint-and-typecheck` + `test` green); `build-image` is dormant until a tag push.
- [ ] **Branch protection** on `main` is active per the §3 gate (status checks required, linear history, no force-push, direct push rejected). Confirmed with `gh api`.
- [ ] **Root `CLAUDE.md`** contains both the "Pull-request flow (NORMATIVE)" and "Release versioning (release-please)" sections.
- [ ] **release-please pipeline:** a `feat:` PR merged to `main` triggers an automatic release PR; merging that release PR creates a `vX.Y.Z` tag; the tag push triggers `build-image`; `ghcr.io/thaynes43/todos-for-dues:vX.Y.Z` and `:latest` are both pushed.
- [ ] All PLAN-009 commits in this repo landed via PRs (no direct `git push origin main`). Verified by `git log --first-parent main --oneline` showing only squash-merges.
- [ ] `kubectl get pods -n frontend` shows the app pod Ready within 5 minutes of Flux reconciliation.
- [ ] Deployment image pinned to a specific `:vX.Y.Z` tag in the haynes-ops manifest, not `:latest`.
- [ ] HTTPS smoke checks above all return expected status codes.
- [ ] Init-container DB migration completes; `\dt` shows all expected tables; `chapter_settings` has 5 rows with the configured `BOOTSTRAP_*` values (not the `*.invalid` defaults).
- [ ] Bootstrap admin path works.
- [ ] Walking-skeleton happy-path click-through completes; mocked-or-real Resend records the treasurer email.
- [ ] Commits split across this repo (per §3 Outputs, multiple PRs) and one in the haynes-ops repo.

## 7. Resume notes

If the deploy fails partway, PLAN-009's resume points map to the failing step (Dockerfile → CI → DB → Secrets → Deployment → smoke). Do NOT delete the External Secrets configuration to "start clean" — investigate the underlying issue first. Resume by re-pushing the deploy commit or re-triggering Flux reconciliation.

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-009. Operational/smoke-only validation; PRD ACs are re-verified via VALIDATION-008's spec rerun against the deployed URL. |
| 2026-05-15 | Tom Haynes | §3 + §6: added gates for the three new PLAN-009 sub-steps — branch protection on `main` (verified via `gh api` returning the expected ruleset; `git push origin main` rejected; linear history enforced), root `CLAUDE.md` PR-flow + release-please sections (grep verification), and the release-please pipeline end-to-end (feat-PR merge → release PR opens → release PR merge → tag created → build-image triggered → versioned image in GHCR). Deployment image-tag gate now requires `:vX.Y.Z` pinning, not `:latest`. Init-container migrate command updated from `drizzle-kit migrate` to the PLAN-002 `pnpm --filter @app/db migrate` wrapper. Commit-count gate broadened to "all PLAN-009 commits landed via PRs" since branch protection lands mid-plan. |
