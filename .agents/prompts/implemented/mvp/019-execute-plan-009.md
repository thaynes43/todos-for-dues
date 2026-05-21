# Prompt for Claude Code agent — Execute PLAN-009 (deploy prototype + branch protection + PR flow + release-please)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). **Current state:** PLAN-001..008 are committed, green, and locally verified. PLAN-008 added the canonical walking-skeleton chained Playwright spec + in-process OIDC mock + 4 SSO specs + `nextCookies` plugin + per-spec test isolation + Resend test seam. The app is **ready to deploy**.

PLAN-009 is the **first production-ish deployment** to the user's `haynes-ops` Kubernetes cluster (Phase 1.1 internal — `*.haynesops.com` LAN only; Phase 1.2 public via Cloudflare tunnel is post-REL-001). It bundles five distinct concerns into one plan because they are inter-dependent:

1. Multi-stage **Dockerfile** + Next.js standalone build.
2. **GitHub Actions CI** workflow (lint/typecheck/test on PRs; image build on tag push only).
3. **Branch protection on `main`** via `gh api` (first time the project is gated; everything after is PR-flow).
4. **CLAUDE.md** updates documenting the new PR-flow + release-please versioning rules.
5. **release-please v4** wiring (conventional commits drive SemVer bumps; merging release PRs creates `vX.Y.Z` tags; tags trigger GHCR image push).
6. **haynes-ops Kubernetes manifests** (kustomize: Deployment + Service + IngressRoute + External Secrets + per-instance Postgres database on `cluster16`).
7. **Bootstrap + smoke test** the deployed instance.

## Working directories

- **This repo:** `/Users/thaynes/src/projects/todos-for-dues`
- **haynes-ops GitOps repo:** `~/src/labspace/haynes-ops/` (per the user's `reference_external_systems.md` memory). You will write manifest changes there and commit them; the user pushes (SSH agent may be locked).

## Your task

Execute `docs/plans/009-deploy-prototype.md` end-to-end (Steps 1 → 8 including the new sub-steps 2.5 / 2.6 / 2.7), then verify against `docs/plans/009-deploy-prototype-validation.md` §6 pass/fail gates. The plan doc is detailed; this prompt focuses on the cross-step gotchas and the PR-flow ordering question.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. The `reference_external_systems.md` entry is the canonical pointer to the `haynes-ops` repo path + Grafana MCP setup; the test-DB rule (PG16 via testcontainers) still applies to CI's `pnpm test` job.
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root project context. You will be appending two new sections to this file in Step 2.6.
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — "This is NOT the Next.js you know." **Heavily relevant for Step 1** — Next.js 16's `output: 'standalone'` config + the run command + `node_modules` layout in the runtime stage may differ from your training-data Next.js 13/14 knowledge. Read `node_modules/next/dist/docs/` (or the `next.config.mjs` documentation + the standalone-output section specifically) before writing the Dockerfile.
4. `docs/plans/009-deploy-prototype.md` — the plan. §3 Outputs (the 5 commit messages you'll produce in this repo + 1 in haynes-ops), §4 Steps 1–8 with sub-steps 2.5/2.6/2.7, §5 verification gates, §7 risks (including the Dockerfile-needs-DATABASE_URL one), §9 Q-PLN-NN (resolved leans).
5. `docs/plans/009-deploy-prototype-validation.md` — the gate list you'll be measured against.
6. `docs/adrs/006-hosting.md` — cluster design + Flux pipeline + Phase 1.1 vs 1.2 split. The internal-domain convention is `*.haynesops.com`.
7. `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/homepage/` — the **pattern to mirror** for your new `kubernetes/main/apps/frontend/todos-for-dues/` directory. Read every file there + the parent `kustomization.yaml` chain to understand the deployment + service + ingressroute + external-secrets idioms this cluster uses.
8. `docs/designs/004-auth-wiring.md` (relevant sections) — for the Better Auth OIDC redirect URI + the `OIDC_HOSTED_DOMAIN` env var the chapter's Workspace requires. PLAN-008 made `OIDC_DISCOVERY_URL` test-overridable; **production must NOT set this env var** (it defaults to Google's production discovery URL).
9. `packages/db/src/scripts/migrate.ts` — the **init container's actual entrypoint** per PLAN-002. It's a `tsx`-based wrapper that wires `BOOTSTRAP_*` env vars → `app.bootstrap_*` Postgres GUCs via `set_config()` before calling Drizzle's migrator. **The init container needs `tsx` available AND all 5 `BOOTSTRAP_*` env vars present in External Secrets** or `chapter_settings` seeds the `*.invalid` placeholders (DESIGN-001 §5.5) and the first treasurer email misfires.

**What's already in the repo you can rely on:**
- `apps/web/next.config.mjs` — exists; you'll add `output: 'standalone'`.
- `packages/db/src/scripts/migrate.ts` — the tsx-based migrator wrapper (PLAN-002).
- The `db` Proxy in `packages/db/src/index.ts` — lazy-initializes the pg `Pool` on first access, so `pnpm --filter web build` exits 0 without `DATABASE_URL` set (PLAN-009 §7 risk mitigation).
- `apps/web/app/api/test/resend-calls/route.ts` from PLAN-008 — the test-only Resend recorder route. Production deploys do NOT set `RESEND_TEST_MODE=true`; verify the route returns 404 on the deployed instance.

## What you do NOT do

- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans, DDD) **except** the changelog at the bottom of `docs/plans/009-deploy-prototype.md` if you need to record a deviation. If a step blocks on a design ambiguity, **escalate to the user** — do not improvise architectural decisions.
- Do not flip `enforce_admins: true` in the branch-protection ruleset. The plan deliberately keeps it `false` as a coordinator break-glass. Flipping post-launch is a separate decision.
- Do not put the `build-image` job behind the required-status-checks list. It only runs on tag push; required checks must be names that ALWAYS run on PRs. (Names `lint-and-typecheck` + `test`.)
- Do not push to remote on this repo — **the user pushes** (SSH agent may be locked). After each commit, tell the user "ready to push" and pause. Same for the haynes-ops repo.
- Do not set `OIDC_DISCOVERY_URL` in the production env. It must default to Google's production URL.
- Do not set `RESEND_TEST_MODE=true` in production. The test-only route must return 404 on the deployed instance.
- Do not commit secrets to either repo. Real secrets live in 1Password Connect; the `external-secrets.yaml` only **references** them by name.
- Do not delete any existing External Secrets or kustomize manifests in `haynes-ops` to "start clean" — investigate first if you see unexpected state.
- Do not substitute the test DB engine in CI. The GHA `test` job uses testcontainers PG16 per ADR-004. The runner has Docker; that's enough.
- Do not amend an already-pushed commit. New commits only.
- **Do not assume the OS or shell.** The cluster + GHCR + GHA flows have specific authentication contexts; if a `gh` or `docker` or `kubectl` command needs credentials you don't have, **stop and ask the user**.

## The PR-flow ordering question (READ CAREFULLY)

PLAN-009 is the **first plan that flips this project from develop-on-main to PR-flow**. The order is forced by the dependency chain:

1. **Step 1 (Dockerfile)** — direct commit to `main`. Branch protection is not yet on; opening a PR would have nothing to gate against (CI doesn't run on PRs until Step 2 lands).
2. **Step 2 (CI workflow)** — direct commit to `main`. Same reason; required status checks don't exist as named contexts in GitHub's view until at least one PR triggers them. (Acceptable: GitHub records the context name when the workflow first runs; a PR is fine for that, but a push-to-main also triggers `push: [main]` workflows.)
3. **Step 2.5 (branch protection)** — direct commit to `main`. THIS IS THE LAST DIRECT PUSH. The `gh api PUT` call is the "switch flip" — after this, `git push origin main` from this checkout is rejected.
4. **Step 2.6 (CLAUDE.md updates)** — **via PR** (`docs(claude): PR flow + release-please versioning rules`). Branch name suggestion: `plan-009-pr-flow-docs`. Open PR; wait for CI green (lint-and-typecheck + test); squash-merge.
5. **Step 2.7 (release-please)** — **via PR** (`chore(release): wire release-please v4 + initial 0.1.0 manifest`). Branch suggestion: `plan-009-release-please`.
6. **Step 1's content was already merged direct in §1 above** — no PR for it. But: if you've decided to also PR Step 1 (Dockerfile) for symmetry, that's fine, just do it BEFORE 2.5 lands so direct push is still legal. **Pick one approach and stick to it; document in the commit body.**

**Lean: minimize "one last direct push" surface area.** Land Steps 1, 2, and 2.5 as three SEPARATE direct commits (not one squashed commit) — this preserves a clean per-feature history and matches §3 Outputs' per-commit list. Then PR everything from Step 2.6 onward.

After Step 2.5, the act of pushing the next commit will exercise the protection rule. Verify:

```sh
git push origin main  # MUST fail with "protected branch hook declined"
```

If it succeeds, the `gh api PUT` call didn't take effect — re-check the JSON body + status-check context names.

## Specific traps to watch for

**Trap 1 — Next.js 16 standalone output: the build emits a `.next/standalone/` directory; what goes in the runtime image is NOT what you expect.**
Read `node_modules/next/dist/docs/` for the standalone-output section. Key gotchas:
- The standalone output trees the minimum subset of `node_modules` it needs. Workspaces like ours sometimes need extra symlinks or `outputFileTracingRoot` set (look for it in `next.config.mjs`).
- `public/` and `.next/static/` are NOT auto-copied into `standalone/` — you must copy them manually in the Dockerfile.
- The runtime command is `node apps/web/.next/standalone/apps/web/server.js` (path nested twice because of the workspace root). Verify by running `pnpm --filter web build` locally and listing the standalone tree.
- The init container that runs migrations does NOT use the standalone output — it needs `tsx` + `packages/db` source. Either keep `tsx` + the db package in the migrator-image, OR multi-stage the Dockerfile to produce two distinct image targets: `runtime` (standalone) and `migrator` (full workspace + tsx). The plan doc's §5 leaves this implementation detail open; **lean: single image with `tsx` retained in `node_modules` so the init container reuses the same image with a different command** — simpler ops at the cost of a slightly larger image.

**Trap 2 — Dockerfile build without DATABASE_URL.**
PLAN-002's lazy `db` Proxy makes `pnpm --filter web build` exit 0 without `DATABASE_URL`. Verify BEFORE building the Docker image:

```sh
unset DATABASE_URL && pnpm --filter web build
```

If that exits non-zero (the lazy-Proxy fix regressed), DO NOT paper over it with a build-arg `DATABASE_URL=postgres://dummy:dummy@dummy:5432/dummy` — **escalate.** A regression there breaks the deploy promise that schema + connection details are runtime concerns.

**Trap 3 — Required status checks must match GHA job names EXACTLY.**
Step 2.5's `gh api PUT` lists `["lint-and-typecheck", "test"]`. Step 2's `.github/workflows/ci.yml` must define jobs with EXACTLY those names (the `jobs:` keys, not the `name:` labels which can drift). Off by a hyphen or case mismatch → PRs hang forever waiting for status checks that never report. Verify after Step 2 lands by opening a throwaway PR + watching the Checks tab.

Also: GitHub only knows about a status-check context after it has run at least once on the repo. **Run CI on a PR (or one push-to-main) before flipping branch protection in Step 2.5.** A typical pattern: Step 2 commits the workflow + creates a tiny throwaway PR (or pushes once to main) to make GitHub register the contexts; then Step 2.5 enables protection referencing them.

**Trap 4 — `build-image` job trigger scope.**
Two correct shapes:
- Workflow-level `on: { push: { tags: ['v*.*.*'] } }` — entire workflow only runs on tag push. Cleanest if `build-image` is its own workflow file.
- Job-level `if: startsWith(github.ref, 'refs/tags/v')` — same workflow as lint/test/typecheck but the job is gated. Acceptable but easier to forget the gate.

**Lean: separate workflow** (`.github/workflows/build-image.yml`) so the trigger is workflow-level and impossible to accidentally re-run. The plan doc §3 suggests a single `ci.yml`; you can keep it single if you prefer (it's smaller infra), but the trigger gate must be airtight.

**Trap 5 — release-please v4 config.**
`release-please-action@v4` reads `release-please-config.json` + `.release-please-manifest.json` at repo root. The manifest's `"."` key must match the path in the config's `"packages"` map. Initial manifest: `{ ".": "0.1.0" }`. Initial `package.json` (root) gains `"version": "0.1.0"`. After the first merged PR that contains a `feat:` or `fix:` commit on `main`, release-please opens a release PR within ~2 min — verify it titles "chore(main): release v0.2.0" (or appropriate bump) and includes a generated CHANGELOG.

If release-please never opens a release PR:
1. Check the `release-please` workflow run — common failure: missing `permissions: { contents: write, pull-requests: write }` block.
2. Check the action token has write access to the repo (default `secrets.GITHUB_TOKEN` works if permissions are set).
3. Confirm at least one commit on `main` matches a release-relevant conventional-commit type (`feat`, `fix`, `feat!`, `BREAKING CHANGE:`). If only `chore:` / `docs:` / `test:` commits have landed, release-please will not bump.

**Trap 6 — release-please's release PR triggers `build-image` via the resulting tag, not via the merge.**
The flow is two-step: (a) release-please opens a release PR → you merge it → (b) release-please creates a `vX.Y.Z` tag → (c) the tag push triggers `build-image`. If you forget step (b), CI never builds. Confirm:
```sh
git fetch --tags && git tag --list 'v*'  # should show the new tag after merging the release PR
```

**Trap 7 — haynes-ops Postgres provisioning: CloudNative-PG cluster16 already exists.**
Read `~/src/labspace/haynes-ops/kubernetes/main/databases/` (or wherever cluster16 is declared) to confirm the convention for adding a new database + role. **Do NOT create a new Postgres cluster** — use `cluster16` (per ADR-006). Patterns to look for: a `Database` CRD, or an `apps_db_init` Job that runs `CREATE DATABASE ... ; CREATE ROLE ...`, or a kustomize overlay that extends cluster16's bootstrap section.

If no obvious pattern exists, **escalate to the user** with what you found — don't invent the schema for a new resource.

**Trap 8 — External Secrets: SecretStore name + 1Password Connect item path.**
The cluster has a SecretStore (likely `1password-connect` or `cluster-secret-store-name-here`). Read existing `external-secrets.yaml` files in `haynes-ops` to confirm:
- The exact `SecretStore` name + `kind`.
- The 1Password vault + item naming convention (vault path / item title / field name).
- Whether items are referenced by ID or by title.

The 12+ secrets needed:
- `DATABASE_URL` (assembled from cluster16's app credentials)
- `BETTER_AUTH_SECRET`
- `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_HOSTED_DOMAIN`
- `BOOTSTRAP_ADMIN_EMAIL`
- All 5 `BOOTSTRAP_*` chapter-settings vars: `BOOTSTRAP_ADMIN_RECIPIENT_EMAIL`, `BOOTSTRAP_TREASURER_RECIPIENT_EMAIL`, `BOOTSTRAP_MODERATORS_RECIPIENT_EMAIL`, `BOOTSTRAP_CHAPTER_TIMEZONE`, `BOOTSTRAP_CHAPTER_DISPLAY_NAME`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET` (PLAN-007 added this — the Svix webhook signing secret)

If a secret doesn't exist yet in 1Password Connect, the user creates it manually before the deploy can complete; flag this in the commit body so the user has a checklist.

**Trap 9 — OIDC redirect URI registration.**
Better Auth's callback URL pattern is `${BETTER_AUTH_URL}/api/auth/callback/oauth/${providerId}` — for production: `https://todos-for-dues.haynesops.com/api/auth/callback/oauth/google-workspace`. The Workspace OIDC client (in Google Cloud Console / Workspace admin) MUST have this exact URL registered as an authorized redirect URI. **This is a user-side step** — you (the agent) can't access Workspace admin. **Flag this in your commit body** so the user can verify before the first sign-in attempt.

Also: set `BETTER_AUTH_URL=https://todos-for-dues.haynesops.com` in the External Secrets / Deployment env. Without it, Better Auth defaults to localhost and the callback fails.

**Trap 10 — Resend domain verification + webhook configuration.**
Two user-side ops:
- Resend's sending domain must be verified (DNS records added; SPF/DKIM passing). Until verified, emails to non-allowlisted recipients bounce. **Flag in commit body.**
- The Resend webhook (bounce/complaint) must be configured in the Resend dashboard to POST to `https://todos-for-dues.haynesops.com/api/webhooks/resend` with the matching `RESEND_WEBHOOK_SECRET` Svix secret. **Flag in commit body.**

**Trap 11 — Init container retry semantics.**
PLAN-009 §7 risks the init container failing on first boot if the Postgres pod isn't ready yet. Mitigation patterns:
- Kubernetes init containers retry on failure based on the Pod's restartPolicy.
- A robust pattern is a small shell wrapper in the init container: `until pnpm --filter @app/db migrate; do echo "Waiting for DB..."; sleep 5; done` with a max-attempts cap. OR rely on Kubernetes' restart-on-failure semantics.
- A startup probe on the main container checks for "migrations applied" — useful but not strictly needed at this scale; the init container's exit-0 is itself the gate.

**Trap 12 — Cross-plan invariant.**
After your work: `pnpm --filter @app/domain test no-direct-state-writes` MUST still exit 0. PLAN-009 introduces no production-code state writers; only Dockerfile + manifests + CI workflows. PLAN-003's static-analysis allowlist must NOT grow.

PLAN-005 integration tests + PLAN-006 per-page Playwright + PLAN-007 notifications + PLAN-008 chained walking-skeleton must all still pass — the new CI workflow MUST run all of them on PRs (`pnpm test` at the repo root recurses into every package with a `test` script; that's the right hook).

**Trap 13 — `pnpm-lock.yaml` discipline in PRs.**
Adding deps (release-please's actions don't add deps to this repo; no new pnpm deps expected). If you DO add a dep (e.g., for the Docker build helper), commit `pnpm-lock.yaml` alongside `package.json`. Branch protection's required `test` job runs `pnpm install --frozen-lockfile` — a stale lockfile fails CI.

## Definition of done

Every box in VALIDATION-009 §6 green:

- [ ] **Dockerfile builds locally:** `docker build -t todos-for-dues:dev .` exits 0; `docker run --rm -p 3000:3000 -e DATABASE_URL=postgres://… todos-for-dues:dev` boots the server (manual smoke).
- [ ] **CI workflow runs on PRs:** open a throwaway PR; `lint-and-typecheck` + `test` jobs run and go green; `build-image` does NOT run on PRs.
- [ ] **Branch protection active:** `gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/main/protection" -q '.required_status_checks.contexts'` returns `["lint-and-typecheck", "test"]`; `required_linear_history` is `true`; `git push origin main` from a fresh commit is rejected with `protected branch hook declined`.
- [ ] **CLAUDE.md updated:** the "Pull-request flow (NORMATIVE)" and "Release versioning (release-please)" sections present (verbatim per PLAN-009 §4 Step 2.6); landed via PR.
- [ ] **release-please workflow active:** a `feat:` PR merged to `main` triggers an automatic release PR within ~2 min; merging that release PR creates a `vX.Y.Z` tag (verified with `git fetch --tags && git tag --list 'v*'`); the `build-image` job runs against the tag and pushes `ghcr.io/thaynes43/todos-for-dues:vX.Y.Z` + `:latest` to GHCR.
- [ ] **All PLAN-009 commits in this repo landed via the documented mix:** Step 1 + Step 2 + Step 2.5 direct to main (3 separate commits); Step 2.6 + Step 2.7 + any subsequent fix-up via PRs that pass the required status checks. `git log --first-parent main --oneline` should make the transition obvious.
- [ ] **haynes-ops manifests committed** under `kubernetes/main/apps/frontend/todos-for-dues/`: `kustomization.yaml`, `deployment.yaml` (image pinned to `:vX.Y.Z`, NOT `:latest`), `service.yaml`, `ingressroute.yaml`, `external-secrets.yaml`, plus whatever per-instance Postgres config matches cluster16's pattern. One commit: `feat: deploy todos-for-dues frontend internal`.
- [ ] **Pod Running:** `kubectl get pods -n frontend` shows the `todos-for-dues` pod Ready within 5 min of Flux reconciliation; the init container completed (Phase: Succeeded).
- [ ] **Migrations applied:** `kubectl exec -n cluster16-system cluster16-1 -- psql -U todos_for_dues_user -d todos_for_dues -c '\dt'` returns ≥7 tables; `chapter_settings` has 5 rows with real values (not `*.invalid`).
- [ ] **Deployment image pinned to `:vX.Y.Z`:** `kubectl get deployment -n frontend todos-for-dues -o jsonpath='{.spec.template.spec.containers[0].image}'` matches the release-please tag.
- [ ] **IngressRoute reachable:** `curl -s -o /dev/null -w '%{http_code}' https://todos-for-dues.haynesops.com/` returns 200.
- [ ] **Auth handler wired:** `curl https://todos-for-dues.haynesops.com/api/auth/sign-in/email -X POST -d '{}' -H 'content-type: application/json'` returns a Better Auth 4xx (not 5xx, not 404).
- [ ] **tRPC handler wired:** `curl 'https://todos-for-dues.haynesops.com/api/trpc/users.getSession?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D'` returns a valid tRPC response shape (unauth → null user).
- [ ] **Test routes 404 in prod:** `curl -s -o /dev/null -w '%{http_code}' https://todos-for-dues.haynesops.com/api/test/resend-calls` returns 404 (confirms `RESEND_TEST_MODE` is NOT set in prod).
- [ ] **Bootstrap admin path:** the user signs in once as `BOOTSTRAP_ADMIN_EMAIL` (via Workspace SSO); the user is auto-promoted to Admin role; the user lands on `/` (not an error page).
- [ ] **Walking-skeleton smoke against deployed URL:** the user clicks through the happy path (Alumni posts → Moderator approves → 2 Actives enroll → Alumni locks → Alumni completes → Alumni mark-payment-sent → 1 Active confirms received → state `closed`); treasurer email appears in Resend dashboard.
- [ ] **Cross-plan invariants:** `pnpm --filter @app/domain test no-direct-state-writes` exit 0; IGNORE_DIRS unchanged; PLAN-005..008 test suites all still pass on the new CI runner.
- [ ] **Repo-wide `pnpm -r typecheck` + `pnpm test` + `pnpm --filter web build`** all exit 0 in the new CI workflow.

Report back (under 350 words): list of commits in this repo (with hashes), commit hash in haynes-ops, anything escalated, **the explicit "first PR-merged" hash + the release-please-generated tag + the GHCR image URL**, the chosen Dockerfile target shape (single image with tsx retained, or split runtime/migrator), explicit confirmation that (1) PLAN-003 static check passes on the new CI, (2) PLAN-005 integration tests pass on CI, (3) PLAN-006 + PLAN-008 Playwright pass on CI (or note if the new CI doesn't run Playwright and that's a documented choice), (4) the deployed instance smoke test passed end-to-end, (5) the pinned `:vX.Y.Z` deployment tag matches the release-please tag.

## If you get stuck

If a step's verification fails AND it's not obviously a copy-paste fix, **escalate to the user** with: (1) which step, (2) the exact error, (3) what you tried, (4) your lean. Do not invent infrastructure decisions. Do not modify any design or upstream plan.

Particular escalation candidates:
- haynes-ops' Postgres provisioning pattern is unclear (no obvious `Database` CRD or `apps_db_init` Job) — surface what you found; let the user point you at the right idiom.
- 1Password Connect items don't exist for one or more secrets — surface the list; the user creates them; you proceed.
- Workspace OIDC redirect URI registration is a user-side step — you can't access Workspace admin. Flag in commit body + post-execute report.
- Resend domain verification is a user-side step — flag.
- A required status check name in Step 2.5 doesn't match a job in Step 2's `ci.yml` — investigate before flipping protection (this is recoverable but easier to catch pre-flip).
- The first PR after branch protection (Step 2.6) hangs forever in CI — the context names are wrong; un-flip protection (you have `enforce_admins: false` break-glass), fix the names, re-flip.
- `build-image` job fails to push to GHCR — token permissions issue (`packages: write` permission needed on the workflow); flag.

**Heads-up about the user pushing:** after each commit on this repo (and the haynes-ops repo), tell the user "commit landed locally; ready to push" and pause. Do not invoke `git push` yourself.

Begin.
