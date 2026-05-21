# Prompt for Claude Code agent — Deploy v0.7.0 to haynes-ops

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent — load `.agents/profiles/developer.md` first** (the user said so explicitly).

## Your task

Bump the live `todos-for-dues` instance at `https://todos-for-dues.haynesops.com` from **v0.6.0** to **v0.7.0** via a haynes-ops GitOps PR + Flux reconcile + smoke checks.

**v0.7.0 is an INFRA release** — no user-facing UI/feature changes. The headline:
- **`/api/health` endpoint** (PLAN-013 Track C) — returns `{ status, version, db }` with 200/503. Used by readiness + liveness probes (you'll bump those in this same haynes-ops PR).
- **`RESEND_FROM_ADDRESS` boot-fail-fast** (PLAN-013 Track A) — if the env var is missing or set to the placeholder in production, the pod fails fast at boot instead of silently sending unverified emails.
- **CI infrastructure: `release: types: [published]` swap for `build-image`** — the trap fix that landed v0.7.0 to GHCR automatically (no manual tag re-push). Coordinator verified pre-deploy.

## Working directories

- **SaaS repo:** `/Users/thaynes/src/projects/todos-for-dues` (read-only for this run).
- **GitOps repo:** `~/src/labspace/haynes-ops` (the deploy PR opens here).

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — §10–§13 are the relevant sections.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md`.
4. **`.agents/context/012-coordinator-handoff-2026-05-17-plan-013-iter2-tracking.md`** — most-recent self-handoff. Captures iteration 2 state + the 8 follow-up items + the post-merge synthetic verification outcome.
5. `docs/plans/009-deploy-launch-chapter.md` §6 — smoke-check ground truth.
6. `docs/plans/013-live-instance-ops-implementation.md` — what shipped in v0.7.0.
7. `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml` — the file you'll modify. Image tag is currently `v0.6.0` at line 49 (YAML anchor `&mainImage`).

## What you already know without checking

- **No new migrations.** PLAN-013 had zero SQL changes (`packages/db/migrations/` unchanged at 8 files). Schema-stable bump.
- **No new env vars** for the pod's normal operation. The `RESEND_FROM_ADDRESS` env var was already set (chapter uses `noreply@sigoalumni.org` per current secret); the new fail-fast just enforces it. Verify the existing value is non-placeholder before deploying.
- **GHCR image visibility:** public; v0.7.0 inherits.
- **Branch protection on haynes-ops `main`:** ON.
- **v0.7.0 image is already in GHCR.** Coordinator confirmed via the `release: types: [published]` synthetic verification (the headline win of PLAN-013).

## Your loop (per developer profile §10–§13)

### Step 1 — Branch haynes-ops + bump image tag + probe paths

```sh
cd ~/src/labspace/haynes-ops
git fetch origin main && git checkout main && git pull --ff-only origin main
git checkout -b bump-todos-for-dues-v0.7.0
```

Edit `kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml`:

1. **Image tag pin (line ~49 — YAML anchor):**
```diff
             image: &mainImage
               repository: ghcr.io/thaynes43/todos-for-dues
-              tag: v0.6.0
+              tag: v0.7.0
               pullPolicy: IfNotPresent
```

2. **Readiness + liveness probes** (currently `httpGet: { path: /, port: 3000 }`):
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

Three probes total: liveness, readiness, startup. All flip from `/` to `/api/health`. The new endpoint returns 503 if the DB is unreachable, so Flux will correctly mark the pod NotReady on DB outages (existing `/` always returned 200).

### Step 2 — Verify the existing RESEND env var

Before pushing the helmrelease change, exec into the running v0.6.0 pod and confirm `RESEND_FROM_ADDRESS` is NOT the placeholder:

```sh
kubectl exec -n frontend deploy/todos-for-dues -c app -- printenv RESEND_FROM_ADDRESS
```

Expected output: something like `TODOs for Dues <noreply@sigoalumni.org>` (per the helmrelease's `env:` block). NOT `noreply@todos-for-dues.app` or empty.

If the value is the placeholder, the v0.7.0 pod will fail-fast at boot. Surface this to the user before deploying — fix the env var first, then deploy.

### Step 3 — Commit + push + open PR

```sh
git add kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml
git commit -m "$(cat <<'EOF'
feat(todos-for-dues): bump to v0.7.0 — /api/health probes + SDLC hardening

Single-minor SemVer bump from v0.6.0. v0.7.0 is an INFRA release —
no user-facing UI/feature changes. Carries PLAN-013:

- /api/health endpoint (replaces / for K8s probes). Returns 200 with
  { status, version, db } when healthy, 503 when DB unreachable.
  Bump readiness + liveness + startup probe paths from / to
  /api/health. Existing / always returned 200 even on DB outages,
  so Flux marks the pod healthy when it shouldn't; the new endpoint
  is honest.
- RESEND_FROM_ADDRESS boot-fail-fast: pod refuses to start in
  production if the env var is missing or the unverified placeholder.
  No behavior change for this chapter (already on
  noreply@sigoalumni.org); pre-empts a future misconfiguration.
- CI infra: release: types: [published] swap closes the
  GITHUB_TOKEN-tag-push trap that has required manual tag re-push
  on every release today. v0.7.0 itself is the first release to
  build automatically (coordinator verified pre-deploy).

No new migrations between v0.6.0 and v0.7.0 — schema-stable bump.
No new env vars for normal operation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin bump-todos-for-dues-v0.7.0
gh pr create --base main --head bump-todos-for-dues-v0.7.0 \
  --title "feat(todos-for-dues): bump to v0.7.0 — /api/health probes + SDLC hardening" \
  --body "$(cat <<'EOF'
## Summary
- Bumps todos-for-dues from v0.6.0 → v0.7.0.
- Includes PLAN-013: `/api/health` route + readiness/liveness/startup probe path bump + `RESEND_FROM_ADDRESS` boot-fail-fast + CI release-trap fix.
- No migrations, no new env vars.

## Test plan
- [ ] CI on this PR green (Flux Local manifest validation).
- [ ] Existing `RESEND_FROM_ADDRESS` env var in the live secret is non-placeholder (verified pre-deploy).
- [ ] After merge: `flux reconcile source git haynes-ops -n flux-system` + `flux reconcile helmrelease todos-for-dues -n frontend`.
- [ ] New v0.7.0 pod becomes Ready (probes now hit `/api/health`).
- [ ] Smoke (PLAN-009 §6 + PLAN-013): HTTP 200 on `/`, `/api/health` returns `{ status: 'ok', db: true }`, pod logs quiet, chapter_settings populated, migrate init no-op.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for Flux Local CI to go green. Do NOT merge.

### Step 4 — ╔══ GATE 3: STOP ══╗

Tell the user:

> haynes-ops PR #N is up. Bumps `todos-for-dues` to v0.7.0 (image + 3 probe paths). CI green. Want me to merge + reconcile?

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
  -o jsonpath='{.items[?(@.spec.containers[0].image=="ghcr.io/thaynes43/todos-for-dues:v0.7.0")].status.containerStatuses[0].ready}' \
  2>/dev/null | grep -q true; do sleep 4; done
```

The startup probe has `failureThreshold: 24` × 5s = 2 min grace period before liveness kicks in. Plenty of time for Next.js boot + first compile.

### Step 6 — Smoke checks (PLAN-009 §6 + PLAN-013-specific)

Run these explicitly and report each:

- **HTTP 200 on `/`** — `curl -sI https://todos-for-dues.haynesops.com/` returns `HTTP/2 200`.
- **`/api/health` returns 200 + healthy JSON** — `curl -s https://todos-for-dues.haynesops.com/api/health` returns `{ "status": "ok", "version": "...", "db": true }` with `HTTP/2 200`.
- **Auth handler returns 4xx on bad payload** — `curl -s -o /dev/null -w '%{http_code}' -X POST .../api/auth/sign-in/email -H 'content-type: application/json' -d '{"email":"x","password":"x"}'` returns 4xx.
- **Test-only routes return 404 in prod** — `curl -s -o /dev/null -w '%{http_code}' .../api/test/seed-user` returns 404.
- **Pod logs quiet on boot** — `kubectl logs -n frontend deploy/todos-for-dues -c app --tail=200` shows no `ERROR` lines after the Next.js boot banner. Specifically, NO `RESEND_FROM_ADDRESS` fail-fast (confirms the env var is non-placeholder + the fail-fast is working as a passive guard).
- **`chapter_settings` populated** — `kubectl exec -n frontend cluster16-1 -- psql -U todos_for_dues -d todos_for_dues -c 'SELECT key, value FROM chapter_settings;'` returns 5 rows with real values.
- **Migrate init clean** — `kubectl logs -n frontend -l app.kubernetes.io/name=todos-for-dues -c migrate --tail=20` shows "no pending migrations" / no-op (no new SQL between v0.6.0 and v0.7.0).
- **Live smoke spec passes** — `LIVE_URL=https://todos-for-dues.haynesops.com pnpm --filter web e2e:live` exits 0. All 3 specs (home + /login + /api/health) pass now that v0.7.0 has the route.

### Step 7 — Final report

Under 300 words. Headline: tag, image, smoke results (all 6 above, with the live smoke as the new headline), pod status, the haynes-ops PR URL.

## What you do NOT do

- **Do not bump beyond v0.7.0.** If v0.8.0 exists in GHCR, stop and escalate.
- **Do not modify the SaaS repo.** Deploy-only run.
- **Do not delete cluster state.**
- **Do not `flux reconcile` before the haynes-ops PR is merged.**
- **Do not bypass Gate 3.**

## If you get stuck

Escalate with: which step, exact symptom, what you tried, your lean.

Particular candidates:
- **v0.7.0 image not in GHCR** — if `docker pull ghcr.io/thaynes43/todos-for-dues:v0.7.0` fails, the trap fix didn't fire after all. Coordinator + user have the PAT fallback queued; you'd hand off to them rather than re-push manually.
- **Pod fails liveness probe on v0.7.0** — `/api/health` returns 503 → DB unreachable. Tail `migrate` init logs first; then app logs. Likely a network policy or DB role drift. Don't paper over with a probe-path revert; investigate.
- **`RESEND_FROM_ADDRESS` fail-fast trips at boot** — the env var is misconfigured. Stop the deploy, surface to the user, fix the secret, redeploy.
- **Pod is Ready but `/api/health` returns 500** — bug in the new route handler. Roll back via `git revert` of the haynes-ops PR + open a `fix(web):` PR in the SaaS repo (hand to coordinator).

Begin.
