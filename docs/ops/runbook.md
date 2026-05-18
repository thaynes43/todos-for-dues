---
title: TODOs for Dues — Ops Runbook
status: Living
owner: Tom Haynes
---

# TODOs for Dues — Ops Runbook

Operator-scannable cheat-sheet for the deployed launch chapter
(`https://todos-for-dues.haynesops.com`). Each section is meant to be
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

Open a psql shell inside the cluster against the primary pod:

```sh
kubectl exec -n frontend -it cluster16-1 -- \
  psql -U todos_for_dues -d todos_for_dues
```

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
are owned by `packages/db/src/schema/`. Passwords live in `account`
(Better Auth credential plugin), NOT `users.password_hash` (dropped
in migration `0006`).

Common symptoms and likely causes:

- **Sign-in loop / 302 to /login after OAuth callback** — cookie
  domain mismatch. Check `BETTER_AUTH_URL` matches the public host
  (must be HTTPS in prod) and the cookie's `Domain=` covers the host.
- **"User not found" after SSO** — the HD-restriction hook in
  `packages/auth/src/oidc.ts` aborted in `mapProfileToUser` (non-HD
  email); confirm `OIDC_HOSTED_DOMAIN` matches the IdP's `hd` claim.
- **Session expires immediately** — check server clock skew against
  the DB (`SELECT NOW();`); Better Auth uses DB time for `expires_at`.

<!-- Last verified: 2026-05-17 -->

---

## 5. OIDC redirect URI

The exact path Better Auth's `genericOAuth` plugin uses (per PLAN-009
§7 reconciliation, 2026-05-17):

```
https://todos-for-dues.haynesops.com/api/auth/oauth2/callback/{providerId}
```

Where `{providerId}` is the provider id registered in
`packages/auth/src/oidc.ts` (currently `google-workspace`).

This MUST be configured exactly in Google Cloud Console:
**APIs & Services → Credentials → OAuth 2.0 Client IDs → (your Web
client) → Authorized redirect URIs**. Add the full URL above. Trailing
slash, scheme, host, and path must match character-for-character.

Anti-pattern (caused the 2026-05-17 sign-in loop): registering
`/api/auth/callback/oauth/{providerId}` (the older Better Auth path).
That value lets the server-side token exchange complete but the
browser is then redirected to `/login` because the cookie set on the
wrong callback path is not visible to the session middleware.

<!-- Last verified: 2026-05-17 -->

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
- DNS — `dig todos-for-dues.haynesops.com` must resolve to the cluster
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

Symptom: a fresh chapter's first sign-in completes, the user row is
created, but they remain `Alumni` (not promoted to `Admin`). The
`bootstrapAdminOnSignin` databaseHook in `packages/auth` is gated on
`BOOTSTRAP_ADMIN_EMAIL` matching the sign-in email exactly.

Inspect the running secret:

```sh
kubectl get secret todos-for-dues-secret -n frontend -o yaml
```

`BOOTSTRAP_ADMIN_EMAIL` is rendered from External Secrets; edit the
upstream ExternalSecret rather than the rendered secret directly:

```sh
kubectl edit externalsecret -n frontend todos-for-dues-secret
```

After editing, restart the deployment so the env var refreshes:

```sh
kubectl rollout restart -n frontend deploy/todos-for-dues
```

The hook is idempotent and routes through `transitionRole`, so the
audit trail is honored — re-signing in is enough; no manual SQL needed.

<!-- Last verified: 2026-05-17 -->

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

### Proper long-term fix (NOT yet landed)

Mint a fine-grained PAT for release-please (repo: contents:write +
actions:read+write); add as repo secret `RELEASE_PLEASE_PAT`; update
`.github/workflows/release-please.yml` to consume it. Then
release-please's tag pushes + Release creations originate from a real
user identity and fire downstream workflows automatically. Tracked as
PLAN-013 §3.1 PAT follow-up.

<!-- Last verified: 2026-05-18 (v0.7.0 deploy) -->

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
