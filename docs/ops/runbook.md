---
title: TODOs for Dues — Ops Runbook
status: Living
owner: Tom Haynes
---

# TODOs for Dues — Ops Runbook

Operator-scannable cheat-sheet for the deployed launch chapter
(`https://dues.sigoalumni.org`). Each section is meant to be
read in under 30 seconds during an incident. When a section is verified
against the live environment, bump its `Last verified` stamp.

Companion to: `apps/web/playwright.config.live.ts` (run
`LIVE_URL=… pnpm --filter web e2e:live` for an anonymous smoke pass) and
the `/api/health` readiness endpoint.

---

## 1. Pod logs

Tail the running pod (`-f` follows; drop it for a one-shot read):

```sh
kubectl logs -n frontend deploy/todos-for-dues -f
```

Filter for errors only (use `-i` for case-insensitive):

```sh
kubectl logs -n frontend deploy/todos-for-dues --since=1h | grep -E 'ERROR|FATAL|Unhandled'
```

If the pod is crash-looping, look at the previous container's logs:

```sh
kubectl logs -n frontend deploy/todos-for-dues -p
```

Grafana Loki (richer, longer-retention search) — link:
`https://grafana.haynesops.com/explore?orgId=1&left=…` (TODO: paste the
saved Explore deeplink with `{namespace="frontend",app="todos-for-dues"}`).

<!-- Last verified: 2026-05-17 -->

---

## 2. DB inspection

Open a psql shell inside the cluster against the CNPG primary (cluster
`postgres16` in the `database` namespace — find the primary with
`kubectl -n database get cluster postgres16`):

```sh
kubectl exec -n database -it postgres16-1 -c postgres -- \
  psql -d todos_for_dues
```

<!-- Corrected 2026-08 modernization audit: the old command pointed at a
     nonexistent `frontend/cluster16-1` pod/user. -->

Stuck jobs (something paused in `locked` or `enrollment_open` > 7 days):

```sql
SELECT id, state, updated_at
FROM jobs
WHERE state IN ('locked', 'enrollment_open')
  AND updated_at < NOW() - INTERVAL '7 days'
ORDER BY updated_at;
```

Recent FSM transitions (audit trail per PLAN-002):

```sql
SELECT *
FROM job_state_transitions
ORDER BY transitioned_at DESC
LIMIT 20;
```

Chapters missing `chapter_settings` (should be empty — the row is seeded
with the chapter):

```sql
SELECT id
FROM chapters
WHERE NOT EXISTS (
  SELECT 1 FROM chapter_settings WHERE chapter_id = chapters.id
);
```

NEVER `UPDATE jobs SET state = …` directly — domain invariant lives in
`packages/domain/transitionJob`. If you must repair a row, do it via a
manually-authored `transitionJob` call in `psql`'s `\copy`-equivalent —
or escalate to engineering rather than bypass the FSM.

<!-- Last verified: 2026-05-17 -->

---

## 3. Resend send debugging

Resend dashboard: `https://resend.com/emails`.

The dashboard supports filtering by `Idempotency-Key`. When investigating
a missing notification:

1. Find the expected idempotency key from app logs — every
   `sendEmail` call logs `idempotency_key=<uuid>` at info level.
2. Paste that key into the Resend dashboard's search/filter input
   (top of the Emails list).
3. The matching row shows delivery state (`delivered`, `bounced`,
   `complained`, `queued`), the verified sending domain, and the
   final SMTP response.

If the row is missing entirely, the send never reached Resend — check
`RESEND_API_KEY` and `RESEND_FROM_ADDRESS` in
`kubectl get externalsecret -n frontend todos-for-dues-secret`.
Webhook receipts hit `/api/webhooks/resend` (Svix-signed) and are
logged via `console.warn` for `email.bounced` / `email.complained`.

<!-- Last verified: 2026-05-17 -->

---

## 4. Better Auth session debugging

Inspect a specific user's sessions:

```sql
SELECT id, user_id, expires_at, created_at
FROM session
WHERE user_id = (SELECT id FROM users WHERE email = 'user@example.com');
```

All Better Auth tables (`users`, `session`, `account`, `verification`)
are owned by `packages/db/src/schema/`. There are NO credential
accounts since ADR-013 (portal SSO only) — `account.password` is
dormant; the only live provider rows have `provider_id = 'sigo-portal'`.

Common symptoms and likely causes:

- **Sign-in loop / 302 to /login after OAuth callback** — cookie
  domain mismatch. Check `BETTER_AUTH_URL` matches the public host
  (must be HTTPS in prod) and the cookie's `Domain=` covers the host.
- **`/login?error=membership_pending` after portal sign-in** — working
  as designed: the user's portal tier is `pending` (or missing/unknown
  — fail closed). Verify the member at sigoalumni.org, then have them
  sign in again. Code: `packages/auth/src/hooks/claim-sync.ts`.
- **Sign-in button replaced by an operator note** — one of
  `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_DISCOVERY_URL` is
  unset; auth is disabled (fail closed) but the app boots. Fix the
  ExternalSecret.
- **Wrong role after a portal tier change** — roles re-sync at
  sign-in, not mid-session; have the user sign out/in. If the log
  shows `claim-sync … min-Admin invariant keeps them Admin`, the
  demotion is deferred until another Admin exists.
- **Session expires immediately** — check server clock skew against
  the DB (`SELECT NOW();`); Better Auth uses DB time for `expires_at`.

<!-- Last verified: 2026-08-10 -->

---

## 5. OIDC redirect URI

The exact path Better Auth's `genericOAuth` plugin uses (per PLAN-009
§7 reconciliation, 2026-05-17):

```
https://dues.sigoalumni.org/api/auth/oauth2/callback/{providerId}
```

Where `{providerId}` is `sigo-portal` (`PORTAL_PROVIDER_ID` in
`packages/auth/src/portal-tiers.ts`), so the registered value is:

```
https://dues.sigoalumni.org/api/auth/oauth2/callback/sigo-portal
```

This MUST match the client registration at the sigoalumni.org portal
(members-portal workstream owns the registration; client id
`todos-for-dues`). Trailing slash, scheme, host, and path must match
character-for-character. The discovery/issuer URL is env-driven
(`OIDC_DISCOVERY_URL`) — the portal's Cloud Run origin until the
domain cutover, then https://sigoalumni.org.

Anti-pattern (caused the 2026-05-17 sign-in loop): registering
`/api/auth/callback/oauth/{providerId}` (the older Better Auth path).
That value lets the server-side token exchange complete but the
browser is then redirected to `/login` because the cookie set on the
wrong callback path is not visible to the session middleware.

<!-- Last verified: 2026-08-10 -->

---

## 6. Cert renewal failed

TLS is issued by cert-manager via an ACME HTTP-01 challenge fronted by
the Traefik IngressRoute in `frontend/`. To diagnose:

```sh
kubectl describe certificate -n frontend todos-for-dues-tls
kubectl get challenges -A
kubectl describe order -n frontend
```

If a challenge is `Pending` for > 5 minutes:

- Confirm the Traefik IngressRoute routes `/.well-known/acme-challenge/*`
  to the cert-manager solver service (it should — the default solver
  service is created automatically).
- DNS — `dig dues.sigoalumni.org` must resolve to the cluster
  ingress IP.
- Let's Encrypt rate limits — 5 duplicate certificates / week. If hit,
  switch to the staging issuer temporarily.

Force a renewal by deleting the secret:

```sh
kubectl delete secret -n frontend todos-for-dues-tls
```

cert-manager will re-issue within ~60s.

<!-- Last verified: 2026-05-17 -->

---

## 7. `BOOTSTRAP_*` env var missing

`BOOTSTRAP_ADMIN_EMAIL` no longer exists (ADR-013): the first Admin is
whoever signs in with portal tier `admin` — the claim-sync hook maps
tiers to roles on every sign-in via `transitionRole`, so no env-seeded
promotion is needed. If a fresh chapter's first sign-in lands as
`Alumni` when Admin was expected, fix the member's tier at the
sigoalumni.org portal and have them sign in again.

The `BOOTSTRAP_*` vars that DO still matter are the migration-time
chapter-settings seeds (migration 0004 GUCs):
`BOOTSTRAP_ADMIN_RECIPIENT_EMAIL`, `BOOTSTRAP_TREASURER_RECIPIENT_EMAIL`,
`BOOTSTRAP_MODERATORS_RECIPIENT_EMAIL`, `BOOTSTRAP_CHAPTER_TIMEZONE`,
`BOOTSTRAP_CHAPTER_DISPLAY_NAME`. Missing values fall back to the
migration's defaults; fix afterwards via Admin → Settings (the values
live in `chapter_settings`, not env).

Inspect / edit the rendered secret via the upstream ExternalSecret:

```sh
kubectl get secret todos-for-dues-secret -n frontend -o yaml
kubectl edit externalsecret -n frontend todos-for-dues-secret
kubectl rollout restart -n frontend deploy/todos-for-dues
```

<!-- Last verified: 2026-08-10 -->

---

## 8. Migration stuck

The init container runs `tsx /migrator/src/scripts/migrate.ts` (which
calls `runMigrations` from `@app/db`) and retries on failure
(`restartPolicy: OnFailure`-equivalent at the Deployment level), so a
transient DB unavailability self-heals.

If it doesn't:

```sh
kubectl logs -n frontend deploy/todos-for-dues -c migrator
kubectl describe pod -n frontend -l app=todos-for-dues
```

Manual override — run the migration from the main container while the
init container is wedged:

```sh
kubectl exec -n frontend deploy/todos-for-dues -- \
  pnpm --filter @app/db migrate
```

Verify migrations table:

```sql
SELECT * FROM __drizzle_migrations ORDER BY id DESC;
```

If a migration partially applied, fix-forward by writing a new
`migrations/00NN_fix_…sql` rather than editing or rolling back the
applied row — Drizzle uses a content-hash, not idempotent re-runs.

<!-- Last verified: 2026-05-17 -->

---

## 9. `GITHUB_TOKEN` tag-trap workaround

> **RESOLVED 2026-05-18 by `RELEASE_PLEASE_PAT` (PR #31).** Verified by the
> v0.7.2 + v0.7.3 auto-builds firing `build-image` on `release.published`
> without manual intervention. The two workarounds below remain documented
> as a fallback in case the PAT is ever rotated, revoked, or
> mis-permissioned; under normal operation neither should be needed.

Symptom: a `vX.Y.Z` tag + GitHub Release exist but no matching image
appeared in `ghcr.io/thaynes43/todos-for-dues` within 5 min of the
release-PR merge.

Root cause: GitHub Actions suppresses downstream-workflow triggers for
events created by the default `GITHUB_TOKEN`. release-please uses
`GITHUB_TOKEN` by default, so neither the tag-push event NOR the
`release.published` event fires `build-image`.

History:
- v0.3.0 / v0.4.0 / v0.5.0 / v0.6.0 — original symptom (tag-push
  suppressed). Workaround was manual tag re-push from user context.
- v0.7.0 — confirmed `release.published` is suppressed too (PLAN-013
  Track A's swap to `release: types: [published]` did not close the
  trap on its own). The hybrid trigger fix (`push: tags` restored
  alongside the release trigger) brought back the original workaround
  AS A FALLBACK; PAT remains the proper long-term fix.

Two workarounds, both work; pick whichever is faster:

### (A) Re-push the tag from your local user context

```sh
git fetch --tags origin
git push origin :refs/tags/vX.Y.Z   # delete tag remotely
git push origin vX.Y.Z              # re-push from local; now under your PAT
```

The re-push fires `build-image` via the `push: tags` trigger and
produces `ghcr.io/thaynes43/todos-for-dues:vX.Y.Z`. Check Actions tab
to confirm the run started with `headBranch=vX.Y.Z`.

### (B) Re-publish the GitHub Release from your local user context

```sh
gh release view vX.Y.Z --json body --jq '.body' > /tmp/notes.md
gh release delete vX.Y.Z --yes
gh release create vX.Y.Z --target main --title "vX.Y.Z" --notes-file /tmp/notes.md
```

The re-create fires `build-image` via the `release.published` trigger
(from your user, not `GITHUB_TOKEN`).

### Proper long-term fix (LANDED 2026-05-18, PR #31)

A fine-grained PAT (`repo:contents:write` + `actions:read+write`) is stored
as repo secret `RELEASE_PLEASE_PAT` and consumed by
`.github/workflows/release-please.yml`. release-please's tag pushes +
Release creations now originate from that PAT identity, and the
`release.published` event fires `build-image` automatically. First
verification: v0.7.2 (commit `22f8a4a`, release CI run on event=`release`,
`build-image` job conclusion: success). Second verification: v0.7.3.

If the PAT is ever rotated, revoked, or mis-permissioned, fall back to
workarounds (A) or (B) above and re-mint the secret.

<!-- Last verified: 2026-05-18 (v0.7.3 build, PAT auto-fire confirmed) -->

---

## 10. GHCR visibility flip

GHCR has no API for package visibility, so this is a one-time UI step
per repo (already done for `todos-for-dues` on 2026-05-17 — documented
here so a fresh repo can be set up the same way).

1. Open
   `https://github.com/users/thaynes43/packages/container/todos-for-dues/settings`.
2. Scroll to **Danger Zone → Change visibility**.
3. Select **Public** and confirm by typing the package name.

Once flipped, ALL subsequent tags inherit `public` visibility — no
re-flip needed per release. Kubernetes `imagePullSecrets` are not
required for public GHCR images, which is why the haynes-ops
Deployment omits them.

If a future image is somehow `private`, the symptom is
`ImagePullBackOff` with `denied` in the pod events; re-confirm the
visibility on the package settings page.

<!-- Last verified: 2026-05-17 -->
