# Prompt for Claude Code agent — Deploy v0.8.0 to haynes-ops (MVP-FIX-C wave deploy)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent — load `.agents/profiles/developer.md` first** (the user said so explicitly).

## Your task

Bump the live `todos-for-dues` instance at `https://todos-for-dues.haynesops.com` from **v0.7.3** (currently deployed) to **v0.8.0** via a haynes-ops GitOps PR + Flux reconcile + smoke checks.

v0.8.0 bundles the entire MVP-FIX-C wave:

- **MVP-FIX-A** (`fix(web):` PR #42, v0.7.4 in CHANGELOG) — `router.refresh()` after mutation `onSuccess` in server-component pages. Closes the stale-UI-after-mutation bug class (Enroll/Unenroll/Approve/Reject buttons not updating without manual refresh).
- **MVP-FIX-B** (`fix(web):` PR #43) — UI polish bundle: nav active-state highlight via `usePathname()`; RBAC gate on `payment_sent` Confirm/Dispute buttons (poster no longer sees them); LockJobForm validation error surfacing.
- **PRD-010 / PLAN-016** (`feat(web):` PR #44) — Job content enrichment: poster contact (email or phone), location, estimated duration, optional notes. New posting form fields + detail view rendering. New migration `0009_job_content_enrichment.sql` (5 new columns on `jobs`).
- **PRD-011 / PLAN-017** (`feat(web):` PR #45) — Job editability before lock: `EditJob` command, material-vs-cosmetic re-moderation rule, `[Re-review]` moderator email prefix, per-enrolled-Active edit notification email. New migration `0010_job_content_changes.sql` (audit table). New FSM transitions per ADR-008 addendum.
- **PRD-012 / ADR-012 / PLAN-018** (`feat(web):` PR #46) — Real-time UI updates via SSE: `/api/events/chapter` route, chapter-scoped event bus, every mutation publishes after commit, client `<RealtimeProvider>` at AppShell mounts one EventSource per session and triggers cross-session UI refresh within ~250ms (debounced).

Schema: **TWO new migrations** between v0.7.3 and v0.8.0 (`0009` + `0010`).
New env vars: **NONE** for the pod's normal operation.

## Working directories

- **SaaS repo:** `/Users/thaynes/src/projects/todos-for-dues` (read-only for this run).
- **GitOps repo:** `~/src/labspace/haynes-ops` (the deploy PR opens here).

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — §10–§13 are the haynes-ops loop.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md`.
4. **`.agents/prompts/implemented/mvp/035-deploy-v0.7.3-to-haynes-ops.md`** — the last deploy prompt. Mirror its shape; bump every `v0.7.3` to `v0.8.0`. Probe paths (`/api/health`) already in place from that deploy — verify they're still set; this run should NOT need to flip them again.
5. `docs/plans/COVERAGE.md` — current state of PRD → plan mappings.
6. `docs/ops/runbook.md` §9 (the GITHUB_TOKEN-trap banner — should be RESOLVED).
7. `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml` — the file you'll modify. Image tag is currently `v0.7.3` (verify before changing).

## What you already know without checking

- **v0.8.0 image is in GHCR.** Coordinator verified the v0.8.0 release CI run on `event=release` with `build-image` conclusion `success` (the PAT auto-fire pattern, now in its 5th consecutive verification).
- **TWO new migrations** apply on first boot of v0.8.0:
  - `0009_job_content_enrichment.sql` — adds 5 columns to `jobs` with DB DEFAULTs (`'email'`, `'unknown'`, `'unknown'`, `1.0`, `NULL`) so existing rows fill in cleanly. Launch chapter has at most a handful of pre-v0.8.0 jobs; backfill is no-op for them in terms of business meaning but the DEFAULTs will land.
  - `0010_job_content_changes.sql` — creates a new audit table `job_content_changes` + an index. No data backfill needed.
- **Probe paths already on `/api/health`** from v0.7.3 deploy. Verify with `kubectl describe pod` post-deploy; do NOT re-edit if already correct.
- **No new env vars.** `RESEND_FROM_ADDRESS` boot-fail-fast still applies; the env var should still be set to the live value from the v0.7.3 deploy.
- **Branch protection on haynes-ops `main`:** ON.

## Your loop (per developer profile §10–§13)

### Step 1 — Branch haynes-ops + bump image tag

```sh
cd ~/src/labspace/haynes-ops
git fetch origin main && git checkout main && git pull --ff-only origin main
git checkout -b bump-todos-for-dues-v0.8.0
```

Edit `kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml`:

```diff
            image: &mainImage
              repository: ghcr.io/thaynes43/todos-for-dues
-              tag: v0.7.3
+              tag: v0.8.0
              pullPolicy: IfNotPresent
```

**Probe paths:** already on `/api/health` from the v0.7.3 deploy. **Do NOT change** unless `grep -A 3 "httpGet:" kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml` shows `path: /` instead of `path: /api/health` (in which case the v0.7.3 deploy was rolled back or the file was reverted — escalate to the user before continuing).

### Step 2 — Pre-flight check on the live v0.7.3 pod

Before pushing the helmrelease change:

```sh
kubectl exec -n frontend deploy/todos-for-dues -c app -- printenv RESEND_FROM_ADDRESS
```

Expected: a real verified-sender address. NOT `noreply@todos-for-dues.app` (placeholder) or empty.

If placeholder/empty: STOP. The v0.8.0 pod's `RESEND_FROM_ADDRESS` fail-fast will trip at boot → CrashLoopBackOff. Surface to the user; fix the secret; re-attempt.

### Step 3 — Commit + push + open PR

```sh
git add kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml
git commit -m "$(cat <<'EOF'
feat(todos-for-dues): bump v0.7.3 → v0.8.0 — MVP-FIX-C wave

Bundles the post-deploy click-through fixes + new features:

- MVP-FIX-A: router.refresh() after mutation onSuccess (stale UI fix)
- MVP-FIX-B: nav active-state + RBAC payment-sent + lock validation
- PRD-010 (PLAN-016): job content enrichment — poster contact, location,
  estimated duration, optional notes
- PRD-011 (PLAN-017): job editability before lock — EditJob command,
  material-vs-cosmetic re-moderation, audit diff, per-Active notifications
- PRD-012 / ADR-012 (PLAN-018): real-time UI updates via SSE
  (/api/events/chapter); cross-session updates within ~250ms

TWO new migrations applied at first boot (additive, no data backfill
required beyond DB DEFAULTs):
  0009_job_content_enrichment.sql
  0010_job_content_changes.sql

No new env vars. Probe paths unchanged (/api/health since v0.7.0).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin bump-todos-for-dues-v0.8.0
gh pr create --base main --head bump-todos-for-dues-v0.8.0 \
  --title "feat(todos-for-dues): bump v0.7.3 → v0.8.0 — MVP-FIX-C wave" \
  --body "$(cat <<'EOF'
## Summary
- Bumps todos-for-dues from v0.7.3 → v0.8.0.
- Bundles MVP-FIX-A (PR #42 stale-UI fix), MVP-FIX-B (PR #43 UI polish), PRD-010 (PR #44 job content enrichment), PRD-011 (PR #45 editability), PRD-012 (PR #46 real-time SSE).
- TWO new migrations apply at first boot. No new env vars. Probe paths unchanged.

## Test plan
- [ ] CI on this PR green (Flux Local manifest validation).
- [ ] Existing `RESEND_FROM_ADDRESS` env var in the live secret is non-placeholder (verified pre-deploy via kubectl exec).
- [ ] After merge: `flux reconcile source git haynes-ops -n flux-system` + `flux reconcile helmrelease todos-for-dues -n frontend`.
- [ ] New v0.8.0 pod becomes Ready (probes still hit `/api/health`).
- [ ] Smoke (PLAN-009 §6 + PLAN-013): HTTP 200 on `/`, `/api/health` returns 200 healthy, `chapter_settings` populated, **migrate init applies 0009 + 0010 cleanly**.
- [ ] Live smoke spec passes 3/3.
- [ ] SSE keepalive verified via `curl -N` (Step 6).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for Flux Local CI to go green. Do NOT merge.

### Step 4 — ╔══ GATE 3: STOP ══╗

Tell the user:

> haynes-ops PR #N is up. Bumps `todos-for-dues` from v0.7.3 → v0.8.0. CI green. `RESEND_FROM_ADDRESS` verified non-placeholder on the live pod. Want me to merge + reconcile?

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
  -o jsonpath='{.items[?(@.spec.containers[0].image=="ghcr.io/thaynes43/todos-for-dues:v0.8.0")].status.containerStatuses[0].ready}' \
  2>/dev/null | grep -q true; do sleep 4; done
```

### Step 6 — Smoke checks (PLAN-009 §6 + v0.8.0-specific)

Run each explicitly and report result:

- **HTTP 200 on `/`** — `curl -sI https://todos-for-dues.haynesops.com/` returns `HTTP/2 200`.
- **`/api/health` 200 + healthy** — `curl -s https://todos-for-dues.haynesops.com/api/health` returns `{ "status": "ok", "version": "v0.8.0", "db": true }`. The `version` field should be `v0.8.0`.
- **Migrate init clean** — `kubectl logs -n frontend -l app.kubernetes.io/name=todos-for-dues -c migrate --tail=40` shows `0009_job_content_enrichment.sql` AND `0010_job_content_changes.sql` applied (or "no pending migrations" if the migrate ran on a prior pod restart and already applied them on a subsequent boot).
- **Schema sanity** — `kubectl exec -n frontend cluster16-1 -- psql -U todos_for_dues -d todos_for_dues -c "\d jobs"` shows the 5 new columns (`poster_contact_kind`, `poster_contact_value`, `location`, `estimated_duration_hours`, `additional_notes`). And `\d job_content_changes` exists with the new table + `idx_job_content_changes_job_id` index.
- **Pod logs quiet on boot** — `kubectl logs -n frontend deploy/todos-for-dues -c app --tail=200` shows no `ERROR` lines after the Next.js boot banner. Specifically: NO `RESEND_FROM_ADDRESS` fail-fast trip; NO SSE route handler errors.
- **`chapter_settings` populated** — `kubectl exec -n frontend cluster16-1 -- psql -U todos_for_dues -d todos_for_dues -c 'SELECT key, value FROM chapter_settings;'` returns 5 rows.
- **SSE endpoint live + keepalive** — `curl -N -H "Cookie: <browser session>" https://todos-for-dues.haynesops.com/api/events/chapter` returns `HTTP/2 200` + `content-type: text/event-stream` + `: connected` immediately + `: keepalive` every ~30s. (Requires a real session cookie copied from devtools.)
- **Live smoke spec passes 3/3** — `LIVE_URL=https://todos-for-dues.haynesops.com pnpm --filter web e2e:live` exits 0.

### Step 7 — Final report

Under 300 words. Headline: image tag, smoke results (8 above with explicit pass/fail per item), pod status, the haynes-ops PR URL, the v0.8.0 image digest.

## What you do NOT do

- **Do not bump beyond v0.8.0.** If v0.8.1+ exists in GHCR (release-please opened a follow-up overnight), STOP and escalate — coordinator wants v0.8.0 specifically as the MVP-FIX-C wave deploy.
- **Do not modify the SaaS repo.** Deploy-only run.
- **Do not delete cluster state.**
- **Do not `flux reconcile` before the haynes-ops PR is merged.**
- **Do not bypass Gate 3.**
- **Do not attempt manual recovery** if the v0.8.0 image is missing — the PAT has been verified 5 times; if it's missing, escalate rather than papering over.

## If you get stuck

Escalate with: (1) which step, (2) exact symptom, (3) what you tried, (4) your lean.

Particular candidates:
- **Migrate init fails on `0009` or `0010`** — likely a schema-state mismatch (e.g., prior partial migration). Surface the migrate logs; do NOT manually patch the DB. Coordinator + user decide.
- **Pod CrashLoopBackOff with `RESEND_FROM_ADDRESS` error** — env var misconfigured; fix the secret, redeploy.
- **`/api/events/chapter` returns 200 but the keepalive never arrives** — likely Traefik buffering. Check `X-Accel-Buffering: no` header on the response; check Traefik IngressRoute config for stream-buffering disabled. ADR-012 C-08 anticipates this.
- **Pod Ready but `/api/health` returns 500** — bug in route handler; roll back haynes-ops PR + open `fix(web):` in SaaS repo (hand to coordinator).

Begin.

---

## Appendix — Manual user-testing checklist (for the human, after the agent reports the deploy is green)

Once v0.8.0 is live, the user can verify each PRD by hand. Order matches the wave's PR sequence:

### A — Stale UI fixes (MVP-FIX-A)
1. Sign in as Active. Open a job in `enrollment_open`. Click Enroll. **The Enroll button should swap to Unenroll within ~500ms without page navigation.**
2. Open `/my-enrollments`. Click Unenroll on a job. **The row should disappear without page navigation.**
3. Sign in as Moderator. Open a job in `awaiting_moderation`. Click Approve. **The state badge should swap to `enrollment_open` without page navigation.**

### B — UI polish (MVP-FIX-B)
4. Navigate around `/jobs`, `/moderation-queue`, `/admin/*`. **The current page's nav link should be bold / highlighted.**
5. As the Active enrolled in a job (drive one to `payment_sent` via the full flow). **You should see Confirm Received + Dispute buttons.**
6. Sign in as the Alumni poster of that same job. **You should NOT see Confirm Received + Dispute buttons** (they're for the recipient).
7. Lock a job. Pick today's date. **You should see "Work date must be in the future." inline** (no silent failure).

### C — Job content enrichment (PRD-010)
8. Post a new job. Fill in all the new fields: contact kind (email or phone), contact value, location, estimated duration, optional notes.
9. Open the resulting job's detail view. **You should see all the new fields rendered. If you chose phone, the contact should be a clickable `tel:` link; if email, a `mailto:` link.**
10. Post another job with a contact value that differs from your account email. **Verify the account email is NOT shown** (privacy R-06).

### D — Job editability before lock (PRD-011)
11. As the Alumni poster of a job in `awaiting_moderation` or `approved` or `enrollment_open`, click Edit job.
12. Change a cosmetic field only (additional notes). Save. **Job state should stay the same.**
13. Change a material field (description, dues, count, location, or duration). Save. **Job state should demote back to `awaiting_moderation`** (banner / toast explains why).
14. If you have enrolled Actives, **they should receive an edit-notification email** (check your Active account's inbox).
15. **Moderator inbox should receive a `[Re-review]`-prefixed email** for the re-moderation.
16. Try to edit a `locked` job. **No Edit button should be visible.**

### E — Real-time UI updates (PRD-012)
17. Open two browsers (Chrome + Firefox, or two separate sessions in different profiles). Sign in as different users (Alumni in one, Active in the other), both viewing `/jobs`.
18. In the Alumni browser, post a new job → moderator approves. **The Active browser should show the new job in the list within ~2 seconds, no manual refresh.**
19. Both browsers viewing the same job's detail page: Alumni edits the description. **Active should see the updated description within ~2 seconds, no manual refresh.**
20. Open browser devtools → Network tab; filter to "event-stream." **You should see one open connection to `/api/events/chapter`** with periodic `keepalive` lines.
21. If you have access to a third terminal: `curl -N -H "Cookie: <paste from devtools>" https://todos-for-dues.haynesops.com/api/events/chapter`. **You should see `: connected`, then `: keepalive` every ~30s, then `id:`/`event:`/`data:` frames when mutations happen.**

### F — Privacy invariant spot-check (PRD-012 R-07)
22. With the curl from step 21 running, post a job whose description contains a unique token like `PRIVATE-PII-TEST-${random}`. **Verify the SSE event for `job.posted` does NOT contain that token in any field** — should only show job_id, event_kind, actor_id, chapter_id, occurred_at, event_id.

If anything fails, capture the URL + screenshots + browser console (and the failing SSE event if relevant) and bring back to the coordinator for triage.
