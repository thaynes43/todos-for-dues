# Prompt for Claude Code agent — Deploy v0.6.0 to haynes-ops

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent for this prompt — load `.agents/profiles/developer.md` first** (the user said so explicitly).

## Your task

Bump the live `todos-for-dues` instance at `https://todos-for-dues.haynesops.com` from **v0.5.0** to **v0.6.0** via a haynes-ops GitOps PR + Flux reconcile + smoke checks. This is a single-minor SemVer bump carrying PLAN-014:

- **Admin invite-management UI** — new `/admin/invites` route + components for minting, listing, and revoking invite tokens (PRD-003 R-11..R-13 + AC-10..AC-12).
- **`/admin` top-nav link** — `RoleAwareNav` now surfaces the existing `/admin/*` area to Admins (closes a UX gap discovered post-v0.5.0).
- **Single-use invite-token redemption (security fix)** — the signup action now atomically marks tokens revoked on successful redemption (PRD-003 R-14 + AC-13). Prior to this fix, a single invite URL could be redeemed by an unlimited number of users until manually revoked.

## Working directories

- **SaaS repo:** `/Users/thaynes/src/projects/todos-for-dues` (read-only for this run; you make no commits here).
- **GitOps repo:** `~/src/labspace/haynes-ops` (the deploy PR opens here).

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — the developer role, the 3-gate flow, smoke-check pattern. **§10–§13 are the meat of THIS task.** §1–§9 don't apply — the feature PR, release PR, and tag-cut already happened.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root context.
4. **`.agents/context/010-coordinator-handoff-2026-05-17-end-of-day.md`** — most-recent self-handoff. v0.5.0 deploy outcome + the `GITHUB_TOKEN`-tag-push workaround the coordinator already applied for v0.6.0 (you don't need to repeat the tag re-push; coordinator did it).
5. `docs/plans/009-deploy-launch-chapter.md` §6 (smoke checks) — the smoke-check ground truth. Reuse the same gates.
6. `docs/plans/014-invite-management-and-admin-nav.md` — what shipped in v0.6.0 (so you can post-deploy click-test the new surface).
7. `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml` — the only file you'll modify. Image tag is currently `v0.5.0` at line 49 (YAML anchor `&mainImage` propagates to both init `migrate` and `app` containers).

## What you already know without checking

- **No new migrations.** PLAN-014 added zero `.sql` files (`packages/db/migrations/` count unchanged at 8). Schema-stable bump; the init-container `migrate` step is a no-op against the live DB.
- **No new env vars.** Same secret shape as v0.5.0 (`BOOTSTRAP_ADMIN_EMAIL`, OIDC trio, RESEND_*, etc.).
- **GHCR image visibility:** public from prior PLAN-009 flip; v0.6.0 inherits.
- **Branch protection on haynes-ops `main`:** ON.
- **v0.6.0 image is already in GHCR.** Coordinator handled the `GITHUB_TOKEN`-tag-push workaround (re-push from user context) before handing this off to you. Verify with `gh api users/thaynes43/packages/container/todos-for-dues/versions --jq '[.[].metadata.container.tags[]] | sort | unique' | grep v0.6.0` if you want a sanity check.

## Your loop (per developer profile §10–§13)

### Step 1 — Branch haynes-ops + bump the image pin

```sh
cd ~/src/labspace/haynes-ops
git fetch origin main && git checkout main && git pull --ff-only origin main
git checkout -b bump-todos-for-dues-v0.6.0
```

Edit `kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml`:

```diff
             image: &mainImage
               repository: ghcr.io/thaynes43/todos-for-dues
-              tag: v0.5.0
+              tag: v0.6.0
               pullPolicy: IfNotPresent
```

That's the only change. The YAML anchor propagates the new tag to the `app` container automatically.

### Step 2 — Commit + push + open PR

```sh
git add kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml
git commit -m "$(cat <<'EOF'
feat(todos-for-dues): bump to v0.6.0 — Admin invite management + nav link + single-use tokens

Single-minor SemVer bump from v0.5.0. Carries PLAN-014:

- Admin invite-management UI: new /admin/invites route with mint /
  list / revoke flows (PRD-003 R-11..R-13). Replaces the prior
  Admin-only-via-raw-SQL workflow for issuing invite links to
  non-SSO chapter members.
- /admin top-nav link: RoleAwareNav now exposes the existing
  /admin/* area to the Admin role (closes a UX gap discovered
  post-v0.5.0 walkthrough).
- Single-use invite tokens (security fix): the signup action now
  atomically marks tokens revoked on successful redemption per
  PRD-003 R-14. Prior to this, a single URL could be redeemed by
  an unlimited number of users. Live chapter has no live invite
  tokens (UI didn't exist) so no compatibility risk.

No new migrations between v0.5.0 and v0.6.0 — schema-stable bump.
No new env vars — same secret shape as the v0.5.0 deploy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin bump-todos-for-dues-v0.6.0
gh pr create --base main --head bump-todos-for-dues-v0.6.0 \
  --title "feat(todos-for-dues): bump to v0.6.0 — Admin invite management + nav link + single-use tokens" \
  --body "$(cat <<'EOF'
## Summary
- Bumps todos-for-dues from v0.5.0 → v0.6.0.
- Includes PLAN-014: Admin invite-management UI + `/admin` nav link + single-use redemption security fix.
- No migrations or env-var changes vs v0.5.0 — schema-stable.

## Test plan
- [ ] CI on this PR green (Flux Local manifest validation if present).
- [ ] After merge: `flux reconcile source git haynes-ops -n flux-system` + `flux reconcile helmrelease todos-for-dues -n <ns>`.
- [ ] Pod becomes Ready on v0.6.0.
- [ ] Smoke (PLAN-009 §6): HTTP 200 on /, auth handler 4xx on bad payload, no test-only routes in prod, pod logs quiet on boot, chapter_settings rows present, migrate init clean (no-op).
- [ ] **PLAN-014-specific smoke:** signed-in Admin sees `/admin` link in top nav; `/admin/invites` route loads and shows empty state; mint generates a URL.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for whatever CI runs on haynes-ops (manifest-render validation, if present). Do NOT merge.

### Step 3 — ╔══ GATE 3: STOP ══╗

Tell the user:

> haynes-ops PR #N is up. Bumps `todos-for-dues` to v0.6.0. CI green (or note any failures). This is the deploy moment — want me to merge + reconcile?

**Wait for explicit user authorization.** Do not merge on your own.

### Step 4 — Merge + reconcile (only after user says go)

```sh
gh pr merge <N> --squash --delete-branch -R thaynes43/haynes-ops
flux reconcile source git haynes-ops -n flux-system
flux reconcile helmrelease todos-for-dues -n <namespace>
```

Wait for the new pod to be Ready:

```sh
until kubectl get pods -n <ns> -l app.kubernetes.io/name=todos-for-dues \
  -o jsonpath='{.items[?(@.spec.containers[0].image=="ghcr.io/thaynes43/todos-for-dues:v0.6.0")].status.containerStatuses[0].ready}' \
  2>/dev/null | grep -q true; do sleep 4; done
```

### Step 5 — Smoke checks (PLAN-009 §6 ground truth + PLAN-014-specific)

Run these explicitly and report each:

- **HTTP 200 on `/`** — `curl -sI https://todos-for-dues.haynesops.com/` returns `HTTP/2 200`.
- **Auth handler returns 4xx, not 5xx, on a known-bad payload** — `curl -s -o /dev/null -w '%{http_code}' -X POST https://todos-for-dues.haynesops.com/api/auth/sign-in/email -H 'content-type: application/json' -d '{"email":"x","password":"x"}'` returns 4xx.
- **Test-only routes return 404 in prod** — `curl -s -o /dev/null -w '%{http_code}' https://todos-for-dues.haynesops.com/api/test/seed-user` returns 404.
- **Pod logs quiet on boot** — `kubectl logs -n <ns> deployment/todos-for-dues -c app --tail=200` shows no `ERROR` lines after the Next.js boot banner.
- **`chapter_settings` populated** — exec into the postgres pod and `SELECT key, value FROM chapter_settings;` shows the 5 MVP keys with real values.
- **Migrate init clean** — `kubectl logs -n <ns> -l app.kubernetes.io/name=todos-for-dues -c migrate --tail=20` shows "no pending migrations" / no-op (no new SQL between v0.5.0 and v0.6.0).
- **PLAN-014 surface — `/admin/invites` route reachable:** `curl -sI https://todos-for-dues.haynesops.com/admin/invites` returns either 200 (if you have a session cookie) or a redirect to `/login` (HTTP 307/302). NOT a 404 or 500. Confirms the route registered.
- **PLAN-014 surface — `/admin` nav link present in HTML for Admin:** harder to assert via curl since the nav is render-time role-aware; flag as a manual click-test for the user (login as Admin, look for the "Admin" entry in the top nav).

If anything fails, do not delete the deployment. Tail logs, identify root cause. If the root cause is a SaaS bug, rollback via `git revert` of the haynes-ops PR + open a `fix(...)` PR in the SaaS repo (you'd hand that off back to the coordinator — don't write the fix here).

### Step 6 — Final report (developer profile §13)

Under 300 words. Headline: tag, image, smoke results, pod status, the two manual-click-test items for the user.

## What you do NOT do

- **Do not bump beyond v0.6.0.** If v0.7.0 exists in GHCR by the time you run, stop and escalate.
- **Do not modify the SaaS repo.** Deploy-only run. No app code, no test changes, no docs.
- **Do not delete cluster state.**
- **Do not `flux reconcile` before the haynes-ops PR is merged.**
- **Do not bypass Gate 3.** Even if the user said "ship it all" earlier in the day — the deploy authorization is per-deploy.

## If you get stuck

Escalate with: which step, exact symptom, what you tried, your lean.

Particular candidates:
- **v0.6.0 image not in GHCR** — the coordinator's tag re-push should have triggered the build, but if `docker pull ghcr.io/thaynes43/todos-for-dues:v0.6.0` fails, the build-image workflow didn't fire. Workaround: `git push origin :refs/tags/v0.6.0 && git push origin v0.6.0` from the SaaS repo (developer profile §9). Flag this back to the coordinator since it's a recurring trap worth automating.
- **Pod fails with an error not seen in v0.5.0** — the only behavior change is the signup-action revoke-first flow. If a sign-in/sign-up error appears, check whether the invite-token UPDATE path is firing correctly. Tail pod logs.
- **Migrate init container errors** — even though there are no new migration files, the step still runs. If it errors, check env-var / secret shape against `ExternalSecret`.

Begin.
