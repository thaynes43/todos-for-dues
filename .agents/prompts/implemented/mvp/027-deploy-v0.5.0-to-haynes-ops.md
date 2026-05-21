# Prompt for Claude Code agent — Deploy v0.5.0 to haynes-ops

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent for this prompt — load `.agents/profiles/developer.md` first** (the user said so explicitly).

## Your task

Bump the live `todos-for-dues` instance at `https://todos-for-dues.haynesops.com` from **v0.2.2** to **v0.5.0** via a haynes-ops GitOps PR + Flux reconcile + smoke checks. This catches the live chapter up on three SemVer minors of user-visible MVP UI work:

- **v0.3.0** — PLAN-010: MVP job-loop UI completion (reject / reschedule / cancel / unenroll / revert / dispute / list views).
- **v0.4.0** — PLAN-011: Admin view UI (Dashboard / Disputes drill-in + resolve / Settings save-on-blur / Audit log / Users shell).
- **v0.5.0** — PLAN-012: Role management UI (profile self-service / Admin Users list / role history / min-Admin error UX).

## Working directories

- **SaaS repo:** `/Users/thaynes/src/projects/todos-for-dues` (this is where the kickoff prompt + plans live; you read from here, but you make NO commits here).
- **GitOps repo:** `~/src/labspace/haynes-ops` (this is where the actual deploy PR opens).

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — the developer role, the 3-gate flow, the smoke-check pattern. **Sections §10–§13 are the meat of THIS task** (bump the GitOps manifest, Gate 3, reconcile + smoke, final report). Sections §1–§9 are inapplicable here — you are NOT writing app code, you are NOT opening a feature PR in the SaaS repo, you are NOT cutting a release tag. All of that work already happened.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root context (Pull-request flow + Release versioning sections; you'll also see how the live deploy was bootstrapped in PLAN-009).
4. **`.agents/context/009-coordinator-handoff-2026-05-17-late-evening.md`** — most-recent self-handoff. Live-state snapshot: what's deployed, what's pending, the cross-plan invariants.
5. **`docs/plans/009-deploy-launch-chapter.md`** §6 (smoke checks) — the smoke-check ground truth for live deploys. Reuse the same gates here; do not invent new ones.
6. `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml` — the only file you'll modify. Image tag pin is currently `v0.2.2` at line 49 (the init-container `migrate` step), reused via YAML anchor `*mainImage` for the `app` container at line 59. Bump BOTH (the anchor handles it — one line edit).
7. Latest `CHANGELOG.md` on the SaaS repo's main — confirms what's included in v0.5.0 vs. v0.2.2.

## What you already know without checking

- **No new migrations between v0.2.2 and v0.5.0.** The coordinator verified `git log a4fc072..HEAD -- packages/db/migrations/` is empty. Schema-stable bump; the init-container `migrate` step will be a no-op against the live DB.
- **No new env vars.** Same shape as v0.2.2 — `BOOTSTRAP_ADMIN_EMAIL`, the OIDC trio, `RESEND_*`, etc.
- **GHCR image visibility:** previously flipped to public during PLAN-009 deploy. `:v0.5.0` will inherit.
- **Branch protection on haynes-ops main:** ON (per haynes-ops norms). PR-flow + Gate 3 review.

## Your loop (per developer profile §10–§13)

### Step 1 — Branch haynes-ops + bump the image pin

```sh
cd ~/src/labspace/haynes-ops
git fetch origin main && git checkout main && git pull --ff-only origin main
git checkout -b bump-todos-for-dues-v0.5.0
```

Edit `kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml`:

```diff
             image: &mainImage
               repository: ghcr.io/thaynes43/todos-for-dues
-              tag: v0.2.2
+              tag: v0.5.0
               pullPolicy: IfNotPresent
```

That's the only change. The YAML anchor (`&mainImage`) propagates the new tag to the `app` container automatically.

### Step 2 — Commit + push + open PR

```sh
git add kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml
git commit -m "$(cat <<'EOF'
feat(todos-for-dues): bump to v0.5.0 — MVP UI loop + Admin view + role mgmt

Catches the live chapter up on three SemVer minors of user-visible MVP
UI work that landed in the SaaS repo today:

- v0.3.0 — PLAN-010: MVP job-loop UI completion (reject / reschedule /
  cancel / unenroll / revert / dispute / list views per PRD-002 R-08..
  R-11 + PRD-004 R-03..R-11 + PRD-005 R-05 + PRD-006 R-05).
- v0.4.0 — PLAN-011: Admin view UI (Dashboard with aggregate counts,
  Disputes drill-in with in-place resolution, per-field save-on-blur
  Settings, find-by-job-ID audit log, Users shell — PRD-007 R-01..R-10
  + PRD-006 R-08..R-10 Admin side).
- v0.5.0 — PLAN-012: role management UI (profile self-service Active↔
  Alumni round-trip, Admin Users list, per-user role history, the
  MinAdminErrorBanner with contextual "promote first" link — PRD-008
  R-01..R-10).

No new migrations between v0.2.2 and v0.5.0 — schema-stable bump.
No new env vars — same shape as the v0.2.2 deploy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin bump-todos-for-dues-v0.5.0
gh pr create --base main --head bump-todos-for-dues-v0.5.0 \
  --title "feat(todos-for-dues): bump to v0.5.0 — MVP UI loop + Admin view + role mgmt" \
  --body "$(cat <<'EOF'
## Summary
- Bumps todos-for-dues from v0.2.2 → v0.5.0.
- Includes PLAN-010 (MVP job-loop UI), PLAN-011 (Admin view), PLAN-012 (role management).
- No migrations or env-var changes vs v0.2.2 — schema-stable.

## Test plan
- [ ] CI on this PR green (Flux Local manifest validation if present).
- [ ] After merge: `flux reconcile source git haynes-ops -n flux-system` + `flux reconcile helmrelease todos-for-dues -n <ns>`.
- [ ] Pod becomes Ready on the new image tag.
- [ ] Smoke (mirroring PLAN-009 §6): HTTP 200 on /, auth handler 4xx on bad payload, no test-only routes in prod, pod logs quiet on boot, chapter_settings rows present.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for whatever CI runs on haynes-ops (manifest-render validation, if present). Do NOT merge.

### Step 3 — ╔══ GATE 3: STOP ══╗

Tell the user:

> haynes-ops PR #N is up. Bumps `todos-for-dues` to v0.5.0. CI green (or note any failures). This is the deploy moment — want me to merge + reconcile?

**Wait for explicit user authorization.** Do not merge on your own. The user may want to time the deploy (avoid Friday 5pm), pre-stage announcement, etc.

### Step 4 — Merge + reconcile (only after user says go)

```sh
gh pr merge <N> --squash --delete-branch -R thaynes43/haynes-ops
flux reconcile source git haynes-ops -n flux-system
flux reconcile helmrelease todos-for-dues -n <namespace-from-ks.yaml>
```

Wait for the new pod to be Ready:

```sh
until kubectl get pods -n <ns> -l app.kubernetes.io/name=todos-for-dues \
  -o jsonpath='{.items[?(@.spec.containers[0].image=="ghcr.io/thaynes43/todos-for-dues:v0.5.0")].status.containerStatuses[0].ready}' \
  2>/dev/null | grep -q true; do sleep 4; done
```

### Step 5 — Smoke checks (PLAN-009 §6 ground truth)

Run these explicitly and report each:

- **HTTP 200 on `/`** — `curl -sI https://todos-for-dues.haynesops.com/` returns `HTTP/2 200`.
- **Auth handler returns 4xx, not 5xx, on a known-bad payload** — `curl -s -o /dev/null -w '%{http_code}' -X POST https://todos-for-dues.haynesops.com/api/auth/sign-in/email -H 'content-type: application/json' -d '{"email":"x","password":"x"}'` returns 4xx (likely 400 or 401).
- **Test-only routes return 404 in prod** — `curl -s -o /dev/null -w '%{http_code}' https://todos-for-dues.haynesops.com/api/test/seed-user` returns 404.
- **Pod logs quiet on boot** — `kubectl logs -n <ns> deployment/todos-for-dues -c app --tail=200` shows no `ERROR` lines after the Next.js boot banner.
- **chapter_settings populated** — exec into the postgres pod and `SELECT key, value FROM chapter_settings;` shows the 5 MVP keys with real values (not placeholders).
- **Migration ran clean** — `kubectl logs -n <ns> -l app.kubernetes.io/name=todos-for-dues -c migrate --tail=20` shows "no pending migrations" (or equivalent for the Drizzle wrapper). Should be a fast no-op since v0.2.2 → v0.5.0 has no new migrations.

If anything fails, do not delete the deployment. Tail logs, identify root cause. If the root cause is a SaaS bug, rollback via `git revert` of the haynes-ops PR + open a `fix(...)` PR in the SaaS repo (you'd hand that off back to the coordinator — don't write the fix here).

### Step 6 — Final report (developer profile §13)

Under 300 words. Headline: tag, image, smoke results, pod status. Anything for the user's follow-up checklist (e.g., "GHCR visibility flipped automatically — confirmed" or "User-facing announcement still to send").

## What you do NOT do

- **Do not bump beyond v0.5.0.** If v0.6.0 exists in GHCR by the time you run, stop and escalate — that means a later release happened that the coordinator didn't surface.
- **Do not modify the SaaS repo.** This is a deploy-only run. No app code, no test changes, no docs.
- **Do not delete cluster state** to "start clean" if smoke fails. Investigate.
- **Do not `flux reconcile` before the haynes-ops PR is merged** — reconcile pulls from main; merging is what makes the bump live.
- **Do not bypass Gate 3** even if the user has said "ship it all" earlier in the day. The deploy authorization is per-deploy.

## If you get stuck

Escalate with: which step, exact symptom, what you tried, your lean. The coordinator will help triage. Particular candidates:

- **GHCR pull fails on v0.5.0** — visibility may have reverted, or the build-image workflow didn't fire on the tag. Check `docker pull ghcr.io/thaynes43/todos-for-dues:v0.5.0` locally; if "not found," the build-image workflow likely didn't trigger from the release-please-created tag (GHA security limitation). Workaround: re-push the tag from a user-context (developer profile §9).
- **Pod fails to start with a new error not seen in v0.2.2** — likely a Better Auth schema/session-cookie change between versions. Read the SaaS CHANGELOG for v0.3.0 / v0.4.0 / v0.5.0; check whether any auth migrations slipped in (you've been told they didn't, but verify).
- **The migration init container hangs or errors** — even though there are no new migration files, the `migrate` step still runs. If it errors, the env-var / secret shape may have changed; cross-reference with `ExternalSecret`.

Begin.
