---
id: ADR-006
title: Host on self-hosted K8s via the haynes-ops Flux pipeline; defer GKE migration to a separate ADR
status: Proposed
date: 2026-05-07
deciders: [Tom Haynes]
consulted: []
informed: []
related:
  prds: [PRD-001]
  adrs: [ADR-001, ADR-002, ADR-003, ADR-004, ADR-005]
  flows: []
  designs: []                   # docs/design/deploy.md pending — manifests, image tag flow, CI workflow
  supersedes: null
  superseded_by: null
---

## Context and problem statement

Per ADR-001 we ship Next.js as a Docker image; per ADR-004 we persist to Postgres; per ADR-002 / 003 / 005 we depend on auth, an HTTP/tRPC surface, and outbound email. We need to land on a concrete deployment platform — cluster, registry, CI/CD, ingress, secrets, database location, local dev environment, and test database — for the walking skeleton and the launch-chapter MVP.

Constraints captured during ADR-006 discovery:

- **Phase 1.1 (now) — internal-only on self-hosted:** the user's existing self-hosted Kubernetes cluster (`main` in `haynes-ops`) serves dev, test, and a private alpha for the launch chapter. Reachable only on the LAN via Traefik's internal entry point. Domain: `*.haynesops.com` (LAN-only), TLS cert `certificate-haynesops`.
- **Phase 1.2 — go-live on self-hosted, externally exposed:** the same cluster, but the launch-chapter instance is published externally via Traefik's external entry point and the existing `cloudflare-tunnel`. Domain: `*.haynesnetwork.com` (internet-routable), TLS cert `certificate-haynesnetwork`. Internal domain may be retained alongside or replaced.
- **Phase 2 (if needed) — GKE migration:** migrate prod to GKE for scale, retaining the self-hosted cluster for dev/test. The cloud-deployment ADR is deferred until that phase begins; it will likely live in a dedicated cluster repo (Argo or Flux — undecided).
- **Cluster-portability** matters: nothing this ADR commits to should make GKE migration painful.
- **GitHub repo:** <https://github.com/thaynes43/todo-for-dues>. Currently working off `main`; PR-based workflow will start once we transition off main.
- **Local dev parity:** Docker on the user's M5 MacBook is fine; no resource constraint.
- **Test DB approach** is decided here so it composes with the deploy pipeline.

This ADR does **not** specify the manifests themselves, image-tag promotion mechanics, the GH Actions workflow YAML, or the Helm chart choice — those belong in `docs/design/deploy.md` (pending). It captures the pattern; the design doc captures the files.

## Decision drivers

1. **Reuse what already runs in the cluster** (CNPG, Traefik, ESO + 1Password, external-dns, SOPS+age). Forking the platform for one app is a regression.
2. **Single-image deploy** consumable by Flux through the haynes-ops conventions.
3. **Cloud-portability** — no platform-specific dependency that blocks GKE later. The IngressRoute CRD is fine because it's swappable at the manifest layer; database, secrets, and image are all standard.
4. **Local dev parity with prod** — same Postgres major version, same migration pipeline, same standalone image format.
5. **Per-instance tenancy preserved** (PRD-001 R-11). Each fraternal organization gets a separate deployment with its own DB and its own secrets; the manifest layout must accommodate N copies cleanly.
6. **Modest CI cost** — GitHub Actions free tier suffices for MVP cadence.
7. **Test correctness** — tests use the same database engine and migrations as prod; no engine substitution.

## Considered options

For deployment:

- **Option A (recommended)** — Self-hosted K8s (`main` cluster in haynes-ops) + Flux + GHCR + GitHub Actions + Traefik IngressRoute + ESO/1Password Connect + CNPG (existing `cluster16`, dedicated database).
- **Option B** — Skip self-hosted; deploy directly to GKE today.
- **Option C** — PaaS (Vercel + Supabase, or Railway) — no K8s in MVP.
- **Option D** — Self-hosted K8s but with a *separate* GitOps repo for the SaaS rather than folding it into haynes-ops.

For local dev:

- **Option A.1** — Docker Compose for Postgres locally; Next.js app runs via `pnpm dev` on host.
- **Option A.2** — Full dev container (VS Code) including app + DB.
- **Option A.3** — Run everything in a kind/k3d cluster locally.

For the test database:

- **Option T.1** — Testcontainers spin up Postgres per test run, in CI and locally.
- **Option T.2** — Shared Postgres instance (Docker Compose) reused across test runs, schema reset between runs.
- **Option T.3** — SQLite or another engine substitute.
- **Option T.4** — Hosted dev branch (Neon/Supabase) used for tests.

## Decision outcome

**Chosen options:** **A + A.1 + T.1**.

### Deployment (Option A)

- **Cluster:** the existing `main` cluster in `haynes-ops`. Dev, test, and launch-chapter prod all land here for now. GKE migration is a future ADR triggered when scale or compliance demands it.
- **GitOps repo:** the existing `haynes-ops`. App manifests live at `kubernetes/main/apps/frontend/todo-for-dues/` (mirroring the existing convention used by `homepage`, `headlamp`, etc.). Per-instance deploys for multiple chapters can live as siblings: `todo-for-dues-<chapter>` under the same category, each with its own ExternalSecret reference and IngressRoute.
- **Container registry:** GHCR (`ghcr.io/thaynes43/todo-for-dues`). Free for the repo; same auth surface as GitHub.
- **CI:** GitHub Actions on the SaaS repo. On push to `main` (Phase 1) and on tagged release (later): build the Next.js standalone image, tag with the commit SHA and a moving tag (e.g., `:main`), push to GHCR. PR-triggered builds added when we move off main.
- **Image rollout:** image tag in `haynes-ops` is updated by a small workflow that opens a PR against `haynes-ops` with the new SHA tag (or, if Flux Image Update Automation is wired up in the cluster, by an `ImagePolicy` that auto-bumps). Either way, *the container image is published from the SaaS repo; the manifests are versioned in haynes-ops.* This separation matches the existing pattern.
- **Ingress (Phase 1.1 — internal):** Traefik IngressRoute on the `traefik-internal` class, `entryPoints: [websecure]`, TLS via `certificate-haynesops`. Subdomain on `*.haynesops.com` (LAN-only), e.g., `dues.haynesops.com` or `<chapter>.dues.haynesops.com` — final form in the design doc.
- **Ingress (Phase 1.2 — go-live external):** Traefik IngressRoute on the `traefik-external` class, TLS via `certificate-haynesnetwork`, subdomain on `*.haynesnetwork.com` (internet-routable). Public access flows through the existing `cloudflare-tunnel` already running in `network/cloudflare-tunnel`. The internal IngressRoute may be retained side-by-side (useful for admin/debug) or replaced — design-doc decision.
- **DNS:** managed by `external-dns` via annotations on the IngressRoute. Internal route uses `external-dns.alpha.kubernetes.io/target: internal.haynesops`; external route uses the cloudflare-tunnel target per existing convention.
- **Secrets:** ExternalSecret resources pull from 1Password Connect (already running in `external-secrets` namespace). One ExternalSecret per deployment containing app-runtime secrets (DATABASE_URL components, Resend API key, Better Auth secret, BOOTSTRAP_ADMIN_EMAIL). 1Password vault is the user's personal account for now; if we move to GKE, we either keep 1Password Connect (works anywhere) or migrate to GCP Secret Manager — that decision is part of the future GKE ADR.
- **Database:** the existing `cluster16` CNPG cluster, with a dedicated database created for `todo-for-dues` (and per-chapter databases as we add instances). This keeps ops surface small in Phase 1; if isolation pressure grows (one chapter's load affects another), promote to a dedicated CNPG cluster per chapter.
- **Migrations:** `drizzle-kit migrate` runs as a Kubernetes Job (or initContainer) before the app rolls; the Job's image is the same as the app, with a different command. Applied once per release.

### Local dev (Option A.1)

- `docker-compose.yaml` at the repo root brings up Postgres (same major version as `cluster16`'s PG16) with port mapping to `localhost:5432`.
- App runs on host via `pnpm dev` against `DATABASE_URL=postgres://localhost:5432/...`.
- A `pnpm db:up` / `db:down` / `db:reset` set wraps compose for ergonomics.
- VS Code dev container is supported but optional; the user is free to use either.

### Test database (Option T.1)

- **Unit tests:** no database; mock at the repository boundary. Pure domain logic only.
- **Integration tests:** Testcontainers spin up a PG16 container per test run (CI and local). Each run gets a fresh DB; migrations apply at the start; tear down after.
- **No SQLite or MySQL substitution.** ADR-004 commits to Postgres-specific features (`citext`, `pgcrypto`, `gen_random_uuid()`) — substituting engines masks bugs. This is captured as feedback in memory so we don't drift back to it.
- GH Actions runners include Docker, so Testcontainers works in CI without extra setup.

### Why each rejection

- **Option B (GKE now)** — Premature; we don't have a real-load problem yet, the user already has a working self-hosted cluster, and starting on GKE adds cost and ops surface for the launch chapter. Migration story is preserved.
- **Option C (PaaS)** — Conflicts with the explicit Docker + K8s requirement and with the "cluster-portable" goal. Vendor lock-in we don't need.
- **Option D (separate GitOps repo for the SaaS)** — Adds a third repo to operate. The haynes-ops conventions are well-tested in this cluster; mirroring them in a fork is duplication. Reconsider when the SaaS lives in a dedicated cluster (e.g., on GKE).
- **Option A.2 (full dev container)** — Fine, but unnecessary friction if Docker on the host is acceptable. Optional, not mandatory.
- **Option A.3 (kind/k3d local cluster)** — Overkill for daily dev loop; the K8s manifests are already exercised in the real cluster.
- **Option T.2 (shared test DB)** — State leaks between tests; flakiness risk; harder to parallelize.
- **Option T.3 (engine substitution)** — Loses prod parity for the things we actually care about.
- **Option T.4 (hosted dev branch)** — Adds a network dependency to the test loop; offline dev breaks.

### Consequences

- **C-01 (good)** — Reuses every existing platform component in haynes-ops; zero new infrastructure.
- **C-02 (good)** — Standard image + standard manifests; GKE migration is a manifest port (Traefik IngressRoute → GKE Ingress / Istio), not a stack rewrite.
- **C-03 (good)** — Local dev, integration tests, and prod all run the same Postgres major version with the same migration pipeline.
- **C-04 (good)** — Per-instance deploys layout (`frontend/todo-for-dues-<chapter>/`) is straightforward inside haynes-ops conventions.
- **C-05 (good)** — Secrets stay out of git; ESO + 1Password is already proven in this cluster.
- **C-06 (bad)** — The self-hosted cluster is a single-host SPOF for the launch chapter. Acceptable for MVP; documented as a known risk; mitigated by GKE migration ADR when warranted.
- **C-07 (bad)** — 1Password Connect uses the user's personal vault. Sufficient for one-operator MVP; revisit if the operator surface grows or if we move to cloud (where a managed secret manager may be preferable).
- **C-08 (bad)** — Traefik IngressRoute is a CRD, not stock Kubernetes Ingress. Cluster-portability cost is real but bounded — manifests for ingress are the only piece that needs replacement when migrating clusters.
- **C-09 (bad)** — CNPG cluster is shared across haynes-ops apps in Phase 1; a noisy-neighbor incident is possible. Mitigation: monitor; promote to dedicated CNPG cluster per chapter if needed.
- **C-10 (neutral)** — Phase 1 production runs on the same cluster as dev/test. We accept this for the launch chapter; PRD-001 implicitly assumes a low-risk audience (chapter members), so the blast radius of an outage is small.

### Confirmation

- The walking-skeleton design doc (`docs/design/deploy.md`, pending) lists every manifest in the `todo-for-dues` haynes-ops directory: `helmrelease.yaml` (or raw `deployment.yaml` + `service.yaml`), `ingressroute.yaml`, `externalsecret.yaml`, `kustomization.yaml`, plus the parent `ks.yaml`.
- A GH Actions workflow file in the SaaS repo builds the Docker image on push to `main` and pushes to GHCR with the commit SHA and a moving tag.
- A second workflow (or the same one with a follow-up step) updates the image tag referenced in haynes-ops — by direct PR or via Flux Image Update Automation, decided in the design doc.
- A `docker-compose.yaml` at the repo root brings up PG16 locally; `pnpm db:up` works on a fresh checkout with no further setup.
- An integration test using Testcontainers spins up PG, applies all migrations, runs one full tRPC mutation, and tears down. The same test runs in CI.
- The `cluster16` CNPG cluster has a dedicated database for `todo-for-dues`; the connection string is sourced from 1Password via the ExternalSecret.

## Pros and cons of the options

### Option A — Self-hosted K8s + haynes-ops Flux pipeline

The recommended deployment.

- Good — Reuses every existing platform component (CNPG, Traefik, ESO + 1Password, external-dns, SOPS+age).
- Good — Conventions are battle-tested in this cluster; agents can model new manifests on existing apps (e.g., `frontend/homepage`).
- Good — Free hosting and free CI for MVP scale.
- Good — GKE migration is a manifest port, not a rewrite — Postgres, image, and secrets all abstract cleanly.
- Bad — Single-host cluster is a SPOF for the launch chapter; risk accepted for MVP.
- Bad — Traefik IngressRoute CRD is non-standard; the ingress manifest is the one piece that gets replaced on migration.

### Option B — Deploy to GKE now

Skip self-hosted; start in cloud.

- Good — Eliminates the SPOF and the dev-equals-prod coupling.
- Good — Establishes the eventual prod platform sooner.
- Bad — Costs money from day one for traffic that doesn't justify it.
- Bad — Adds GCP-specific setup (project, IAM, Cloud SQL, Workload Identity, etc.) before we know if the product is viable.
- Bad — Loses the leverage of haynes-ops's existing platform components.

### Option C — PaaS (Vercel + Supabase / Railway)

No K8s, full managed.

- Good — Fastest time to first deploy.
- Good — No ops work.
- Bad — Conflicts with the explicit Docker + K8s constraint from PRD-001 / earlier discussion.
- Bad — Vendor lock-in; per-MAU and per-egress costs scale poorly across many chapters.
- Bad — Self-hosting tenancy isolation per fraternal organization is harder than on K8s.

### Option D — Self-hosted K8s with a dedicated GitOps repo for the SaaS

Same cluster, separate manifests repo.

- Good — Decouples the SaaS lifecycle from the platform repo.
- Good — Easier to hand off to a different operator later.
- Bad — Three repos (SaaS code, haynes-ops, SaaS-ops) for one operator today.
- Bad — Conventions diverge; harder for agents to model on existing apps.
- Bad — Reconsider when the SaaS moves to a dedicated cluster (e.g., GKE).

## More information

### Manifest layout (informative — finalized in `docs/design/deploy.md`, pending)

Mirroring the existing `frontend/homepage` pattern in haynes-ops:

```
kubernetes/main/apps/frontend/todo-for-dues/
  ks.yaml
  app/
    helmrelease.yaml          # generic app chart wrapping the Next.js image
    helmrepository.yaml       # if needed; or raw deployment.yaml + service.yaml
    ingressroute.yaml         # Traefik route to the chapter's subdomain
    externalsecret.yaml       # ESO → 1Password Connect → app secrets
    rbac.yaml                 # if any beyond default
    kustomization.yaml
```

For multi-chapter, each chapter gets its own directory at the same level (`todo-for-dues-<chapter>/`) with its own ExternalSecret, IngressRoute (chapter-specific subdomain), and database name.

### CI workflow shape (informative)

- `.github/workflows/build.yml` — on push to `main` (Phase 1) and on PR (after we move off main): build the standalone image, run unit + integration tests (Testcontainers spawns PG), push to GHCR with `${{ github.sha }}` and `:main` tags.
- A follow-up workflow either opens a PR against haynes-ops to bump the image tag *or* relies on Flux Image Update Automation if configured. Decision in the design doc.

### Database tenancy options (informative)

- **Phase 1** — Single shared CNPG cluster (`cluster16`); one database per chapter; user grants scoped per-database. Lowest ops; possible noisy-neighbor risk.
- **Phase 1.5** — One CNPG cluster per chapter on the same Kubernetes cluster. Stronger isolation; more resource overhead.
- **Phase 2** — Cloud SQL or AlloyDB on GKE; one instance or one DB per chapter as makes sense.

### Future ADR triggers

- **ADR-XXX (GKE migration)** — when scale, compliance, or operator-handoff demands it. Will pick GKE region(s), Cloud SQL vs. AlloyDB, GitOps tool (Argo vs. Flux on the new cluster repo), GCP Secret Manager vs. continued 1Password Connect, and CDN/load-balancer wiring.
- **ADR-XXX (Observability)** — when "is the app healthy" requires more than `kubectl logs`. Likely the existing Prometheus/Grafana/Loki stack already running in `observability` in haynes-ops.
- **ADR-XXX (Backups)** — CNPG handles scheduled backups (`scheduledbackup.yaml` exists in haynes-ops); when MVP grows real data, finalize retention and restore-test cadence.

### Links

- Flux: <https://fluxcd.io/>
- haynes-ops conventions: see existing apps under `kubernetes/main/apps/frontend/` for reference patterns.
- CloudNative-PG: <https://cloudnative-pg.io/>
- Traefik IngressRoute: <https://doc.traefik.io/traefik/providers/kubernetes-crd/>
- External Secrets Operator + 1Password: <https://external-secrets.io/latest/provider/1password-automation/>
- Testcontainers Node: <https://node.testcontainers.org/>

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-07 | Tom Haynes | Initial draft. |
| 2026-05-07 | Tom Haynes | Corrected ingress phasing: Phase 1.1 internal on `traefik-internal` with `*.haynesops.com` and `certificate-haynesops`; Phase 1.2 go-live on `traefik-external` with `*.haynesnetwork.com` and `certificate-haynesnetwork` via the existing `cloudflare-tunnel`. |
