---
id: PLAN-013
title: SDLC hardening — Playwright in CI · release-tag automation · test hygiene · live smoke + health · ops runbook
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-16
last_updated: 2026-05-17
estimate: M
related:
  prds: [PRD-001]
  adrs: [ADR-006]
  bounded_contexts: []
  aggregates: []
  designs: []
  plans:
    prerequisite: [PLAN-009, PLAN-014]
    lateral: [VALIDATION-013]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Shore up the SDLC before beta-testing drives meaningful bug volume. Three sub-tracks:

- **A — CI / release automation.** Land Playwright in CI (currently zero automated UI tests in CI; vitest is the only check) + fix the `GITHUB_TOKEN`-tag-push trap that's required manual re-pushing on every release today (v0.3.0/v0.4.0/v0.5.0/v0.6.0 all missed `build-image` on the bot-created tag) + a small `RESEND_FROM_ADDRESS` boot-time fail-fast guard that PLAN-013's prior backlog flagged.

- **B — Test hygiene.** Retrofit `installPageerrorListener` onto the PLAN-010 `e2e/mvp/*.spec.ts` files (closes the VALIDATION-010 deviation properly) + root-cause the `my-postings.spec.ts` parallel-flake VALIDATION-011 surfaced (no retry-band-aids — find the race and fix it).

- **C — Live smoke + health + runbook.** `/api/health` endpoint + readiness probe wiring + a separate `playwright.config.live.ts` with read-only smoke specs that exercise the deployed URL without churning data + a short ops runbook (`docs/ops/runbook.md`) that captures the recipes we kept Googling for today (kubectl + psql + Resend + Better Auth + the `GITHUB_TOKEN`-tag-re-push procedure + the GHCR-visibility-flip recipe + the OIDC redirect URI exact path).

**Out of scope (defers, NOT dropped):** Grafana dashboards + alert rules. Iterative via the Grafana MCP server, doesn't need a Markdown plan; folds into a follow-up PLAN-015 (Observability) once the SDLC base is solid.

> **Produces:** `.github/workflows/e2e.yml` (advisory-only initially) · modifications to `.github/workflows/ci.yml` (build-image trigger swap) · `apps/web/playwright.config.live.ts` + `apps/web/e2e/live/*.spec.ts` + `pnpm --filter web e2e:live` script · `apps/web/app/api/health/route.ts` + readiness-probe wiring · `apps/web/e2e/mvp/support.ts` extended with `installPageerrorListener` · `my-postings.spec.ts` root-cause fix · `packages/notifications/src/send-email.ts` boot-fail-fast · `docs/ops/runbook.md`.
> **Definition of success:** VALIDATION-013 passes — every gate in §6 green; the four backlog items the coordinator has tracked since handoff 008 are closed; `pnpm --filter web e2e -- e2e/mvp/` runs without `my-postings.spec.ts` flake even under default `--workers > 1`.

## 2. Inputs

### 2.1 Documents the agent must read first

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user auto-memory.
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root context, including `## Pull-request flow (NORMATIVE)` + `## Release versioning (release-please)`.
3. **The most-recent coordinator handoff** at `.agents/context/011-coordinator-handoff-2026-05-17-EOD.md` (or whichever is latest) — captures the `GITHUB_TOKEN`-tag-trap history and the `my-postings.spec.ts` flake notes from VALIDATION-011/012.
4. `apps/web/AGENTS.md` (one line) — Next.js 16 reminder for the health-route work.
5. **Current CI:** `.github/workflows/ci.yml` + `.github/workflows/release-please.yml`. Both are short; read them.
6. **Current e2e support helpers:** `apps/web/e2e/admin/support.ts` + `apps/web/e2e/roles/support.ts` — both install `installPageerrorListener` per spec. Mirror in `apps/web/e2e/mvp/support.ts` (which currently lacks it).
7. `apps/web/playwright.config.ts` — for the live config to mirror its testID/timeout shape minus the `webServer` block.
8. `packages/notifications/src/send-email.ts` — for the boot-time RESEND_FROM_ADDRESS guard.
9. `apps/web/e2e/mvp/my-postings.spec.ts` + `e2e/mvp/support.ts` — read carefully for the flake root cause.

### 2.2 Repo state assumed

- v0.6.0 deployed at `https://todos-for-dues.haynesops.com` (per handoff 010).
- Branch protection on `main`; required checks `[lint-and-typecheck, test]`.
- release-please is wired; default `GITHUB_TOKEN`; this is the trap PLAN-013 fixes.

### 2.3 External dependencies

- GitHub Actions runner with Docker (already present — vitest's testcontainers usage proves this).
- Playwright browsers installed via `pnpm exec playwright install --with-deps chromium` in CI.

## 3. Outputs

The plan calls for **three subagent tracks** spawned in parallel by the main agent after the foundation is set (Step 1). Files below are grouped by track.

### Track A — CI / release automation

- **`.github/workflows/ci.yml`** — modify the `build-image` job's trigger. Current:
  ```yaml
  build-image:
    if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
  on:
    push:
      branches: [main]
      tags: ["v*.*.*"]
  ```
  Replace with a `release: types: [published]` trigger. The `release` event fires regardless of who created the underlying tag (no `GITHUB_TOKEN`-suppression), so release-please's tag push will fire `build-image` cleanly.

  Sketch:
  ```yaml
  on:
    pull_request:
    push:
      branches: [main]
    release:
      types: [published]

  jobs:
    build-image:
      if: github.event_name == 'release'
      runs-on: ubuntu-latest
      …
      steps:
        - uses: actions/checkout@v4
          with:
            ref: ${{ github.event.release.tag_name }}
        - id: meta
          uses: docker/metadata-action@v5
          with:
            images: ghcr.io/thaynes43/todos-for-dues
            tags: |
              type=raw,value=${{ github.event.release.tag_name }}
              type=raw,value=latest
        …
  ```

  Also remove the now-redundant `lint-and-typecheck` + `test` skip-on-tag-push condition (they still run on PR + push to main; the tag-push branch went away).

- **`.github/workflows/release-please.yml`** — verify the action emits a Release (it does by default; double-check `release-please-config.json` doesn't override `release-type` to something that suppresses Release creation). If a Release is NOT emitted, set the config appropriately.

- **`packages/notifications/src/send-email.ts`** — add a boot-time fail-fast guard:
  ```ts
  if (process.env.NODE_ENV === 'production') {
    const from = process.env.RESEND_FROM_ADDRESS;
    if (!from || from.endsWith('@todos-for-dues.app')) {
      throw new Error(
        'RESEND_FROM_ADDRESS must be set to a verified Resend domain in production; ' +
        'placeholder "noreply@todos-for-dues.app" detected.'
      );
    }
  }
  ```
  Where to put this is a design call — `send-email.ts` module top-level vs. a dedicated `validateEnvOrThrow()` helper. Subagent A picks; keep the change minimal.

- **`.github/workflows/e2e.yml`** — NEW workflow (advisory-only initially per the user's lean):
  ```yaml
  name: e2e

  on:
    pull_request:
    push:
      branches: [main]

  concurrency:
    group: e2e-${{ github.ref }}
    cancel-in-progress: ${{ github.event_name == 'pull_request' }}

  env:
    NODE_VERSION: "22"
    PNPM_VERSION: "11.1.2"

  jobs:
    playwright:
      runs-on: ubuntu-latest
      timeout-minutes: 30
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
          with:
            version: ${{ env.PNPM_VERSION }}
        - uses: actions/setup-node@v4
          with:
            node-version: ${{ env.NODE_VERSION }}
            cache: pnpm
        - run: pnpm install --frozen-lockfile
        - run: pnpm --filter web exec playwright install --with-deps chromium
        - run: pnpm --filter web e2e
  ```

  Branch protection is NOT updated to require this check. Status: advisory-only. Coordinator flips to required after 2 weeks of green runs (recorded as a backlog item in the handoff).

- **Unit + integration tests:** none specific to this track beyond the cross-plan invariants. The boot-fail-fast guard could have a Vitest test in `packages/notifications/__tests__/` that sets `NODE_ENV=production` + asserts the import throws when the FROM is missing/placeholder.

### Track B — Test hygiene

- **`apps/web/e2e/mvp/support.ts`** — add `installPageerrorListener` (copy from `e2e/admin/support.ts` line-for-line).
- **Every `apps/web/e2e/mvp/*.spec.ts` file** — add `test.beforeEach(({ page }) => installPageerrorListener(page))` at the top of each spec's `test.describe` block. 9 files.
- **`apps/web/e2e/mvp/my-postings.spec.ts`** — root-cause the parallel-flake. VALIDATION-011 report: "1/3 full-suite runs failed; 0/1 in isolation … likely dev-server compile-lag / session-cookie race under parallel-spec contention." Investigate paths:
  - **Dev-server compile-lag** — Next.js compiles routes on first hit; under parallel specs the first hit to `/my-postings` may take longer than the spec's implicit timeout. Fix: `await page.waitForLoadState('networkidle')` post-`page.goto('/my-postings')` AND/OR bump the per-action timeout for navigations.
  - **Session-cookie race** — if multiple specs share a persona seed pattern and one revokes a session another is mid-use, the redirect can race. Fix: per-spec UUID-suffixed personas already in `support.ts:newSuffix()`; verify `my-postings.spec.ts` uses it consistently.
  - **Test isolation** — `e2e/mvp/` is in `--workers=1` per PLAN-010 commands. **Confirm this is set** in `playwright.config.ts`'s mvp project or in the script invocation; if not, the flake is the lack of isolation. Either set `--workers=1` for that suite OR fix the underlying isolation issue (preferred).
  - **No retry-bandaids.** Fix the actual race; don't add `test.describe.configure({ retries: 1 })`.
- **Unit + integration:** no new tests; the existing 9 mvp specs are the surface.

### Track C — Live smoke + health + runbook

- **`apps/web/app/api/health/route.ts`** — NEW route handler (App Router):
  ```ts
  import { db } from '@app/db';
  import { sql } from 'drizzle-orm';

  export async function GET() {
    let dbOk = false;
    try {
      await db.execute(sql`SELECT 1`);
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const body = {
      status: dbOk ? 'ok' : 'degraded',
      version: process.env.APP_VERSION ?? 'dev',
      db: dbOk,
    };
    return Response.json(body, { status: dbOk ? 200 : 503 });
  }
  ```

- **Wire the readiness probe** in `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml` from `httpGet: /` to `httpGet: /api/health` for both `readiness` and `liveness`. This change lives in haynes-ops; the SaaS PR doesn't touch it directly — Subagent C surfaces it as a follow-up PR in the report.

- **`apps/web/__tests__/api/health.test.ts`** — Vitest spec for the route handler. Two cases:
  - DB Proxy returns OK → response is 200 with `db: true`.
  - DB Proxy throws → response is 503 with `db: false`.

- **`apps/web/playwright.config.live.ts`** — NEW config:
  ```ts
  import { defineConfig } from '@playwright/test';
  export default defineConfig({
    testDir: './e2e/live',
    timeout: 30_000,
    use: {
      baseURL: process.env.LIVE_URL ?? (() => { throw new Error('LIVE_URL must be set'); })(),
      trace: 'on-first-retry',
    },
    // No webServer — we don't start a local dev server.
    // No globalSetup — no mocks; live OIDC + live Resend = no test seam.
  });
  ```

- **`apps/web/e2e/live/smoke.spec.ts`** — read-only smoke spec:
  - `GET /` returns 200 (Playwright `page.goto('/')`).
  - SSO button visible on `/login` (if `OIDC_*` configured — feature-detect via the presence of the button selector; do NOT depend on env vars at spec-runtime).
  - `GET /api/health` returns 200 with `{ status: 'ok' }`.
  - No `console.error` during the run (installPageerrorListener).
  - **No state writes.** No signin, no posting, no role changes. Anonymous-user surface only.

- **`apps/web/package.json`** — add script:
  ```json
  "e2e:live": "playwright test --config=playwright.config.live.ts"
  ```

- **`docs/ops/runbook.md`** — NEW file. Eight sections, each scannable in <30s:
  1. **Pod logs** — `kubectl logs -n frontend deploy/todos-for-dues -f` + Grafana Loki link (if available).
  2. **DB inspection** — `kubectl exec -it -n frontend cluster16-1 -- psql -U todos_for_dues -d todos_for_dues`; common queries (stuck jobs, recent transitions, missing chapter_settings).
  3. **Resend send debugging** — Resend dashboard URL, `Idempotency-Key` lookup pattern.
  4. **Better Auth session debugging** — `SELECT * FROM session WHERE user_id = …`; cookie/domain-mismatch symptoms.
  5. **OIDC redirect URI** — exact path is `/api/auth/oauth2/callback/{providerId}` per PLAN-009 §7 correction.
  6. **Cert renewal failed** — which Traefik IngressRoute / cert-manager Certificate to `kubectl describe`.
  7. **BOOTSTRAP_* env var missing** — symptom + `kubectl get secret todos-for-dues-secret -n frontend -o yaml`.
  8. **Migration stuck** — init container retry semantics; manual migrate via `kubectl exec`.
  9. **`GITHUB_TOKEN`-tag-trap workaround** — the procedure used 4× today (v0.3.0..v0.6.0). After Track A lands, this should no longer be needed for new tags, but document it for legacy reproductions.
  10. **GHCR visibility flip** — UI procedure (no API endpoint).

  Each section ends with `<!-- Last verified: 2026-05-17 -->`.

## 3.1 Architecture follow-ups (tracked, NOT in this PR)

Surfaced during PLAN-013 execution (iteration 2). Each is a real defect or improvement that this PR works around or defers; track for a follow-up plan / chore before flipping `e2e` advisory → required-status-check.

1. **`apps/web/e2e/roles/support.ts:demoteAllOtherAdmins` clobbers concurrent specs.** ~~Workaround in PR #27: per-spec invocations.~~ **PARTIALLY CLOSED 2026-05-18 (PR #35).** Helper scope-narrowed to a per-spec ID allowlist (signature: `(pool, seededUserIds, keepId)`; SQL: `WHERE id = ANY($1::uuid[]) AND id <> $2`); 5 chapter-safe role specs (`admin-grant`, `admin-demote-admin`, `admin-users-list`, `role-history`, `self-service`) collapse into one invocation. **Amendment (also PR #35 finding):** the 2 chapter-state specs (`last-admin-blocked` + `admin-swap`) still require solo invocations because their assertions depend on chapter-wide `count(Admin) = 1` at the moment of self-demote — the deferred `assert_min_one_admin` trigger fires only on chapter-wide count, not per-spec. Both specs now look up the Bootstrap Admin via the new `fetchBootstrapAdminIds(pool)` helper and pass that ID into the allowlist, but the trigger still cares about the global count, so sharing a testcontainer DB with concurrent specs (which would seed their own admins) breaks the assertion. **Real architectural fix (deferred — out of scope for the e2e layer):** make the `assert_min_one_admin` trigger chapter-scoped (`WHERE chapter_id = NEW.chapter_id`) so each spec's seeded `cast.admin` operates within its own chapter context. That's a schema/domain change, not test infra.

2. **`apps/web/e2e/admin/invites.spec.ts:24` cross-suite count race.** **CLOSED 2026-05-18 (PR #35).** Replaced the racy `expect(rows.count()).toBeGreaterThan(baseline)` with a UUID-data-attribute row visibility assertion: the spec pulls the freshly-minted `invite_tokens.id` from the DB and asserts `expect(page.locator('[data-invite-id="${mintedInvite.id}"]')).toBeVisible()`. The assertion is now scoped to a UUID unique to this spec's mint, so concurrent suites cannot race.

3. **`fullyParallel: false` for `e2e/admin/`?** **CLOSED 2026-05-18 (PR #36, no flip needed).** After #1 + #2 + #10 closed, the full suite-level collapse (`walking-skeleton` + `__e2e__/auth` + `e2e/mvp` + `e2e/admin` all in one invocation) ran 3× consecutively under DEFAULT workers (`fullyParallel: true`) with 3/3 green and zero failures across 135 test-runs. No exploratory comparison needed; parallel is stable.

4. **Flip `e2e` to required-status-check.** Already on coordinator backlog; assumes #1–#3 + GHA cold-runner improvements (#5 below) are all stable. Target: 2 weeks of green main runs.

5. **GHA cold-runner Playwright wall time + flake.** Iteration 2 landed `globalSetup.ts:prewarmRoutes()` + `expect.timeout: 15_000` + `waitForLoadState('networkidle')` in support helpers. These materially helped but the workflow now ships per-suite invocations (Track A) which inflate wall time. Future-state options: (a) route pre-warming hits ALL spec-facing routes (already doing this), (b) split into `e2e-fast` + `e2e-slow` workflows, (c) bigger runner, (d) Playwright shard support.

6. **`RESEND_FROM_ADDRESS` boot-fail-fast pattern.** Currently a module-load side effect gated on `NEXT_PHASE` + `NODE_ENV`. Heuristic; fragile. **Real fix:** Next.js [`instrumentation.ts`](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation) hook is the documented "run once on server boot" mechanism. Refactor when convenient.

7. **`/api/health` Vitest mock pattern.** `vi.resetModules()` doesn't reset `vi.fn()` call counts on `vi.mock` factory-returned objects. Worth a shared test helper across `apps/web/__tests__/`. Not urgent.

8. **Smoke spec's `/api/health` against pre-v0.7.0 instances.** Returns 404 on v0.6.0 (route added by this PR). Live smoke fails 1/3 against the currently-deployed image. **Lean: leave it strict** — the validator runs smoke post-deploy, when the route exists. Document this in the runbook so a future operator doesn't panic at the 404 during a partial-deploy window.

9. **PAT for release-please.** **CLOSED 2026-05-18 (PR #31).** Fine-grained PAT (`repo:contents:write` + `actions:read+write`) minted by the user, stored as `RELEASE_PLEASE_PAT`, consumed by `.github/workflows/release-please.yml`. **Verified by v0.7.2 (commit `22f8a4a`):** release CI run on `event=release`, `build-image` job conclusion `success`, no manual recovery. **Second verification by v0.7.3:** same auto-fire pattern. The `GITHUB_TOKEN`-trap is dead under normal operation; the runbook §9 workarounds remain documented as fallback only. Runbook §9 updated 2026-05-18 with a resolution banner.

10. **`signInAs` glob mismatch — `apps/web/e2e/walking-skeleton/support/personas.ts:27`.** **CLOSED 2026-05-18 (PR #36).** Surfaced by PR #35's 3× collapsed-shape verification. Original code did `await page.waitForURL('**/', { timeout: 30_000 })`; the glob `'**/'` only matches URLs ending in a trailing slash, but `app/page.tsx` redirects authenticated users to `/jobs` (Active/Alumni/Admin) or `/moderation-queue` (Moderator) — no trailing slash. Under load the transient `/` URL during the redirect chain wasn't reliably visible to Playwright → 30s timeout → ~⅓ flake rate under full-suite collapse. **Fix:** replaced the glob with regex `/\/(jobs|moderation-queue)?$/` at both buggy call sites (`personas.ts:27` + `e2e/admin/invites.spec.ts:116` — the external-context post-signup wait); audited all other `waitForURL` uses (concrete paths and function predicates were correct and left alone). Same PR collapsed the 4 suite-level invocations in `.github/workflows/e2e.yml` into 1 per §3.1 #3 above.

## 4. Steps

### Step 0 — Branch off latest `origin/main`

```sh
cd /Users/thaynes/src/projects/todos-for-dues
git fetch origin main && git checkout main && git pull --ff-only origin main
git checkout -b plan-013-sdlc-hardening
```

(PLAN-011 lesson: never branch off another open PR's branch.)

### Step 1 — Main agent sets the foundation

Three things to lock down before spawning subagents:

1. **Add the new e2e support helper signature.** Just touch `apps/web/e2e/mvp/support.ts` to add an `installPageerrorListener` re-export from a shared location (or copy the helper). Subagent B will fill in the per-spec invocations.

2. **Stub `apps/web/app/api/health/route.ts`** with a placeholder body (`return Response.json({ status: 'stub' }, { status: 200 });`). Subagent C fills the real body.

3. **Sketch the `e2e.yml` workflow.** Subagent A finalises but the file's existence + its `on:` block needs to be locked first so subagent A doesn't accidentally land a different shape.

Commit these foundation changes.

### Step 2 — Spawn subagents A + B + C in parallel

Three Agent tool calls in the same response. Each subagent works on the same branch, touches different paths (low conflict risk). Subagent prompts:

**Subagent A (`general-purpose`) — CI / release automation:**

> You are the CI/release subagent for PLAN-013. Working dir: `/Users/thaynes/src/projects/todos-for-dues`. Branch: `plan-013-sdlc-hardening` (already exists; checkout). Read `docs/plans/013-live-instance-ops-implementation.md` §3 Track A.
>
> Scope:
> - Modify `.github/workflows/ci.yml` per Track A: swap `build-image` from tag-push trigger to `release: types: [published]`. Verify the resulting workflow is parseable (`actionlint` if available locally, or YAML lint).
> - Verify `.github/workflows/release-please.yml` emits a Release on PR merge. Inspect `release-please-config.json` for `release-type` overrides; default behavior is to emit a Release.
> - Fill in `.github/workflows/e2e.yml` (stub already present from main agent's Step 1). Advisory-only — NOT a required status check.
> - Add the `RESEND_FROM_ADDRESS` boot-fail-fast in `packages/notifications/src/send-email.ts`. Add a Vitest spec under `packages/notifications/__tests__/` covering it.
>
> Definition of done:
> - `pnpm --filter @app/notifications test` exits 0 (count grows).
> - `pnpm -r typecheck` exits 0.
> - `pnpm --filter @app/domain test no-direct-state-writes` exits 0.
> - Commits: split logically (`chore(ci): swap build-image to release-published trigger`, `chore(ci): add e2e workflow (advisory-only)`, `fix(notifications): fail-fast on placeholder RESEND_FROM_ADDRESS`).
> - Report back <300 words: files changed, what was tricky, any escalations.

**Subagent B (`general-purpose`) — test hygiene:**

> You are the test-hygiene subagent for PLAN-013. Working dir: `/Users/thaynes/src/projects/todos-for-dues`. Branch: `plan-013-sdlc-hardening` (already exists; checkout). Read `docs/plans/013-live-instance-ops-implementation.md` §3 Track B.
>
> Scope:
> - Extend `apps/web/e2e/mvp/support.ts` with `installPageerrorListener` (mirror `apps/web/e2e/admin/support.ts:installPageerrorListener` line-for-line).
> - Wire `test.beforeEach(({ page }) => installPageerrorListener(page))` into every spec under `apps/web/e2e/mvp/` (9 files).
> - Root-cause the `my-postings.spec.ts` parallel-flake. Read the spec, the support helpers, the playwright config. Try paths in this order: (a) ensure `--workers=1` is set for the mvp project (look at `playwright.config.ts` for project config); (b) add `await page.waitForLoadState('networkidle')` post-navigation if Next.js compile-lag is the culprit; (c) audit per-spec persona seeding for cookie-race. Do NOT add `retries`.
> - Verify by running `pnpm --filter web e2e -- e2e/mvp/` 3× under DEFAULT workers (not `--workers=1`). All 3 must pass with no flake. If `--workers=1` is the only path to green, document that in the spec's top comment AND in the report.
>
> Definition of done:
> - `pnpm --filter web e2e -- e2e/mvp/` exits 0 across 3 consecutive runs.
> - No `retries` added to any spec.
> - `pnpm -r typecheck` exits 0.
> - Commit: `fix(e2e): close VALIDATION-010 pageerror-listener gap + my-postings parallel-flake root-cause`. Single-commit OK.
> - Report back <300 words: root cause for the flake; whether you fixed it parallel-safe or stuck with `--workers=1`.

**Subagent C (`general-purpose`) — live smoke + health + runbook:**

> You are the live-smoke subagent for PLAN-013. Working dir: `/Users/thaynes/src/projects/todos-for-dues`. Branch: `plan-013-sdlc-hardening` (already exists; checkout). Read `docs/plans/013-live-instance-ops-implementation.md` §3 Track C.
>
> Scope:
> - Replace the stub `apps/web/app/api/health/route.ts` (main agent left a placeholder) with the real handler per §3 Track C.
> - Add `apps/web/__tests__/api/health.test.ts` covering the 2 cases.
> - Add `apps/web/playwright.config.live.ts` + `apps/web/e2e/live/smoke.spec.ts` per §3 Track C. Smoke spec MUST NOT mutate state.
> - Add the `"e2e:live"` script in `apps/web/package.json`.
> - Write `docs/ops/runbook.md` with the 10 sections per §3 Track C. Use the recipes from today's deploys verbatim — check `kubectl get secret`, `kubectl exec ... psql`, etc.
> - Surface (in your report) the haynes-ops follow-up needed: bump the readiness probe from `/` to `/api/health`. Do NOT open the haynes-ops PR yourself; the coordinator handles that.
>
> Definition of done:
> - `pnpm --filter web test` exits 0 (web Vitest count grows with the health test).
> - `pnpm --filter web build` exits 0 with `DATABASE_URL` unset (PLAN-002 lazy Proxy).
> - **Do NOT run `pnpm --filter web e2e:live`** — it requires a `LIVE_URL` env var; main agent handles smoke against the live instance after merge.
> - Commits: `feat(web): /api/health endpoint`, `feat(web): live-smoke Playwright config + spec`, `docs(ops): runbook`.
> - Report back <300 words: files changed, the haynes-ops probe-update follow-up note.

### Step 3 — Main agent integrates + runs cross-plan invariants

After all three subagents report back:
- Pull the branch into clean state; `git status` is empty.
- Run the full cross-plan invariant suite locally (all 10 invariants from §3 Track A above's "Definition of done" sections + the project-wide ones from PLAN-014's prompt §"Cross-plan invariants").
- Run `pnpm --filter web e2e -- e2e/mvp/` 3× to confirm Subagent B's fix landed.
- Run `pnpm --filter web e2e -- e2e/admin/` 3× to confirm no regression.
- Run `pnpm --filter web e2e -- e2e/roles/` 3×.
- Confirm `pnpm -r typecheck` + `pnpm --filter web build` (no `DATABASE_URL`) both exit 0.

### Step 4 — Smoke against live (manual)

After integration but BEFORE the PR is opened:
```sh
LIVE_URL=https://todos-for-dues.haynesops.com pnpm --filter web exec playwright test --config=playwright.config.live.ts
```
The smoke spec hits the live v0.6.0 instance. Must pass 3× no-flake. If it fails, surface the failure in the report — do not open the PR with a known-broken live smoke.

### Step 5 — Commit + push + open PR

Title: `feat(ci): SDLC hardening — Playwright in CI · release-tag automation · test hygiene · live smoke + health · ops runbook (PLAN-013)`.

The first scoped commit is a `feat:` (e2e workflow is a new capability). The other `chore:` / `fix:` / `docs:` prefixes are honest. Squash-merge collapses to the title; release-please reads `feat:` and bumps minor → v0.7.0.

### Step 6 — Wait for CI green

Both `lint-and-typecheck` + `test` (and now `e2e` advisory-only — its result is informational only).

### Step 7 — GATE 1 — STOP for user review

Tell user: PR up, CI green, ready for merge. Wait for "merge it."

### Step 8 — Post-merge follow-ups (haynes-ops + branch-protection)

After the SaaS PR merges:
- **haynes-ops follow-up PR** to bump the readiness probe from `/` to `/api/health` (subagent C surfaced this; coordinator authors the haynes-ops PR).
- **Branch-protection backlog item:** flip `e2e` to required-status-check after 2 weeks of green main-runs.

## 5. Verification (end-to-end)

- [ ] VALIDATION-013 passes — every gate green.
- [ ] `pnpm --filter web e2e -- e2e/mvp/` exits 0 under DEFAULT workers across 3 consecutive runs (no `--workers=1` requirement, OR if forced to `--workers=1`, that's documented + acknowledged).
- [ ] `installPageerrorListener` is present in every spec under `e2e/mvp/`.
- [ ] `.github/workflows/e2e.yml` exists; runs against PRs + main pushes; status is advisory-only.
- [ ] `.github/workflows/ci.yml` `build-image` job is gated on `release: types: [published]`; the next release (v0.7.0 after this PR merges) fires `build-image` automatically without manual tag re-push.
- [ ] `RESEND_FROM_ADDRESS` boot-fail-fast throws on the placeholder in production; integration test covers it.
- [ ] `apps/web/app/api/health/route.ts` returns 200 healthy + 503 unhealthy; Vitest covers both branches.
- [ ] `apps/web/playwright.config.live.ts` + `e2e/live/smoke.spec.ts` exist; live-smoke passes against `https://todos-for-dues.haynesops.com` 3× no-flake.
- [ ] `docs/ops/runbook.md` has 10 sections; each ends with a `Last verified` line.
- [ ] Cross-plan invariants all green (PLAN-003 / PLAN-005 / PLAN-006 / PLAN-007 / PLAN-008 / PLAN-010 / PLAN-011 / PLAN-012 / PLAN-014). Confirm in PR body.
- [ ] One PR; conventional-commit title; squash-merge.

## 6. Out of scope

- **Grafana dashboards + alerts.** Defer to a follow-up PLAN-015 (Observability). Iterative via the Grafana MCP server; doesn't need a Markdown plan.
- **Pre-beta validation plan** (PLAN-009's 3 deferred user-driven gates). Separate plan when launch-chapter widens.
- **Email delivery of invite URLs** (PRD-003 §10 backlog). Separate plan.
- **`enforce_admins: true` flip** on `main` branch protection. One-off coordinator action post-launch.
- **Required-status-check on `e2e`.** Advisory-only here; flip after 2 weeks of green runs.
- **Full walking-skeleton click-through against live.** Live smoke is read-only.
- **Multi-instance dashboards.** REL-002+.
- **All 8 items in §3.1.** Tracked for follow-up; explicitly NOT fixed here. The two batch-bug items (#1 `demoteAllOtherAdmins`, #2 invites count race) are worked around via per-suite invocations in `e2e.yml` — that's a real workaround, not a fix.

## 7. Risks & gotchas

### Risk 1 — Subagent A's `release: types: [published]` swap doesn't actually fire build-image

The hypothesis is that `release` events fire even from `GITHUB_TOKEN`-created Releases. Verify: after this PR merges and release-please opens v0.7.0, the v0.7.0 release-PR's squash-merge → release-please creates the v0.7.0 tag AND a GitHub Release; the `release.published` event SHOULD fire `build-image`. If it doesn't, the `GITHUB_TOKEN` trap applies to `release` events too, and we need the PAT fallback (Plan §7 Risk 1 fallback: add `RELEASE_PLEASE_PAT` secret and switch release-please-action to use it).

**Mitigation:** Subagent A's report MUST flag whether they verified this assumption (by reading the GitHub docs or the release-please-action source) or whether it's an untested change. If untested, the validator confirms by triggering a synthetic release after merge.

### Risk 2 — `my-postings.spec.ts` flake is a deeper bug than dev-server compile-lag

If Subagent B's root-cause investigation finds it's a real correctness bug (e.g., race in `jobs.listMyPosted` or in the JobsList client component's state propagation), the fix is bigger than a test-tweak. Subagent B escalates to the main agent rather than papering over with `--workers=1`.

### Risk 3 — Health route adds an unintended DB query on the readiness path

`/api/health` runs `SELECT 1` on every probe. With a 10s probe interval that's 6 queries/min, trivial. But if the DB is slow under load, the probe could fail → pod cycles. Mitigation: 3s timeout on the `db.execute` call; treat timeout-as-degraded (503) rather than blocking the probe.

### Risk 4 — `playwright.config.live.ts` shares helpers with `playwright.config.ts` and breaks local

If the live config imports from `e2e/walking-skeleton/support/` or `e2e/admin/support.ts`, ensure the imports don't reach for `DATABASE_URL` (no DB access in live mode). Subagent C audits.

### Risk 5 — The `e2e` workflow runs Playwright on EVERY PR — wall time

A full `pnpm --filter web e2e` run today is ~5 minutes locally. On a free GitHub runner with cold caches it could be 10-15 minutes. Mitigation: `concurrency` group cancels stale PR runs; `cache: pnpm` on `setup-node`; Playwright browser cache via `actions/cache`. If wall time still bothers, split into `e2e-fast` (walking-skeleton + mvp + admin) and `e2e-slow` (chained + SSO) workflows — but only if needed.

### Risk 6 — Cross-plan invariants

The same list as PLAN-014's prompt. The new `e2e.yml` workflow doesn't change any of them. The health-route Vitest spec adds to `pnpm --filter web test` count. The mvp pageerror retrofit adds to `pnpm --filter web e2e` count by ~0 (same specs, just more reliable).

## 8. Resume points

- After Step 0: branch created.
- After Step 1: foundation locked (helper signature, health stub, e2e workflow shell).
- After Step 2: three subagents reporting; integrate.
- After Step 3: cross-plan invariants green.
- After Step 4: live smoke green against v0.6.0.
- After Step 5: PR opened; CI green.
- After Step 6: Gate 1.
- After Step 7: merged.
- After Step 8: haynes-ops probe bump landed + backlog updated.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | `release: types: [published]` trigger vs. PAT-on-release-please-action? Lean: **`release` trigger** — cleaner, no secret management. Falls back to PAT if the trigger doesn't actually fire build-image. | Implement `release` trigger; subagent A verifies. |
| Q-PLN-02 | Should `e2e.yml` be required-status-check on day one? Lean: **no** — flaky-on-day-one would block all merges. Flip to required after 2 weeks of green main runs. | Advisory-only; backlog item for the flip. |
| Q-PLN-03 | `/api/health` shape — include `version: process.env.APP_VERSION`? Lean: **yes** — handy for smoke checks to confirm the right image is serving. Source the value from a build-time env var (release-please can stamp it). | Include `version` field; sourced from `APP_VERSION` env or fallback to `'dev'`. |
| Q-PLN-04 | `my-postings.spec.ts` flake — fix parallel-safe or accept `--workers=1`? Lean: **fix parallel-safe** if it's a Next.js compile-lag issue (cheap fix via `waitForLoadState`). If it's a deeper isolation bug, document `--workers=1` and move on. | Subagent B's call after investigation. |
| Q-PLN-05 | `docs/ops/runbook.md` — single file vs. split into `docs/ops/*.md` per topic? Lean: **single file** for MVP — scannable in one place; split if it grows beyond ~500 lines. | Single file. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-16 | Tom Haynes | Initial Draft. Three artefacts: deployed-Playwright smoke + ops runbook + Grafana dashboards/alerts. Circuit-breaker said reshape post-deploy. |
| 2026-05-17 | Tom Haynes | **Reshaped Draft → Proposed** after today's v0.5.0 + v0.6.0 deploys. New three-track scope: CI/release automation (Playwright in CI + `GITHUB_TOKEN`-tag trap fix + `RESEND_FROM_ADDRESS` fail-fast); test hygiene (`installPageerrorListener` retrofit + `my-postings` flake fix); live smoke + health + runbook. **Grafana dashboards + alerts deferred to PLAN-015** (iterative via MCP, doesn't need a Markdown plan). Folds in the backlog items the coordinator has tracked since handoffs 008/009/010. Paired with VALIDATION-013 (also reshaped). |
| 2026-05-17 | Tom Haynes | **Iteration 2 reality captured (post-execute-agent first CI run).** Original three-track scope landed clean (PR #27 — required CI green). Advisory CI surfaced (a) GHA cold-runner compile-lag, (b) pre-existing `demoteAllOtherAdmins` cross-spec clobber, (c) pre-existing `admin/invites.spec.ts` count race. Iteration 2 added `globalSetup.ts:prewarmRoutes()` + global `expect.timeout: 15_000` + `signInAs`/`reAuth`/`driveToLocked` hardening + per-suite invocation in `e2e.yml` (the latter is a workaround for the two pre-existing batch bugs, not a fix). All 8 architecture follow-ups now tracked in §3.1 — explicitly out of scope per §6 but required before flipping `e2e` to required-status-check. Bonus: `mvp/support.ts:postJob` compile-lag fix lifted the whole local mvp suite to 3× DEFAULT-workers green. `my-postings` parallel-flake closed parallel-safe (no `--workers=1` fallback). |
| 2026-05-18 | Tom Haynes | **Iteration 3 — trap-fix UNVERIFIED.** Post-v0.7.0 release: `release: types: [published]` events from `GITHUB_TOKEN` are ALSO suppressed (not just tag-push). Subagent A's hypothesis was wrong; PLAN-013 §7 Risk 1 anticipated this possibility. The swap on its own made things WORSE: the prior `push: tags` escape hatch was removed, so manual tag re-push stopped working too. **Recovery:** re-published v0.7.0 release from user context via `gh release delete + gh release create` → that fired `build-image` correctly → v0.7.0 landed in GHCR. **Follow-up fix** (separate `fix(ci):` PR, same cycle): restored `push: tags` trigger as hybrid fallback alongside the `release` trigger so BOTH workarounds work going forward. Runbook §9 rewritten to document both paths. Added §3.1 item #9 — PAT for release-please as the actual long-term fix. |
| 2026-05-18 | Coordinator | **MVP wrap-up — §3.1 follow-ups closed.** §3.1 #1 partially closed (PR #35 scope-narrowed `demoteAllOtherAdmins`; chapter-state pair amendment documented — needs trigger chapter-scoping, deferred as architectural). §3.1 #2 closed (PR #35 UUID self-filter). §3.1 #3 closed (PR #36 full suite-level collapse; 3× green under DEFAULT workers / `fullyParallel: true`). §3.1 #9 closed (PR #31 PAT; verified by v0.7.2 + v0.7.3 auto-builds). §3.1 #10 added + closed same cycle (PR #36 `signInAs` glob fix). Remaining open: §3.1 #4 (`e2e` → required-status-check, awaiting 2 weeks of green main), #5 (cold-runner wall time, optimization), #6 (`RESEND_FROM_ADDRESS` → `instrumentation.ts`, refactor), #7 (`/api/health` Vitest mock helper, refactor), #8 (smoke spec strictness against pre-v0.7.x, resolves itself after v0.7.3 deploys). Runbook §9 updated with PAT-resolution banner. Coordinator-cycle PR commits prompts 033 + 034 + 035 + handoff 014. |
