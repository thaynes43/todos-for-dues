---
id: PLAN-009
title: Deploy the prototype to the haynes-ops cluster (Phase 1.1 internal)
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: M
related:
  prds: [PRD-001]
  adrs: [ADR-006]
  bounded_contexts: []
  aggregates: []
  designs: []
  plans:
    prerequisite: [PLAN-001, PLAN-002, PLAN-003, PLAN-004, PLAN-005, PLAN-006, PLAN-007, PLAN-008]
    lateral: [VALIDATION-009]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Deploy the walking-skeleton build to the haynes-ops cluster per ADR-006 Phase 1.1 (`*.haynesops.com` internal). Wire CI (GitHub Actions) to build + push a container image to GHCR; wire haynes-ops Flux pipeline to pull and deploy. Provision the per-instance Postgres (dedicated DB on `cluster16`), the External Secrets connection to 1Password Connect, and the Traefik IngressRoute. Verify by visiting the deployed URL and clicking through the walking-skeleton happy path against the deployed instance.

> **Definition of success:** `https://todos-for-dues.haynesops.com` (or the agreed internal-domain URL) loads the placeholder home page; an Alumni can sign up via invite link → post a job → Moderator approves → Active enrolls → ... → loop closes against the deployed instance.

## 2. Inputs

1. `docs/adrs/006-hosting.md` — cluster design + Flux pipeline.
2. `~/src/labspace/haynes-ops/` — the GitOps repo (path per `reference_external_systems.md`).
3. `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/homepage/` — pattern to mirror.
4. PLAN-001..PLAN-008 (the app builds + tests pass).

## 3. Outputs

- `Dockerfile` at the repo root — multi-stage Next.js build per Next.js standalone-output convention.
- `.github/workflows/ci.yml` — GitHub Actions: typecheck, lint, test, build, push image to GHCR.
- `kubernetes/main/apps/frontend/todos-for-dues/` in the haynes-ops repo:
  - `kustomization.yaml`
  - `deployment.yaml` — Next.js standalone runtime
  - `service.yaml`
  - `ingressroute.yaml` — Traefik internal (`*.haynesops.com`) with cert
  - `postgres-cluster.yaml` — request a dedicated DB on cluster16 OR an `apps_db_init` job creates the schema in cluster16
  - `external-secrets.yaml` — pulls `RESEND_API_KEY`, `OIDC_CLIENT_ID/SECRET/HOSTED_DOMAIN`, `BETTER_AUTH_SECRET`, `BOOTSTRAP_ADMIN_EMAIL`, `DATABASE_URL` from 1Password Connect
- A test invite-link generation: Admin (per `BOOTSTRAP_ADMIN_EMAIL`) signs in once → generates invite links for Sigma Phi Omicron members.
- Commit (in this repo): `chore(ci+deploy): GHCR image build + dockerfile + haynes-ops manifests`.
- Commit (in haynes-ops repo): `feat: deploy todos-for-dues frontend internal`.

## 4. Steps

### Step 1 — Dockerfile + Next.js standalone

- **Action:** add `output: 'standalone'` to `apps/web/next.config.mjs`. Write a multi-stage Dockerfile:
  - Stage 1: install deps via pnpm.
  - Stage 2: build apps/web.
  - Stage 3: copy standalone output + node_modules into a slim runtime image.
- **Verification:** `docker build -t todos-for-dues .` succeeds; `docker run -p 3000:3000 -e DATABASE_URL=... todos-for-dues` boots; manual smoke test.

### Step 2 — GitHub Actions CI

- **Action:** `.github/workflows/ci.yml` with jobs:
  - `lint-and-typecheck`: pnpm install, lint, typecheck.
  - `test`: pnpm install, run unit + integration tests (testcontainers Postgres in CI).
  - `build-image`: on `main` push, build + push to `ghcr.io/thaynes43/todos-for-dues:<sha>` and `:latest`.
- **Verification:** push a commit; CI green; image visible in GHCR.

### Step 3 — Provision per-instance Postgres in cluster16

- **Action:** in haynes-ops, add a `postgres-cluster.yaml` (or extend an existing one) that creates a `todos_for_dues` database + role within the existing CloudNative-PG `cluster16`. Provide the connection string via External Secrets.
- **Verification:** `kubectl exec -it cluster16-1 -- psql -U todos_for_dues_user -d todos_for_dues -c '\dt'` succeeds (returns empty — schema lands on first app boot via Drizzle migrate).

### Step 4 — External Secrets

- **Action:** add `external-secrets.yaml` referencing 1Password items for each required env var. Test that the secret is created in the namespace.
- **Verification:** `kubectl get secret todos-for-dues-secrets -o yaml` shows the data fields.

### Step 5 — Deployment + Service + IngressRoute

- **Action:** deployment.yaml uses the GHCR image, mounts the External Secret as env vars, runs a one-time `drizzle-kit migrate` init container before the main app container starts. Service exposes port 3000. IngressRoute wires Traefik internal with a cert from the cluster issuer.
- **Verification:** `kubectl get pods -n frontend` shows the app pod Running; `https://todos-for-dues.haynesops.com` loads.

### Step 6 — Bootstrap admin + first invite link

- **Action:** set `BOOTSTRAP_ADMIN_EMAIL` to your email; sign in once (via Workspace SSO or app-managed signup with an invite token created via direct DB insert as a one-time bootstrap); generate Active + Alumni invite links via the Admin UI (or `invites.generate` tRPC procedure).
- **Verification:** Admin role is set; invite links generated.

### Step 7 — Smoke test the deployed instance

- **Action:** click through the walking-skeleton happy path against the deployed URL. Should mirror PLAN-008's E2E.
- **Verification:** loop closes; treasurer email lands in test inbox (or shows in Resend dashboard).

### Step 8 — Commit (both repos)

- **Action:** commit Dockerfile + CI in this repo; commit haynes-ops manifests in the haynes-ops repo (separate PR if user uses PR workflow there).

## 5. Verification

- [ ] CI green on `main` push; image in GHCR.
- [ ] Pod Running; URL reachable.
- [ ] Walking-skeleton smoke test passes against deployed instance.
- [ ] Two commits (one per repo).

## 6. Out of scope

- Phase 1.2 external (`*.haynesnetwork.com` via cloudflare-tunnel) — separate plan once Phase 1.1 is stable.
- Multi-instance / multi-chapter (post-MVP).
- Observability (logs, metrics, traces) — defer; haynes-ops cluster has cluster-wide observability.
- Backup / restore (cluster-level concern).

## 7. Risks & gotchas

- **Risk:** `pnpm --filter web build` inside the Dockerfile (Step 1) requires `DATABASE_URL` to be set at build time if `packages/db/src/index.ts` throws eagerly at module load (Next.js's build-time module trace executes top-level code in API route imports). **Mitigation:** PLAN-002 Step 0 refactors the db client to a Proxy-based lazy `db` — the throw is deferred to first DB access, so the Docker build stage works without `DATABASE_URL`. **Confirm before building the image:** `unset DATABASE_URL && pnpm --filter web build` exits 0 locally (the VALIDATION-002 §6 gate). If for any reason that gate has regressed, pass a dummy `DATABASE_URL=postgres://dummy:dummy@dummy:5432/dummy` to the Docker build arg as a fallback — but the lazy-Proxy fix should make that unnecessary.
- **Risk:** Drizzle migrate init container fails (e.g., DB unreachable on first boot). **Mitigation:** init container retries with exponential backoff; pod startup probe includes a "migrations applied" check.
- **Risk:** Workspace OIDC requires the redirect URI to match exactly. **Mitigation:** configure `OIDC_REDIRECT_URI=https://todos-for-dues.haynesops.com/api/auth/callback/oauth/google-workspace` in Workspace admin AND the env var.
- **Risk:** Better Auth's secret rotation / cookie domain. **Mitigation:** verify `BETTER_AUTH_SECRET` set via External Secrets; cookie domain matches IngressRoute hostname.
- **Risk:** Resend domain verification — emails to test inboxes may bounce until the sending domain is verified. **Mitigation:** verify the Resend sending domain before generating the first invite link; or use a known-deliverable test recipient.

## 8. Resume points

- After Step 2: image building.
- After Step 5: pod live.
- After Step 7: smoke test pass.
- After Step 8: committed.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Internal-domain hostname: `todos-for-dues.haynesops.com` or `t4d.haynesops.com`? | Lean: full name for clarity. |
| Q-PLN-02 | Single replica or 2-replica HA from day one? Lean: **single replica** for Phase 1.1 internal — HA can come with Phase 1.2. | Single replica; simple rolling-restart strategy. |
| Q-PLN-03 | Migrations: init container vs. CI-driven `pnpm drizzle-kit migrate` from a one-shot Job? Lean: **init container** so app + DB stay versioned together; deploy = migrate. | Init container. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. 8 steps from Dockerfile to a running internal deploy + smoke-tested walking skeleton. |
| 2026-05-14 | Tom Haynes | Plan-decomposition pass: frontmatter `related.plans` reshaped to `{prerequisite, lateral}` with VALIDATION-009 paired. PLAN-009 deploys the walking-skeleton (PLAN-001..008); PLAN-010/011/012 (MVP UI rest) ship via the same CI pipeline as subsequent deploys without separate plans. |
| 2026-05-14 | Tom Haynes | Added §7 risk + mitigation for the `pnpm --filter web build` requires `DATABASE_URL` issue surfaced during VALIDATION-001. PLAN-002 Step 0 now refactors `packages/db/src/index.ts` to a lazy Proxy so the Docker build stage works without env vars. Fallback documented if the gate regresses. |
