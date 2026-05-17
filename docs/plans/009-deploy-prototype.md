---
id: PLAN-009
title: Deploy the prototype to the haynes-ops cluster (Phase 1.1 internal)
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: M
related:
  prds: [PRD-001]
  adrs: [ADR-006]
  bounded_contexts: []
  aggregates: []
  designs: []
  plans:
    prerequisite: [PLAN-001, PLAN-002, PLAN-003, PLAN-004, PLAN-005, PLAN-006, PLAN-007, PLAN-008]
    lateral: [VALIDATION-009]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Deploy the walking-skeleton build to the haynes-ops cluster per ADR-006 Phase 1.1 (`*.haynesops.com` internal). Wire CI (GitHub Actions) to build + push a container image to GHCR; wire haynes-ops Flux pipeline to pull and deploy. Provision the per-instance Postgres (dedicated DB on `cluster16`), the External Secrets connection to 1Password Connect, and the Traefik IngressRoute. Verify by visiting the deployed URL and clicking through the walking-skeleton happy path against the deployed instance.

> **Definition of success:** `https://todos-for-dues.haynesops.com` (or the agreed internal-domain URL) loads the placeholder home page; an Alumni can sign up via invite link → post a job → Moderator approves → Active enrolls → ... → loop closes against the deployed instance.

## 2. Inputs

1. `docs/adrs/006-hosting.md` — cluster design + Flux pipeline.
2. `~/src/labspace/haynes-ops/` — the GitOps repo (path per `reference_external_systems.md`).
3. `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/homepage/` — pattern to mirror.
4. PLAN-001..PLAN-008 (the app builds + tests pass).

## 3. Outputs

- `Dockerfile` at the repo root — multi-stage Next.js build per Next.js standalone-output convention.
- `.github/workflows/ci.yml` — GitHub Actions: typecheck, lint, test on every PR + `main` push; `build-image` on tag push only.
- `.github/workflows/release-please.yml` — release-please v4 on `main` push; opens release PRs + creates `vX.Y.Z` tags on merge.
- `release-please-config.json` + `.release-please-manifest.json` at repo root.
- Root `package.json` gains a `version` field (starts at `0.1.0`).
- Root `CLAUDE.md` gains two new sections: "Pull-request flow (NORMATIVE)" and "Release versioning (release-please)".
- Branch protection on `main` (configured via `gh api`) requiring the `lint-and-typecheck` + `test` status checks; linear history enforced; no force-pushes; no direct push to `main`.
- `kubernetes/main/apps/frontend/todos-for-dues/` in the haynes-ops repo:
  - `kustomization.yaml`
  - `deployment.yaml` — Next.js standalone runtime; image is pinned to a specific `:vX.Y.Z` tag, NOT `:latest` (reproducible deploys).
  - `service.yaml`
  - `ingressroute.yaml` — Traefik internal (`*.haynesops.com`) with cert
  - `postgres-cluster.yaml` — request a dedicated DB on cluster16 OR an `apps_db_init` job creates the schema in cluster16
  - `external-secrets.yaml` — pulls `RESEND_API_KEY`, `OIDC_CLIENT_ID/SECRET/HOSTED_DOMAIN`, `BETTER_AUTH_SECRET`, `BOOTSTRAP_ADMIN_EMAIL`, `DATABASE_URL`, and the five `BOOTSTRAP_*` chapter-settings env vars from 1Password Connect
- A test invite-link generation: Admin (per `BOOTSTRAP_ADMIN_EMAIL`) signs in once → generates invite links for Sigma Phi Omicron members.
- Commits in **this repo** (one per feature, via PRs since branch protection lands mid-plan):
  - `chore(ci): GitHub Actions workflow + tag-gated image build`
  - `chore(ci): enable branch protection on main`
  - `docs(claude): PR flow + release-please versioning rules`
  - `chore(release): wire release-please v4 + initial 0.1.0 manifest`
  - `feat(docker): Dockerfile + Next.js standalone build`
- Commit in **haynes-ops repo**: `feat: deploy todos-for-dues frontend internal`.

## 4. Steps

### Step 1 — Dockerfile + Next.js standalone

- **Action:** add `output: 'standalone'` to `apps/web/next.config.mjs`. Write a multi-stage Dockerfile:
  - Stage 1: install deps via pnpm.
  - Stage 2: build apps/web.
  - Stage 3: copy standalone output + node_modules into a slim runtime image.
- **Verification:** `docker build -t todos-for-dues .` succeeds; `docker run -p 3000:3000 -e DATABASE_URL=... todos-for-dues` boots; manual smoke test.

### Step 2 — GitHub Actions CI

- **Action:** `.github/workflows/ci.yml` with jobs that run on both `pull_request` and `push: { branches: [main] }`:
  - `lint-and-typecheck`: pnpm install, `pnpm lint`, `pnpm typecheck`.
  - `test`: pnpm install, `pnpm test` (unit + integration via testcontainers Postgres — the GHA runner has Docker available by default).
  - `build-image`: on **tag push** matching `v*.*.*` only (not every commit — versioned releases drive image builds; see Step 2.7's release-please wiring). Build + push to `ghcr.io/thaynes43/todos-for-dues:<version>` and `:latest`. SHA-tagged builds on `main` push are out of scope for MVP — release-please's tag is the trigger.
- **Verification:** open a throwaway PR; the lint/typecheck/test jobs run and go green; no image is pushed (build-image is tag-gated). After the first release tag (Step 2.7), confirm the image lands in GHCR with the matching version.

### Step 2.5 — Enable branch protection on `main` (via `gh`)

- **Action:** with `gh auth status` showing a token that has `repo` scope, run an idempotent setup script. The agent does this from the repo's working directory:

  ```sh
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
  gh api -X PUT "repos/$REPO/branches/main/protection" \
    --input - <<'JSON'
  {
    "required_status_checks": {
      "strict": true,
      "contexts": ["lint-and-typecheck", "test"]
    },
    "enforce_admins": false,
    "required_pull_request_reviews": null,
    "restrictions": null,
    "required_linear_history": true,
    "allow_force_pushes": false,
    "allow_deletions": false,
    "block_creations": false,
    "required_conversation_resolution": false,
    "lock_branch": false,
    "allow_fork_syncing": true
  }
  JSON
  ```

  Notes on the chosen settings:
  - `enforce_admins: false` keeps a break-glass path for the coordinator (you can still emergency-push if a workflow hangs). Flip to `true` post-launch.
  - `required_pull_request_reviews: null` means "PR required but no human reviewer required" — solo-dev workflow. The status checks are the actual gate.
  - `required_status_checks.strict: true` forces branches to be up-to-date with `main` before merge (no stale merges).
  - `required_linear_history: true` requires squash- or rebase-merge — no merge commits cluttering history.
  - `build-image` is intentionally NOT in the required contexts — it only runs on tag push, never on PRs.

- **Verification:** `gh api "repos/$REPO/branches/main/protection" -q '.required_status_checks.contexts'` returns `["lint-and-typecheck", "test"]`; `git push origin main` from a fresh local commit is rejected with `protected branch hook declined`; the same commit pushed to a branch + opened as a PR succeeds and gates on CI.

### Step 2.6 — Update root `CLAUDE.md` with PR-flow + versioning rules

- **Action:** append a new section `## Pull-request flow (NORMATIVE)` to `CLAUDE.md` at the repo root, right after the "Test-DB rule (NORMATIVE)" section. Wording (verbatim):

  ```markdown
  ## Pull-request flow (NORMATIVE)

  From PLAN-009 Step 2.5 onward, `main` is **branch-protected**. Direct push to `main` is rejected by GitHub. Every code change — from the coordinator and from execution / validation agents alike — follows this flow:

  1. Create a branch (`plan-NNN-execution`, `plan-NNN-validation`, `fix-…`, `chore-…`, etc.).
  2. Push the branch and open a PR against `main`.
  3. Wait for required status checks (`lint-and-typecheck`, `test`) to go green.
  4. Squash-merge (linear history is required; no merge commits).

  Hot-fixes that bypass CI are a coordinator-only break-glass — agents must never `gh pr merge --admin` or push to `main` directly.

  ## Release versioning (release-please)

  Docker images are released by tag, not by commit:

  - Day-to-day commits use **conventional-commit prefixes** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`). The CI workflows ignore the prefix, but release-please reads it to compute version bumps.
  - When changes land on `main`, the **release-please** GitHub Action opens (or updates) a release PR titled `chore(main): release vX.Y.Z` with a generated CHANGELOG and a bumped `version` field in the root `package.json`.
  - Merging the release PR creates a `vX.Y.Z` git tag. The CI `build-image` job triggers on that tag and pushes `ghcr.io/thaynes43/todos-for-dues:vX.Y.Z` and `:latest`.
  - **Bump rules** (SemVer, derived from conventional commits):
    - `feat:` → minor bump (`v1.2.0` → `v1.3.0`)
    - `fix:` → patch bump (`v1.2.0` → `v1.2.1`)
    - `feat!:` or a `BREAKING CHANGE:` footer → major bump (`v1.2.0` → `v2.0.0`)
    - `chore:`, `docs:`, `refactor:`, `test:` → no bump (changelog-only)
  - The `:latest` Docker tag always points at the most recent SemVer release. The init container in PLAN-009 Step 5 pins a specific version, not `:latest`, so production deploys are reproducible.
  ```

- **Verification:** `grep -n "Pull-request flow (NORMATIVE)" CLAUDE.md` and `grep -n "Release versioning (release-please)" CLAUDE.md` both return one match; `git diff` shows only an addition to `CLAUDE.md`.

### Step 2.7 — Wire release-please for SemVer Docker tagging

- **Action:**
  1. Add `.github/workflows/release-please.yml`:

     ```yaml
     name: release-please
     on:
       push:
         branches: [main]
     permissions:
       contents: write
       pull-requests: write
     jobs:
       release:
         runs-on: ubuntu-latest
         steps:
           - uses: googleapis/release-please-action@v4
             with:
               release-type: node
               package-name: todos-for-dues
     ```

  2. Add a `release-please-config.json` at repo root (release-please v4 prefers explicit config):

     ```json
     {
       "release-type": "node",
       "packages": {
         ".": {
           "package-name": "todos-for-dues",
           "changelog-sections": [
             { "type": "feat", "section": "Features" },
             { "type": "fix", "section": "Bug Fixes" },
             { "type": "perf", "section": "Performance" },
             { "type": "refactor", "section": "Refactors" },
             { "type": "docs", "section": "Documentation", "hidden": false },
             { "type": "test", "section": "Tests", "hidden": true },
             { "type": "chore", "section": "Chores", "hidden": true }
           ]
         }
       }
     }
     ```

  3. Add a `.release-please-manifest.json` at repo root with the current version (start at `0.1.0`):

     ```json
     { ".": "0.1.0" }
     ```

  4. Update root `package.json` to include `"version": "0.1.0"` (release-please's `node` release-type expects to update this file).
  5. Update `.github/workflows/ci.yml`'s `build-image` job to trigger ONLY on `push: { tags: ['v*.*.*'] }` (per Step 2 above). The `release-please` workflow creates the tag; CI picks it up; image is pushed with `:vX.Y.Z` and `:latest`.

- **Verification:**
  - Open a PR with a `feat:` commit; merge it. Release-please opens a release PR within 1–2 minutes titled `chore(main): release v0.2.0` (or appropriate bump).
  - Merge that release PR. Confirm: (a) a `v0.2.0` tag exists (`git tag --list 'v*'`); (b) the `build-image` job runs against the tag; (c) `ghcr.io/thaynes43/todos-for-dues:v0.2.0` and `:latest` are pushed.
  - Pull the image locally as a smoke (`docker pull ghcr.io/thaynes43/todos-for-dues:v0.2.0`).

### Step 3 — Provision per-instance Postgres in cluster16

- **Action:** in haynes-ops, add a `postgres-cluster.yaml` (or extend an existing one) that creates a `todos_for_dues` database + role within the existing CloudNative-PG `cluster16`. Provide the connection string via External Secrets.
- **Verification:** `kubectl exec -it cluster16-1 -- psql -U todos_for_dues_user -d todos_for_dues -c '\dt'` succeeds (returns empty — schema lands on first app boot via Drizzle migrate).

### Step 4 — External Secrets

- **Action:** add `external-secrets.yaml` referencing 1Password items for each required env var. Test that the secret is created in the namespace.
- **Verification:** `kubectl get secret todos-for-dues-secrets -o yaml` shows the data fields.

### Step 5 — Deployment + Service + IngressRoute

- **Action:** deployment.yaml uses the GHCR image **pinned to a specific `:vX.Y.Z` tag** (per Step 2.6 / 2.7 — never `:latest` in production deploys, so a rollback is `git revert` of the haynes-ops manifest), mounts the External Secret as env vars, and runs a one-time migrate init container before the main app container starts. **Per PLAN-002:** the migrate command is `pnpm --filter @app/db migrate` (a `tsx`-based wrapper at `packages/db/src/scripts/migrate.ts` that wires `BOOTSTRAP_*` env → `app.bootstrap_*` GUCs via `set_config()` before invoking the drizzle-orm migrator) — NOT the raw `drizzle-kit migrate` CLI. The init container therefore needs (a) `tsx` available in its image (either keep it in `node_modules` rather than stripping during the Next.js standalone build, OR use a separate smaller migrator-image multi-stage); (b) `DATABASE_URL` + all five `BOOTSTRAP_*` env vars (`BOOTSTRAP_ADMIN_RECIPIENT_EMAIL`, `BOOTSTRAP_TREASURER_RECIPIENT_EMAIL`, `BOOTSTRAP_MODERATORS_RECIPIENT_EMAIL`, `BOOTSTRAP_CHAPTER_TIMEZONE`, `BOOTSTRAP_CHAPTER_DISPLAY_NAME`) from the same External Secret — without them, `chapter_settings` seeds the `*.invalid` placeholder values per DESIGN-001 §5.5 and the first email send will misfire. Service exposes port 3000. IngressRoute wires Traefik internal with a cert from the cluster issuer.
- **Verification:** `kubectl get pods -n frontend` shows the app pod Running; the init container completed (Phase: Succeeded); `kubectl exec … -- psql -d todos_for_dues -c 'SELECT key, value FROM chapter_settings'` shows the five MVP keys with real (not `*.invalid`) values; `https://todos-for-dues.haynesops.com` loads.

### Step 6 — Bootstrap admin + first invite link

- **Action:** set `BOOTSTRAP_ADMIN_EMAIL` to your email; sign in once (via Workspace SSO or app-managed signup with an invite token created via direct DB insert as a one-time bootstrap); generate Active + Alumni invite links via the Admin UI (or `invites.generate` tRPC procedure).
- **Verification:** Admin role is set; invite links generated.

### Step 7 — Smoke test the deployed instance

- **Action:** click through the walking-skeleton happy path against the deployed URL. Should mirror PLAN-008's E2E.
- **Verification:** loop closes; treasurer email lands in test inbox (or shows in Resend dashboard).

### Step 8 — Commit (both repos)

- **Action:** commit Dockerfile + CI in this repo; commit haynes-ops manifests in the haynes-ops repo (separate PR if user uses PR workflow there).

## 5. Verification

- [ ] CI green on PRs (`lint-and-typecheck` + `test`); `build-image` job is dormant until a tag push.
- [ ] Branch protection on `main` is active — `git push origin main` from a fresh local commit rejected; same commit via PR succeeds after CI.
- [ ] Root `CLAUDE.md` contains the "Pull-request flow (NORMATIVE)" and "Release versioning (release-please)" sections.
- [ ] release-please opens a release PR after a `feat:` / `fix:` PR merges; merging the release PR creates a `vX.Y.Z` tag; CI builds and pushes `ghcr.io/thaynes43/todos-for-dues:vX.Y.Z` + `:latest`.
- [ ] Pod Running; URL reachable. The deployment manifest in haynes-ops references the same `:vX.Y.Z` (NOT `:latest`).
- [ ] Walking-skeleton smoke test passes against deployed instance.
- [ ] Commits land via PRs (one PR per logical step from §3 Outputs); no direct push to `main` from PLAN-009 onward.

## 6. Out of scope

- Phase 1.2 external (`*.haynesnetwork.com` via cloudflare-tunnel) — separate plan once Phase 1.1 is stable.
- Multi-instance / multi-chapter (post-MVP).
- Observability (logs, metrics, traces) — defer; haynes-ops cluster has cluster-wide observability.
- Backup / restore (cluster-level concern).

## 7. Risks & gotchas

- **Risk:** `pnpm --filter web build` inside the Dockerfile (Step 1) requires `DATABASE_URL` to be set at build time if `packages/db/src/index.ts` throws eagerly at module load (Next.js's build-time module trace executes top-level code in API route imports). **Mitigation:** PLAN-002 Step 0 refactors the db client to a Proxy-based lazy `db` — the throw is deferred to first DB access, so the Docker build stage works without `DATABASE_URL`. **Confirm before building the image:** `unset DATABASE_URL && pnpm --filter web build` exits 0 locally (the VALIDATION-002 §6 gate). If for any reason that gate has regressed, pass a dummy `DATABASE_URL=postgres://dummy:dummy@dummy:5432/dummy` to the Docker build arg as a fallback — but the lazy-Proxy fix should make that unnecessary.
- **Risk:** Drizzle migrate init container fails (e.g., DB unreachable on first boot). **Mitigation:** init container retries with exponential backoff; pod startup probe includes a "migrations applied" check.
- **Risk:** Workspace OIDC requires the redirect URI to match exactly. **Mitigation:** configure `OIDC_REDIRECT_URI=https://todos-for-dues.haynesops.com/api/auth/callback/oauth/google-workspace` in Workspace admin AND the env var.
- **Risk:** Better Auth's secret rotation / cookie domain. **Mitigation:** verify `BETTER_AUTH_SECRET` set via External Secrets; cookie domain matches IngressRoute hostname.
- **Risk:** Resend domain verification — emails to test inboxes may bounce until the sending domain is verified. **Mitigation:** verify the Resend sending domain before generating the first invite link; or use a known-deliverable test recipient.

## 8. Resume points

- After Step 1: Dockerfile builds locally.
- After Step 2: CI workflow on PRs.
- After Step 2.5: branch protection active on `main`.
- After Step 2.6: `CLAUDE.md` documents the PR flow + versioning rules.
- After Step 2.7: release-please opens release PRs; tags trigger image build.
- After Step 5: pod live.
- After Step 7: smoke test pass.
- After Step 8: committed.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Internal-domain hostname: `todos-for-dues.haynesops.com` or `t4d.haynesops.com`? | Lean: full name for clarity. |
| Q-PLN-02 | Single replica or 2-replica HA from day one? Lean: **single replica** for Phase 1.1 internal — HA can come with Phase 1.2. | Single replica; simple rolling-restart strategy. |
| Q-PLN-03 | Migrations: init container vs. CI-driven `pnpm drizzle-kit migrate` from a one-shot Job? Lean: **init container** so app + DB stay versioned together; deploy = migrate. | Init container. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. 8 steps from Dockerfile to a running internal deploy + smoke-tested walking skeleton. |
| 2026-05-14 | Tom Haynes | Plan-decomposition pass: frontmatter `related.plans` reshaped to `{prerequisite, lateral}` with VALIDATION-009 paired. PLAN-009 deploys the walking-skeleton (PLAN-001..008); PLAN-010/011/012 (MVP UI rest) ship via the same CI pipeline as subsequent deploys without separate plans. |
| 2026-05-14 | Tom Haynes | Added §7 risk + mitigation for the `pnpm --filter web build` requires `DATABASE_URL` issue surfaced during VALIDATION-001. PLAN-002 Step 0 now refactors `packages/db/src/index.ts` to a lazy Proxy so the Docker build stage works without env vars. Fallback documented if the gate regresses. |
| 2026-05-14 | Tom Haynes | Step 5 updated post-PLAN-002 execution: migrate command is now `pnpm --filter @app/db migrate` (tsx wrapper at `packages/db/src/scripts/migrate.ts`), not raw `drizzle-kit migrate`. Init container therefore needs tsx in its image AND the 5 `BOOTSTRAP_*` env vars (the GUC plumbing for chapter_settings seeding from DESIGN-001 §5.5) — without them the first email send misfires on `*.invalid` placeholders. Verification gate added: confirm chapter_settings rows hold real values post-deploy. |
| 2026-05-15 | Tom Haynes | Three new steps inserted between Step 2 and Step 3 to flip the project from develop-on-main to PR-gated workflow: Step 2.5 (branch protection on `main` via `gh api`, requiring lint-and-typecheck + test status checks, linear history, no force-push, no direct push to `main` — `enforce_admins: false` keeps a coordinator break-glass), Step 2.6 (root `CLAUDE.md` gains "Pull-request flow (NORMATIVE)" + "Release versioning (release-please)" sections so every agent reads the new rules), Step 2.7 (release-please v4 wiring — conventional commits drive SemVer bumps, release PRs auto-open on `main` push, merging the release PR creates a `vX.Y.Z` tag, CI's `build-image` job runs ONLY on tag push). Step 2's `build-image` trigger narrowed to tags only. §3 Outputs split the single original commit into per-PR commits since branch protection lands mid-plan. §5 verification expanded with PR-flow + release gates. §3 Step 5 deployment now pins a specific `:vX.Y.Z` (never `:latest` in production). §8 resume points add the three new sub-steps. |
| 2026-05-17 | Tom Haynes | **Post-execution reconciliations from the first deploy** (commits PR #1–#8 on the SaaS repo + PRs #1769–#1772 on the haynes-ops repo; deployed image is `ghcr.io/thaynes43/todos-for-dues:v0.2.2`). Captured here so the next chapter deploy doesn't repeat the same dead-ends. (1) **OIDC callback URI**: §7 (and the matching execute kickoff prompt §Trap 8/9) cited `${BETTER_AUTH_URL}/api/auth/callback/oauth/${providerId}` — wrong. Better Auth 1.6.x's `genericOAuth` plugin actually uses `${BETTER_AUTH_URL}/api/auth/oauth2/callback/${providerId}`. The Google Cloud Console redirect URI registration must match the latter; with the former, the OAuth callback completes server-side but the browser bounces back to `/login`. (2) **`users.image` column missing**: Better Auth's `genericOAuth` profile-mapping writes the OIDC `picture` claim into `users.image` unconditionally; PLAN-002's original schema didn't include it. Fixed by migration `0007_users_add_image.sql` (PR #6); DESIGN-001 §4.2 + PLAN-002 changelog updated 2026-05-17. (3) **min-Admin trigger fires on INSERT**: PLAN-002's `0003_min_admin_trigger.sql` asserted `count(admins) >= 1` on every INSERT, blocking the first user-row insert of a fresh chapter (mapProfileToUser returns `'Alumni'` for SSO; promote-to-Admin hook fires AFTER the row exists). Fixed by `0008_fix_min_admin_trigger_bootstrap.sql` (PR #7); DESIGN-001 §5.3 + PLAN-002 changelog updated 2026-05-17. (4) **Node fetch IPv6-first vs cluster IPv4-only egress**: cluster16 has no IPv6 egress; Node's Happy-Eyeballs IPv6-first preference timed out the OAuth token-exchange fetch before falling back to IPv4. Fixed in haynes-ops by setting `NODE_OPTIONS=--dns-result-order=ipv4first` in the Deployment env (PR #1771). Worth flagging in the runbook PLAN-013 will produce. (5) **`RESEND_FROM_ADDRESS` env var**: `packages/notifications/src/send-email.ts` defaults the FROM header to an unverified placeholder; the chapter's verified Resend sending domain is `sigoalumni.org`, so the first `markPaymentSent` email failed delivery silently. Fixed in haynes-ops by setting `RESEND_FROM_ADDRESS=noreply@sigoalumni.org` in External Secrets (PR #1772). Follow-up flagged: `send-email.ts` should fail-fast at boot if `NODE_ENV === 'production'` and the var is missing or matches the placeholder — defer to PLAN-013 or a fix PR. (6) **Playwright not run in CI**: the GHA `test` job runs only vitest; PLAN-006 + PLAN-008 Playwright specs run LOCALLY only. The execute agent compensated by running the canonical PLAN-008 walking-skeleton manually against the deployed URL via Playwright MCP and verified the audit log + Resend deliveries directly in production. Wiring Playwright into CI is a documented follow-up (likely PLAN-013 or a dedicated plan — needs a testcontainers PG attachable via Playwright's `webServer.env`). Cross-plan invariant: PLAN-005 integration tests + the static-analysis no-direct-state-writes check still run on every PR and remain green. (7) **GHCR package visibility flipped to public** manually via the web UI (no API endpoint); future tagged releases inherit. One-time setup per repo. Dockerfile target shape: single image with the migrator co-located (`/app` for Next.js standalone + `/migrator` for the `pnpm --filter @app/db deploy --legacy --prod` subtree + globally-installed `tsx@4.21.0`). Init container `command: ["tsx","/migrator/src/scripts/migrate.ts"]`; main container default CMD `node apps/web/server.js`. ~50MB size cost over a split runtime/migrator image; chosen for ops simplicity (one image to pin). |
