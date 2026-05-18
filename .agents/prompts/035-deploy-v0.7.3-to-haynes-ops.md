# Prompt for Claude Code agent — Deploy v0.7.3 to haynes-ops (MVP wrap-up)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent — load `.agents/profiles/developer.md` first** (the user said so explicitly).

## Your task

Bump the live `todos-for-dues` instance at `https://todos-for-dues.haynesops.com` from **v0.6.0** (currently deployed) to **v0.7.3** via a haynes-ops GitOps PR + Flux reconcile + smoke checks.

v0.7.3 bundles the three intermediate releases (v0.7.0 + v0.7.1 + v0.7.2 + v0.7.3) into one deploy hop. **No user-facing UI/feature changes** — this is an INFRA + test-infra wrap-up release. Highlights:

- **`/api/health` endpoint** (v0.7.0, PLAN-013 Track C) — returns `{ status, version, db }` with 200/503. K8s probes flip from `/` → `/api/health` in this same haynes-ops PR.
- **`RESEND_FROM_ADDRESS` boot-fail-fast** (v0.7.0, PLAN-013 Track A) — pod fails fast at boot in production if the env var is missing or the placeholder.
- **`GITHUB_TOKEN` tag-trap closed** (v0.7.1 hybrid trigger + v0.7.2 PAT in PR #31) — release-please now auto-fires `build-image` on `release.published` without manual recovery. Verified by v0.7.2 + v0.7.3 auto-builds.
- **e2e test-infra hardening** (v0.7.2 PR #35 + v0.7.3 PR #36) — `demoteAllOtherAdmins` scope-narrowed, `invites.spec.ts` UUID self-filter, `signInAs` glob fixed, workflow collapsed. Test files only — no runtime change.

## Working directories

- **SaaS repo:** `/Users/thaynes/src/projects/todos-for-dues` (read-only for this run).
- **GitOps repo:** `~/src/labspace/haynes-ops` (the deploy PR opens here).

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — §10–§13 are the relevant sections (haynes-ops loop).
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md`.
4. **`.agents/context/014-coordinator-handoff-2026-05-18-mvp-wrap-up.md`** — most-recent self-handoff; captures the trap-closure + the MVP wrap-up state + the deploy queue.
5. `docs/plans/009-deploy-launch-chapter.md` §6 — smoke-check ground truth (carried forward from prior deploys).
6. `docs/plans/013-live-instance-ops-implementation.md` §3 — what shipped in v0.7.0 (the substantive infra changes; v0.7.1/v0.7.2/v0.7.3 are CI + test-infra only, no runtime).
7. `docs/ops/runbook.md` — full runbook; §9 (now banner: trap RESOLVED) is the post-deploy reference if anything goes sideways.
8. `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml` — the file you'll modify. Image tag is currently `v0.6.0` at line ~49 (YAML anchor `&mainImage`).
9. `.agents/prompts/032-deploy-v0.7.0-to-haynes-ops.md` — the prior deploy prompt, NOT to follow blindly. It targets v0.7.0; this run targets v0.7.3. Use it as a template for the helmrelease diff but bump every tag reference.

## What you already know without checking

- **No new migrations.** v0.6.0 → v0.7.3 has zero SQL changes (`packages/db/migrations/` unchanged at 8 files). Schema-stable bump.
- **No new env vars** for the pod's normal operation. `RESEND_FROM_ADDRESS` was already set on v0.6.0 (chapter uses a verified Resend sender per current secret); the v0.7.0 fail-fast just enforces it. Verify the existing value is non-placeholder before deploying.
- **v0.7.3 image is in GHCR.** Coordinator confirmed via the v0.7.3 release CI run on `event=release` with `build-image` conclusion `success` (the PAT auto-fire pattern, now in its second consecutive verification).
- **Branch protection on haynes-ops `main`:** ON.

## Your loop (per developer profile §10–§13)

### Step 1 — Branch haynes-ops + bump image tag + probe paths

```sh
cd ~/src/labspace/haynes-ops
git fetch origin main && git checkout main && git pull --ff-only origin main
git checkout -b bump-todos-for-dues-v0.7.3
```

Edit `kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml`:

1. **Image tag pin (line ~49 — YAML anchor):**
```diff
            image: &mainImage
              repository: ghcr.io/thaynes43/todos-for-dues
-              tag: v0.6.0
+              tag: v0.7.3
              pullPolicy: IfNotPresent
```

2. **Readiness + liveness + startup probes** (currently `httpGet: { path: /, port: 3000 }`):
```diff
            probes:
              liveness:
                enabled: true
                custom: true
                spec:
                  httpGet:
-                    path: /
+                    path: /api/health
                    port: 3000
                  initialDelaySeconds: 15
                  periodSeconds: 30
                  timeoutSeconds: 5
                  failureThreshold: 3
              readiness:
                enabled: true
                custom: true
                spec:
                  httpGet:
-                    path: /
+                    path: /api/health
                    port: 3000
                  initialDelaySeconds: 5
                  periodSeconds: 10
                  timeoutSeconds: 3
                  failureThreshold: 3
              startup:
                enabled: true
                custom: true
                spec:
                  httpGet:
-                    path: /
+                    path: /api/health
                    port: 3000
                  initialDelaySeconds: 5
                  periodSeconds: 5
                  timeoutSeconds: 3
                  failureThreshold: 24
```

Three probes total: liveness, readiness, startup. All flip from `/` to `/api/health`. The new endpoint returns 503 if the DB is unreachable, so Flux will correctly mark the pod NotReady on DB outages (the old `/` always returned 200 even when DB was down).

### Step 2 — Verify the existing RESEND env var (still v0.6.0 pod)

Before pushing the helmrelease change, exec into the running v0.6.0 pod and confirm `RESEND_FROM_ADDRESS` is NOT the placeholder:

```sh
kubectl exec -n frontend deploy/todos-for-dues -c app -- printenv RESEND_FROM_ADDRESS
```

Expected output: a real verified-sender address (per the helmrelease's `env:` block / the current secret). NOT `noreply@todos-for-dues.app` (the v0.6.0-and-earlier placeholder) or empty.

If the value is the placeholder, the v0.7.0+ pod fail-fast trips at boot → CrashLoopBackOff. **Stop the deploy + escalate to the user before pushing.** Fix the env var first, then re-attempt.

### Step 3 — Commit + push + open PR

```sh
git add kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml
git commit -m "$(cat <<'EOF'
feat(todos-for-dues): bump v0.6.0 → v0.7.3 — /api/health probes + SDLC wrap-up

Three-minor bump (v0.6.0 → v0.7.3) bundles the MVP wrap-up:

v0.7.0 — INFRA release. /api/health endpoint (probes flip from / to
  /api/health). RESEND_FROM_ADDRESS boot-fail-fast in production.
  Initial release-trap fix attempt (release: types: [published]
  trigger — turned out incomplete).

v0.7.1 — hybrid trigger fallback (push: tags restored alongside
  release-published) so manual tag re-push remains a recovery path
  if the PAT is ever rotated/revoked.

v0.7.2 — first auto-build via RELEASE_PLEASE_PAT (PR #31).
  GITHUB_TOKEN-trap closed. e2e test-infra hardening: scope-narrowed
  demoteAllOtherAdmins, UUID self-filter on invites count.

v0.7.3 — second consecutive auto-build (trap-closure verified).
  signInAs waitForURL glob mismatch closed; e2e workflow collapsed
  to single-invocation main (chapter-state roles pair preserved).

No new migrations between v0.6.0 and v0.7.3 — schema-stable bump.
No new env vars for normal operation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin bump-todos-for-dues-v0.7.3
gh pr create --base main --head bump-todos-for-dues-v0.7.3 \
  --title "feat(todos-for-dues): bump v0.6.0 → v0.7.3 — /api/health probes + SDLC wrap-up" \
  --body "$(cat <<'EOF'
## Summary
- Bumps todos-for-dues from v0.6.0 → v0.7.3.
- Bundles v0.7.0 (`/api/health` + probe-path bump + `RESEND_FROM_ADDRESS` fail-fast), v0.7.1 (hybrid release trigger), v0.7.2 (PAT auto-build verified), v0.7.3 (e2e infra wrap-up).
- No new migrations between v0.6.0 and v0.7.3. No new env vars.

## Test plan
- [ ] CI on this PR green (Flux Local manifest validation).
- [ ] Existing `RESEND_FROM_ADDRESS` env var in the live secret is non-placeholder (verified pre-deploy via kubectl exec).
- [ ] After merge: `flux reconcile source git haynes-ops -n flux-system` + `flux reconcile helmrelease todos-for-dues -n frontend`.
- [ ] New v0.7.3 pod becomes Ready (probes now hit `/api/health`).
- [ ] Smoke (PLAN-009 §6 + PLAN-013): HTTP 200 on `/`, `/api/health` returns `{ status: 'ok', db: true }`, pod logs quiet, `chapter_settings` populated, migrate init no-op.
- [ ] Live smoke spec passes all 3 cases (incl. `/api/health` which was the expected-fail against v0.6.0).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for Flux Local CI to go green. Do NOT merge.

### Step 4 — ╔══ GATE 3: STOP ══╗

Tell the user:

> haynes-ops PR #N is up. Bumps `todos-for-dues` to v0.7.3 (image + 3 probe paths). CI green. RESEND_FROM_ADDRESS verified non-placeholder on the live pod. Want me to merge + reconcile?

**Wait for explicit authorization.** Do not merge on your own.

### Step 5 — Merge + reconcile (only after user says go)

```sh
gh pr merge <N> --squash --delete-branch -R thaynes43/haynes-ops
flux reconcile source git haynes-ops -n flux-system
flux reconcile helmrelease todos-for-dues -n frontend
```

Wait for the new pod to be Ready:

```sh
until kubectl get pods -n frontend -l app.kubernetes.io/name=todos-for-dues \
  -o jsonpath='{.items[?(@.spec.containers[0].image=="ghcr.io/thaynes43/todos-for-dues:v0.7.3")].status.containerStatuses[0].ready}' \
  2>/dev/null | grep -q true; do sleep 4; done
```

Startup probe has `failureThreshold: 24` × 5s = 2 min grace before liveness kicks in. Plenty for Next.js boot + first compile.

### Step 6 — Smoke checks (PLAN-009 §6 + v0.7.0-specific)

Run these explicitly and report each:

- **HTTP 200 on `/`** — `curl -sI https://todos-for-dues.haynesops.com/` returns `HTTP/2 200`.
- **`/api/health` returns 200 + healthy JSON** — `curl -s https://todos-for-dues.haynesops.com/api/health` returns `{ "status": "ok", "version": "...", "db": true }` with `HTTP/2 200`. The `version` field should read `v0.7.3` (or whatever `APP_VERSION` is stamped in the image build).
- **Auth handler returns 4xx on bad payload** — `curl -s -o /dev/null -w '%{http_code}' -X POST .../api/auth/sign-in/email -H 'content-type: application/json' -d '{"email":"x","password":"x"}'` returns 4xx.
- **Test-only routes return 404 in prod** — `curl -s -o /dev/null -w '%{http_code}' .../api/test/seed-user` returns 404.
- **Pod logs quiet on boot** — `kubectl logs -n frontend deploy/todos-for-dues -c app --tail=200` shows no `ERROR` lines after the Next.js boot banner. Specifically, NO `RESEND_FROM_ADDRESS` fail-fast trip (confirms the env var is non-placeholder).
- **`chapter_settings` populated** — `kubectl exec -n frontend cluster16-1 -- psql -U todos_for_dues -d todos_for_dues -c 'SELECT key, value FROM chapter_settings;'` returns 5 rows with real values.
- **Migrate init clean** — `kubectl logs -n frontend -l app.kubernetes.io/name=todos-for-dues -c migrate --tail=20` shows "no pending migrations" / no-op (no new SQL between v0.6.0 and v0.7.3).
- **Live smoke spec passes 3/3** — `LIVE_URL=https://todos-for-dues.haynesops.com pnpm --filter web e2e:live` exits 0. The third case (`/api/health` returns 200) was expected-fail against v0.6.0; should pass against v0.7.3.

### Step 7 — Final report

Under 300 words. Headline: tag, image SHA, smoke results (all 8 above with explicit pass/fail per item), pod status, haynes-ops PR URL. Confirm the live smoke is now 3/3 green.

## What you do NOT do

- **Do not bump beyond v0.7.3.** If v0.8.0+ exists in GHCR (release-please opened it overnight), stop and escalate — the coordinator wants v0.7.3 specifically as the MVP wrap-up deploy.
- **Do not modify the SaaS repo.** Deploy-only run.
- **Do not delete cluster state.**
- **Do not `flux reconcile` before the haynes-ops PR is merged.**
- **Do not bypass Gate 3.**
- **Do not attempt manual `gh release create` recovery for the v0.7.3 image** — the PAT has been verified; if the image is missing from GHCR, something else is wrong (escalate, don't paper over).

## If you get stuck

Escalate with: which step, exact symptom, what you tried, your lean.

Particular candidates:
- **v0.7.3 image not in GHCR** — if `docker pull ghcr.io/thaynes43/todos-for-dues:v0.7.3` fails, the PAT may have rotated/expired. Check `gh run list --event=release --workflow=ci.yml --limit=5` for the v0.7.3 release-event run; check the `build-image` job's logs. Coordinator + user have the runbook §9 fallbacks documented; you'd hand off rather than execute them yourself.
- **Pod fails liveness probe on v0.7.3** — `/api/health` returns 503 → DB unreachable. Tail `migrate` init logs first; then app logs. Likely a network policy or DB role drift. Don't paper over with a probe-path revert; investigate.
- **`RESEND_FROM_ADDRESS` fail-fast trips at boot** — the env var is misconfigured. Stop the deploy, surface to the user, fix the secret, redeploy.
- **Pod is Ready but `/api/health` returns 500** — bug in the new route handler. Roll back via `git revert` of the haynes-ops PR + open a `fix(web):` PR in the SaaS repo (hand to coordinator).
- **Live smoke fails on `/api/health`** even when the curl from your local terminal returns 200 — likely a baseURL or `LIVE_URL` env mismatch in `playwright.config.live.ts`. Re-read the config; the issue is local, not live.

Begin.
