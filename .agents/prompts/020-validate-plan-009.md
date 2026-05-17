# Prompt for Claude Code agent — Validate PLAN-009 (against VALIDATION-009)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright). PLAN-009 was the first deployment to the user's `haynes-ops` Kubernetes cluster (Phase 1.1 internal, `*.haynesops.com`), bundled with the project's flip from develop-on-main to PR-flow (branch protection on `main` + release-please v4 SemVer tagging + CLAUDE.md PR-flow docs + Dockerfile + GitHub Actions CI). Your job is the validation half — run every gate in `docs/plans/009-deploy-prototype-validation.md` §6 + the cross-plan invariants and report.

## Working directories

- **This repo:** `/Users/thaynes/src/projects/todos-for-dues`
- **haynes-ops GitOps repo:** `~/src/labspace/haynes-ops/`

## Your task

Execute `docs/plans/009-deploy-prototype-validation.md`'s §6 pass/fail gates against the PLAN-009 commits on the current branch + the haynes-ops manifests + the deployed instance. You run the gates, confirm each is green, and report. If a gate fails, you do **not** relax it — small mechanical fixes only, otherwise escalate.

The **cross-plan invariants** are non-negotiable:
1. PLAN-003's `no-direct-state-writes.test.ts` must still pass with no IGNORE_DIRS allowlist changes.
2. PLAN-005's @app/api integration tests (111+) must still pass on the new CI.
3. PLAN-006's 7 per-page walking-skeleton Playwright specs must still pass (if CI runs them; if it doesn't, that's an intentional choice — verify with the user via the commit messages).
4. PLAN-007's notifications + settings tests must still pass.
5. PLAN-008's chained walking-skeleton + 4 SSO + non-SSO auth specs must still pass on CI.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.** Reference: haynes-ops repo path.
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root context. **Verify the two new sections** ("Pull-request flow (NORMATIVE)" and "Release versioning (release-please)") match PLAN-009 §4 Step 2.6's verbatim wording.
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — Next.js 16 reminder, relevant when inspecting the Dockerfile + standalone output.
4. `docs/plans/009-deploy-prototype-validation.md` — your gate list.
5. `docs/plans/009-deploy-prototype.md` §3 Outputs, §4 Steps 1–8 (with sub-steps 2.5/2.6/2.7), §5 Verification.
6. `git log -25 --oneline` + `git log --first-parent main --oneline` — see what landed, and **confirm the transition from direct-push to PR-merge after Step 2.5**. The first-parent log should show squash-merge commits (single-line summaries from PR titles) AFTER the protection-enable commit.

## What you do NOT do

- Do not modify any doc under `docs/` (plans, PRDs, ADRs, designs).
- Do not flip `enforce_admins: true` in branch protection.
- Do not modify `packages/*` or `apps/web/app/*` source EXCEPT for tiny `fix(area):` mechanical fixes (and only if a gate fails). Anything bigger → **escalate**.
- Do not relax a gate. Small mechanical fixes (typo in workflow file, missing context name, wrong env var key) are OK; anything bigger → **escalate**.
- Do not add any path to PLAN-003's `no-direct-state-writes.test.ts` IGNORE_DIRS allowlist.
- Do not skip flaky CI runs. If a job fails, INVESTIGATE the failure source — do not "re-run to confirm." Common CI flake sources: testcontainers PG16 start latency on GHA runner (bump healthcheck timeout); Playwright cold-start on a fresh runner (extend startup timeout); pnpm install resolving a different version due to a lockfile mismatch.
- Do not substitute the test DB engine in CI. PG16 via testcontainers per ADR-004.
- Do not amend PLAN-009's commits. New `fix(ops):` / `fix(ci):` / `fix(docker):` commits only — and any fix-commit lands via PR (branch protection is on by the time you're validating).
- Do not push to remote — the user pushes. If a fix-commit is needed, branch + commit locally + ask user to push.
- Do not approve a release PR or merge a PR on behalf of the user without explicit confirmation. The release-please flow gate is the user's call to merge the release PR.

## Definition of done

Every box in VALIDATION-009 §6 green, verified by running the commands:

- [ ] **Dockerfile builds:** `docker build -t todos-for-dues:dev .` exits 0; `docker run --rm todos-for-dues:dev node --version` shows a recent LTS (no test-mode env vars baked in). Listing `/app` (or the equivalent path) shows the standalone output tree.
- [ ] **`output: 'standalone'` set:** `grep "standalone" apps/web/next.config.mjs` matches.
- [ ] **CI workflow on PRs:** `gh pr list --limit 5 --json number,title,statusCheckRollup` or open the most recent PR in GitHub UI; verify `lint-and-typecheck` + `test` jobs ran and reported success. `build-image` did NOT run on PR.
- [ ] **Branch protection active:**
  - `gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/main/protection" -q '.required_status_checks.contexts'` returns `["lint-and-typecheck", "test"]`.
  - `gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/main/protection" -q '.required_linear_history.enabled'` returns `true`.
  - `gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/main/protection" -q '.allow_force_pushes.enabled'` returns `false`.
  - **Live test:** from a clean branch checkout, `git commit --allow-empty -m "test: protection probe" && git push origin main` MUST fail with `protected branch hook declined`. After confirming the rejection, `git reset --hard origin/main` to discard the local probe commit.
- [ ] **CLAUDE.md PR-flow sections present:**
  - `grep -n "^## Pull-request flow (NORMATIVE)" CLAUDE.md` returns one match.
  - `grep -n "^## Release versioning (release-please)" CLAUDE.md` returns one match.
  - Open both sections — verify the wording matches PLAN-009 §4 Step 2.6's verbatim text (the section is verbatim per the plan; if the agent paraphrased, surface as a deviation).
- [ ] **release-please workflow:**
  - `.github/workflows/release-please.yml` exists with `googleapis/release-please-action@v4` and `permissions: { contents: write, pull-requests: write }`.
  - `release-please-config.json` + `.release-please-manifest.json` exist at repo root.
  - Root `package.json` has `"version": "0.1.0"` (or the current bumped version).
  - At least one `feat:` PR has been merged since release-please landed; verify a release PR was opened automatically (look in `gh pr list --state all --search "release"` or the Actions tab).
  - Verify the release PR was merged: `git tag --list 'v*'` shows at least one `vX.Y.Z` tag.
  - Verify GHCR image: `docker pull ghcr.io/thaynes43/todos-for-dues:vX.Y.Z` exits 0 (`gh auth token | docker login ghcr.io -u thaynes43 --password-stdin` first if not already logged in).
- [ ] **`build-image` workflow** is trigger-gated correctly: open `.github/workflows/*.yml`; the job/workflow that builds and pushes is keyed on `push: { tags: ['v*.*.*'] }` (workflow-level) or `if: startsWith(github.ref, 'refs/tags/v')` (job-level). It MUST NOT run on `pull_request` or `push: { branches: [main] }`.
- [ ] **First-parent log:** `git log --first-parent main --oneline -30` shows the transition — direct commits for Steps 1, 2, 2.5; squash-merge commits (one line each, conventional-commit format) thereafter. Cross-reference with PLAN-009 §3 Outputs' commit list.
- [ ] **haynes-ops manifests present:** `ls ~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/` shows the 5+ expected files (`kustomization.yaml`, `deployment.yaml`, `service.yaml`, `ingressroute.yaml`, `external-secrets.yaml`, and the per-instance Postgres provisioning piece — verify the cluster16 idiom this repo uses).
- [ ] **Deployment image pinned to `:vX.Y.Z`:** `grep -E "image:.+todos-for-dues:" ~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/deployment.yaml` shows `:vX.Y.Z` (matching the release-please tag), NOT `:latest`.
- [ ] **External Secrets references all required keys:** `grep -E "secretKey|remoteRef" ~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/external-secrets.yaml` enumerates `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_HOSTED_DOMAIN`, `BOOTSTRAP_ADMIN_EMAIL`, all 5 `BOOTSTRAP_*` chapter-settings keys, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`.
- [ ] **No `OIDC_DISCOVERY_URL`** in External Secrets or the Deployment env — verify by grep'ing the manifests. Production must default to Google's discovery URL.
- [ ] **No `RESEND_TEST_MODE`** in External Secrets or the Deployment env — same.
- [ ] **Pod Running:** `kubectl get pods -n frontend` shows the `todos-for-dues` pod Ready (`1/1`), init container completed (Phase: Succeeded).
- [ ] **Init container migrate succeeded:** `kubectl logs -n frontend deploy/todos-for-dues -c migrate` (or whatever the init-container name is) shows "Migrations applied" or equivalent; idempotent on re-run.
- [ ] **DB schema present:** `kubectl exec -n cluster16-system cluster16-1 -- psql -U todos_for_dues_user -d todos_for_dues -c '\dt'` returns ≥7 tables (jobs, job_enrollments, job_state_transitions, users, user_role_transitions, account, session, verification, chapter_settings, invite_tokens — exact count depends on Better Auth's table count).
- [ ] **chapter_settings seeded from env, not `*.invalid`:** `kubectl exec -n cluster16-system cluster16-1 -- psql -U todos_for_dues_user -d todos_for_dues -c 'SELECT key, value FROM chapter_settings ORDER BY key'` shows 5 rows; **none** of the values match the `*.invalid` placeholder pattern from DESIGN-001 §5.5; values match the External Secrets `BOOTSTRAP_*` data.
- [ ] **HTTPS smoke:**
  - `curl -s -o /dev/null -w '%{http_code}' https://todos-for-dues.haynesops.com/` returns 200.
  - `curl -s -o /dev/null -w '%{http_code}' https://todos-for-dues.haynesops.com/login` returns 200.
  - `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' https://todos-for-dues.haynesops.com/api/auth/sign-in/email` returns 400 or 401 (NOT 500, NOT 404).
  - `curl -s 'https://todos-for-dues.haynesops.com/api/trpc/users.getSession?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D'` returns a tRPC JSON response (parse with `jq`); status code 200.
- [ ] **Test routes 404 in prod:**
  - `curl -s -o /dev/null -w '%{http_code}' https://todos-for-dues.haynesops.com/api/test/resend-calls` returns 404.
  - `curl -s -o /dev/null -w '%{http_code}' -X DELETE https://todos-for-dues.haynesops.com/api/test/resend-calls` returns 404.
- [ ] **Bootstrap admin path (user-driven):** the user signs in once via Workspace SSO as `BOOTSTRAP_ADMIN_EMAIL`; after the sign-in, `kubectl exec -n cluster16-system cluster16-1 -- psql -U todos_for_dues_user -d todos_for_dues -c "SELECT email, role FROM users WHERE email = '<email>'"` shows `role = 'admin'`; `user_role_transitions` has one row for the promotion.
- [ ] **Walking-skeleton smoke (user-driven):** the user runs through the happy path against `https://todos-for-dues.haynesops.com/` (or assists you with the click-through — coordinate). Loop completes; final state `closed`; treasurer email appears in Resend dashboard or test inbox.
- [ ] **Cross-plan invariants:** in this repo at the latest `main`:
  - `pnpm --filter @app/domain test no-direct-state-writes` exit 0 (locally).
  - The most recent main-branch CI run shows all jobs green (lint-and-typecheck + test).
  - Spot-check via GHA Actions tab: PLAN-005 (@app/api), PLAN-006 (Playwright), PLAN-007 (notifications + settings), PLAN-008 (chained + SSO) all ran and passed in the same CI run. **If CI doesn't run Playwright** (which is a reasonable cost decision), confirm the omission is documented in the commit body for `chore(ci): GitHub Actions workflow` and flag in your report.
- [ ] **`pnpm --filter web build` succeeds locally without `DATABASE_URL`:** `unset DATABASE_URL && pnpm --filter web build` exits 0 (PLAN-009 §7 risk gate; verifies the lazy `db` Proxy is intact post-deploy).
- [ ] **`pnpm -r typecheck` exits 0** locally.

Report back (under 350 words): which gates passed, any implementation fixes you made (with new commit hash + branch + PR URL — since branch protection is on), anything escalated, **and explicit confirmation that (1) PLAN-003 static check still passes, (2) PLAN-005 + PLAN-007 + PLAN-008 tests still pass on the new CI, (3) the deployed pod is Ready and the smoke test passed end-to-end against the live URL, (4) the `:vX.Y.Z` deployed image matches the release-please tag, (5) branch protection actually rejected a direct push attempt to `main`, (6) no test-only env vars (`RESEND_TEST_MODE`, `OIDC_DISCOVERY_URL`) leaked to production.**

## Specific things to look hard at

1. **Branch protection rejection is REAL, not vibes.** Actually attempt the direct push (clean up after — see the gate's "live test" sub-step). If protection's only "kind of" enabled (e.g., enforce_admins false + you happen to be an admin + GitHub didn't apply the rule), you'll think it works and the user will discover otherwise. Verify by trying the push from this repo's checkout and watching the rejection.

2. **release-please's release PR is auto-opened, not user-created.** The flow is: PR with `feat:` lands on main → release-please workflow runs → release PR opens. If you see a release PR but the author is the user (not `github-actions[bot]`), something's wrong — that's a manually-opened PR, not a release-please artefact. Check the Actions tab for the release-please workflow run; verify it exited 0.

3. **The `:vX.Y.Z` deployment tag must match a release-please tag.** Cross-reference: the tag in `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/deployment.yaml` (the `image:` line) must literally appear in `git tag --list 'v*'` from this repo. If not, the deployment is pinning a tag that doesn't exist or doesn't have a built image; verify GHCR has `ghcr.io/thaynes43/todos-for-dues:vX.Y.Z`.

4. **External Secrets are LIVE references, not literal values.** Open `external-secrets.yaml`; confirm the data section uses `remoteRef` / `secretKey` (or whatever this cluster's external-secrets CRD shape is — read the existing manifests for the pattern). Reject any plain-text secret values in this file.

5. **`OIDC_HOSTED_DOMAIN` matches the chapter's Workspace domain.** This is chapter-specific (Sigma Phi Omicron / UMass Lowell — confirm with the user what the actual Workspace domain is). The value flows from External Secrets → Deployment env → Better Auth's `genericOAuth` `authorizationUrlParams.hd`. If it's set to the wrong domain, SSO 401s without a clear error message.

6. **`BETTER_AUTH_URL` is set to the production URL.** Without it, Better Auth defaults to localhost and the OIDC callback fails. Verify: `kubectl describe deploy -n frontend todos-for-dues | grep -A2 BETTER_AUTH_URL` shows `https://todos-for-dues.haynesops.com`.

7. **Init container's tsx + BOOTSTRAP_* env vars.** The init container needs (a) `tsx` reachable in its working dir (either via `node_modules/.bin/tsx` retained in the image, or via npx-style invocation), and (b) all 5 `BOOTSTRAP_*` env vars at the time it runs `pnpm --filter @app/db migrate`. Verify: `kubectl describe pod -n frontend <pod>` shows the init container with all 5 env vars in its env list. If any are missing, the migration completes but `chapter_settings` seeds the `*.invalid` placeholders and the first treasurer email misfires.

8. **The :latest tag also exists in GHCR.** Per PLAN-009 §2.6's release-please section: "`:latest` Docker tag always points at the most recent SemVer release." Verify: `docker manifest inspect ghcr.io/thaynes43/todos-for-dues:latest` resolves to the same digest as `:vX.Y.Z`. Production deploys MUST pin `:vX.Y.Z`, not `:latest` (that's a separate gate); `:latest` is a convenience tag for local pulls / smoke testing.

9. **No `permissions: write` leaks in `ci.yml`.** Workflows that don't push images don't need `packages: write` or `contents: write`. The `build-image` workflow needs `packages: write` (GHCR push) and `contents: read`. The `release-please` workflow needs `contents: write` (tag creation) and `pull-requests: write` (release PR opening). Other workflows should have minimal permissions or rely on default `contents: read`.

10. **CI's `test` job runs ALL packages' tests, not just one.** The plan doc says "pnpm install, pnpm test." The repo's root `test` script should recurse via `pnpm -r test` (or equivalent) — verify by reading `apps/web/package.json` and the root `package.json`. If only one package's tests run on CI, that's a gap.

## If a gate fails

1. **Mechanical fix (allowed; via PR since branch protection is on):** typo in workflow file, missing import in Dockerfile copy, wrong env var key in external-secrets.yaml, off-by-one path. Branch + commit + open PR + wait for CI + squash-merge. Document the fix in the PR body referencing the failed gate.
2. **Branch protection blocks YOUR own fix-PR via stale-status-check:** investigate; usually the fix is to push a new commit to retrigger CI, NOT to disable the check.
3. **Cross-plan invariant regression (FIX, do not allowlist):** if PLAN-003's test fails, the fix is in the offending code, not in the test.
4. **PLAN-005/006/007/008 regression (FIX, do not skip):** if any prior suite fails on CI, the fix is in PLAN-009's modifications (likely the Dockerfile or CI workflow). Do NOT mark the regressing test as `.skip`.
5. **Cluster-side ops issue (escalate):** anything requiring `kubectl edit secret` for a missing value, or a Workspace OIDC redirect URI registration, or a Resend domain verification step is user-side.
6. **Release-please workflow doesn't open a release PR (investigate):** common cause is the workflow permissions block being absent. Add it; commit; open a PR; the release-please workflow re-runs on the next merge to main.
7. **Discovery: PLAN-008's `requireLocalEmailVerified: false` on Better Auth produces an unintended account-linking outcome in production (escalate):** PLAN-008 set this for MVP; production has no email verification UI yet. If the deploy surfaces a real risk, escalate — don't unilaterally revert.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Begin.
