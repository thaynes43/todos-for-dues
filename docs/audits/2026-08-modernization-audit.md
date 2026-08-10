---
id: AUDIT-2026-08
title: Modernization audit — repo, live instance, docs, brand
status: Final
author: modernization-audit agent (overnight program, Tom's direction)
created: 2026-08-09
---

# TODOs for Dues — modernization audit (2026-08)

Deep inspection of the repo (`thaynes43/todos-for-dues` @ `48cdbd2`, v0.8.0, last
real push 2026-05-21), the live instance (`frontend/todos-for-dues` on the
haynes-ops cluster), the docs, and the brand surface. Companion deliverable:
[`docs/modernization-plan.md`](../modernization-plan.md) — the phased plan the
implementation agents execute.

Governance inputs (sigo-alumni repo): **ADR 0007** (suite SSO — sigoalumni.org
becomes the OIDC IdP; this app's local auth is removed), **ADR 0006** (tier
ladder: pending/brother/operator/admin + `organizer` capability),
`backlog/todos-for-dues/` (modernization saga).

---

## 0. Executive summary

- **Prod data verdict: NO real member or dues data.** The live DB
  (`todos_for_dues` on CNPG `postgres16`, `database` namespace) holds 5 users
  (Tom's two accounts + 3 synthetic smoke personas), 6 jobs (all smoke/test
  rows: "smoke test", "Test Job", "Eeeeee"), 1 revoked invite token.
  Migration may be destructive; a wipe-and-reseed is acceptable.
- **Prod is NOT stale relative to the repo**: image `v0.8.0` = latest release =
  repo HEAD tag. The *repo itself* is ~80 days idle (last push 2026-05-21) and
  its dependency set has accumulated 48 known vulnerabilities (1 critical,
  25 high) — see §1.
- **Ingress hostname: `https://todos-for-dues.haynesops.com`** (Traefik
  `traefik-internal`, LAN-only via `internal.haynesops` target). The portal
  SSO redirect URI today would be
  `https://todos-for-dues.haynesops.com/api/auth/oauth2/callback/<providerId>`.
  ADR 0007 keeps homelab hosting permanent; a `sigoalumni.org` subdomain later
  only changes `BETTER_AUTH_URL` + the registered redirect URI.
- **CI/release automation was fully green at last activity** and the toolchain
  still works today: `pnpm install --frozen-lockfile` + `pnpm typecheck` pass
  clean on this audit's worktree (2026-08-09).
- The app is a **complete, well-tested MVP** (83 unit/integration test files,
  46 Playwright specs, docs-first SDLC, FSM-guarded state writes). The
  modernization is a *retrofit* (deps, auth swap, rebrand), not a rescue.

## 1. Security findings (ranked)

### 1.1 Blockers

| # | Finding | Evidence | Fix |
|---|---|---|---|
| S-00 | **Hardcoded fallback session secret in a public repo, no prod guard.** `packages/auth/src/config.ts:60`: `secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-not-for-prod-not-for-prod'`. If the env var is ever unset/misspelled in the deploy env, sessions are signed with a publicly-known constant → forgeable Admin sessions. `baseURL` has the same silent fallback (`?? 'http://localhost:3000'`), which also degrades secure-cookie inference. | code read | Throw at boot when `NODE_ENV==='production'` and `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` are unset; delete the literal fallback (Phase 1). |
| S-01 | **Next.js 16.2.6 carries 4 high + 5 moderate CVEs fixed in 16.2.11** — middleware/proxy auth bypass (GHSA-6gpp-xcg3-4w24), SSRF in Server Actions (GHSA-89xv-2m56-2m9x, GHSA-p9j2-gv94-2wf4), Server-Action DoS, response-body cache confusion. The app is LAN-only today, which mitigates but does not excuse. | `pnpm audit --prod` | Upgrade `next` to ≥16.3.0 (Phase 1). |
| S-02 | **better-auth 1.6.11 < 1.6.22 — account takeover via pre-account hijacking (GHSA-qq9h-g4jm-xgf3) and stored XSS (GHSA-86j7-9j95-vpqj)** — this is the live auth stack. | `pnpm audit --prod` | Upgrade to ≥1.6.26 in Phase 1; local-auth removal in Phase 2 shrinks the exposed surface further. |
| S-03 | **drizzle-orm 0.36.4 — SQL injection via improperly escaped identifiers (GHSA-gpj5-g38j-94v9), fixed 0.45.2.** Repo also builds raw SQL CHECK constraints from TS arrays (`sql.raw(...)` in `packages/db/src/schema/*.ts` — constant input today, but the pattern plus a vulnerable ORM is a bad pairing). | `pnpm audit --prod` | Upgrade to 0.45.2 + drizzle-kit 0.31.x + drizzle-zod 0.8.x (Phase 1). |

### 1.2 Major

| # | Finding | Evidence | Fix |
|---|---|---|---|
| S-M1 | **`users.getById` leaks every member's email + role to ANY authenticated user (PII/IDOR).** `packages/api/src/routers/users.ts:89-103` — `authedProcedure` with an arbitrary `userId` input returns `{email, role, …}`; the projection was widened for the Admin per-user page (PLAN-012) but never admin-gated. User IDs are harvestable via `jobs.getById` (poster + roster IDs). | code read | Admin-gate the email projection; serve the roster-name use case (`app/jobs/[jobId]/page.tsx:30`) from a display-only projection (Phase 1). |
| S-M2 | **`jobs.getById` over-broad projection defeats its own role scoping.** `packages/api/src/routers/jobs.ts:775-867` — the handler computes a role-scoped `roster` and viewer-only `viewerCredit`, then returns `{ ...job }`, re-exposing raw `perActiveDuesCredit` (per-user dues map for every attendee), `posterContactValue`, dispute/cancellation/rejection reasons to any authed viewer of any job. | code read | Explicit allow-list projection; include credit map/reasons only for privileged/owner/enrolled viewers (Phase 1). |
| S-M3 | **`jobs.listByState` gate too permissive + contains a no-op dead branch.** `routers/jobs.ts:729-769` — only `Active` is restricted (to `enrollment_open`); Alumni/Moderator get full rows (`select().from(jobs)`) for every state incl. `closed`/`disputed`, i.e. all credit maps and reasons chapter-wide. Lines 743-750 are a dead `role === 'Alumni' && … && role === 'Alumni'` branch — the gating was never finished. | code read | Restrict Alumni to own postings + public states; narrow the projection (Phase 1). |
| S-M4 | **No rate limiting on credential login / password reset — Better Auth's limiter is bypassed.** The server actions (`app/login/actions.ts`, `app/forgot-password/actions.ts`, `app/signup/actions.ts`) call `auth.api.*` directly, skipping the `/api/auth/*` handler pipeline where Better Auth's rate limiter lives; no `rateLimit` block in config either. Unthrottled brute force + reset-mail flooding. (Enumeration responses themselves are correctly neutral.) | code read | Dies structurally with Phase 2 (server actions removed with local auth). If Phase 2 slips, add a limiter in Phase 1. |
| S-04 | **happy-dom 15.11.7 — critical VM-escape → RCE (GHSA-37j7-fg3j-429f), plus 2 high.** Dev/test-only dependency, but it executes when agents run `pnpm test` against a checkout — supply-chain-relevant for an agent-operated repo. | `pnpm audit` | Bump to ≥20.11.2 (Phase 1). |
| S-05 | **Dependabot alerts are disabled** on a public repo — the 48-vuln pile-up went unnoticed for 80 days by design. | `gh api …/vulnerability-alerts` → 403 "disabled" | Enable Dependabot alerts + security updates (Phase 1; repo-settings toggle, ~1 min). |
| S-06 | **DB pool has no `error` handler → `uncaughtException` on CNPG failover.** Live pod logs show `⨯ uncaughtException: error: terminating connection due to administrator command` with a full pg `Client` object dump (leaks internal DSN shape — user/db/host, not password) each time the postgres16 primary restarts; correlates with the pod's 5 restarts. | `kubectl -n frontend logs todos-for-dues-…` | Attach `pool.on('error')` in `packages/db/src/index.ts`; stop dumping client objects (Phase 1). |
| S-07 | **Transitive prod-path CVEs**: nanoid (2 high), postcss (2 high + 2 mod), undici (3 high + 7 mod), @babel/core (low). All clear via the Phase 1 upgrade wave + `pnpm dedupe`/overrides where needed. | `pnpm audit --prod` | Phase 1. |

### 1.3 Minor / notes

- **Secrets hygiene: clean.** `.env.example` is placeholders-only; no secrets in
  git history (`git log --all -S` sweeps on key names); prod secrets ride
  1Password → ExternalSecret → `todos-for-dues-secret`. See §1.4 for the authz
  review of routes.
- `engines.node: ">=20"` — Node 20 is EOL (2026-04-30). Image/CI already run
  Node 22 (maintenance until 2027-04); bump engines and consider Node 24 LTS.
- `packageManager: pnpm@11.1.2` vs latest 11.21.x; also pinned in CI env and
  Dockerfile — bump in all three places together.
- Open release PR **#48 `chore(main): release 0.8.1`** has been sitting since
  2026-05-21 — merge or close before the modernization waves start, otherwise
  release-please will fold tonight's work into a confusing changelog.
- `/api/health` returns `"version": "dev"` in prod — `APP_VERSION` is never set
  by the HelmRelease; runbook §Health implies it reports the release. Wire
  `APP_VERSION` from the image tag in Phase 4 (or drop the field).
- Kyverno policy `verify-thaynes43-images.yaml` (haynes-ops) covers this
  image's provenance; keep tags signed/pinned as today (no `:latest` in prod).

Additional minors from the route review:

- **`/api/test/resend-calls` ships in the prod image**, gated only by
  `RESEND_TEST_MODE === 'true'` (no `NODE_ENV` guard). Currently 404 in prod
  (verified live), but one env var away from dumping recorded email PII
  (to/subject/full HTML). Add a `NODE_ENV !== 'production'` guard or exclude
  `app/api/test/**` from prod builds. Stale comment: `send-email.ts:64` still
  cites the old `/api/_test/resend-calls` path.
- **Admin pages authorize only in `AdminLayout`** (`app/admin/layout.tsx:13-16`);
  no `middleware.ts` exists, and App Router layouts don't reliably protect
  page-level data on client navigations. Mostly saved by `adminProcedure` on
  the data calls — except the two S-M1/S-M2 procedures used by
  `admin/users/[userId]` and `admin/jobs/[jobId]`. Enforce role per-page or add
  a `/admin/**` middleware matcher.
- **No security headers**: `next.config.ts` has no `headers()` (no HSTS, CSP,
  X-Frame-Options, nosniff, Referrer-Policy) and `poweredByHeader` defaults on.
- `/api/health` exposes version + DB reachability unauthenticated — fine for
  probes on internal ingress; consider dropping `version`.
- **Internal-topology disclosure in a public repo**: `docs/**` and
  `.agents/prompts/**` hard-code internal hostnames, GitOps repo paths, and the
  future exposure plan. `.dockerignore` keeps them out of the image; accept or
  prune deliberately (org call, not a code fix).

### 1.4 Route/authz review

Verified-good (no action): Resend webhook does real Svix HMAC verification with
constant-time compare, 5-min replay window, and **401s when the secret is
unset** (never fails open). SSE `/api/events/chapter` 401s anonymous users and
broadcasts IDs-only payloads (no PII enrichment). Job mutations enforce
ownership via `jobPosterProcedure`/`enrolledProcedure`; inputs are zod-validated
(`.strict()` on edit). Self-elevation is blocked (`users.changeRole` limited to
`Active|Alumni`; grants are admin-only). Invite tokens are 128-bit random.
Dockerfile: pinned `node:22-alpine`, non-root `USER app`, tini, no `.env` copy.

Full matrix:

| Surface | Gate | Verdict |
|---|---|---|
| `/api/auth/[...all]` | Better Auth handler | S-00/S-M4 apply |
| `/api/trpc/[trpc]` — jobs: `post` alumni · `approve/reject` moderator · `enroll/unenroll` active · `lock/reschedule/cancel/edit/complete/revertCompletion/markPaymentSent` owner · `confirmReceipt/dispute` authed+enrollment/admin · `resolveDispute*` admin · `getHistory` admin · `listModerationQueue` moderator · `listMyPosted` alumni · `listMyEnrolled` active | role/ownership middleware | good except `listByState` (S-M3), `getById` (S-M2) |
| `/api/trpc/[trpc]` — users: `changeRole` self (enum-limited) · `grantRole/list/getRoleHistory` admin · `getSession` public | | good except `getById` (S-M1) |
| `/api/trpc/[trpc]` — invites `mint/list/revoke`, settings `list/set`, admin `getAggregateCounts/listDisputed` | adminProcedure | good (invites die in Phase 2) |
| `/api/events/chapter` | session-gated SSE | good |
| `/api/webhooks/resend` | HMAC + replay window | good |
| `/api/test/resend-calls` | `RESEND_TEST_MODE` only | minor (above) |
| `/api/health` | none | fine for probes |
| Pages: `/login /signup /forgot-password` public · `/jobs* /profile` authed · `/jobs/new` non-Active · `/my-postings` alumni+ · `/my-enrollments` active · `/moderation-queue` mod+ · `/admin/**` layout-only | server components | layout-only gap (above) |

## 2. Repo audit

### 2.1 Architecture map

pnpm workspace, all-ESM, TS strict; internal packages export TS sources
directly (no build step inside the workspace).

```
apps/web           Next.js 16 App Router UI (server components + a few client comps)
  /api/auth/[...all]     Better Auth handler (packages/auth)
  /api/trpc/[trpc]       tRPC v11 fetch adapter (packages/api appRouter)
  /api/events/chapter    SSE stream (chapter event bus)
  /api/webhooks/resend   Resend delivery-status webhook
  /api/health            liveness/readiness (SELECT 1)
  /api/test/resend-calls test-only introspection endpoint (RESEND_TEST_MODE-gated)
packages/api       tRPC routers: jobs, invites, users, admin, settings + middleware (role, job)
packages/auth      Better Auth config: credential + genericOAuth(Google, HD-restricted),
                   invite-token verify, bootstrap-admin + session-extension hooks
packages/domain    FSM: JOB_TRANSITIONS + transitionJob/transitionRole — the ONLY
                   writers of jobs.state / users.role (CI-enforced by
                   no-direct-state-writes test); atomic audit-row writes
packages/db        Drizzle schema (11 tables), SQL migrations 0001–0010,
                   lazy pg Pool proxy, migrate script (GUC-seeded bootstrap)
packages/notifications  Resend + React Email (5 templates)
packages/settings  chapter_settings read helper
packages/test-utils     Testcontainers postgres:16 harness
```

**Data flow:** UI (server components) → tRPC procedures → domain FSM → Drizzle →
PG16. Mutations publish to an **in-memory** per-chapter event bus → SSE
(`/api/events/chapter`) → `RealtimeProvider` → `router.refresh()`. The bus is
explicitly single-pod (PLAN-018); `replicas: 1` in prod matches. Scaling out
requires the deferred LISTEN/NOTIFY adapter — do not raise replicas until then.

**DB schema (live = migrations = Drizzle schema, verified against prod):**
`users` (role: Active/Alumni/Moderator/Admin, CHECK-constrained),
`jobs` (10-state FSM, CHECKs on dues>0), `job_enrollments`,
`job_state_transitions` + `user_role_transitions` (append-only audit),
`job_content_changes` (edit diffs), `chapter_settings` (K/V),
`invite_tokens`, and Better Auth's `session`/`account`/`verification`.
Migrations 0001–0010 applied in prod; min-1-Admin DB trigger active.

### 2.2 Dependency staleness (current → latest, 2026-08-09)

Resolved versions from `pnpm-lock.yaml`; latest from npm. **Bold** = security-driven.

| Package | Resolved | Latest | Notes |
|---|---|---|---|
| **next** | 16.2.6 | **16.3.0** | CVEs fixed in 16.2.11 (S-01) |
| react / react-dom | 19.2.4 | 19.2.8 | patch |
| **better-auth** | 1.6.11 | **1.6.26** | S-02; also spec drift: `apps/web` declares `^1.4.0`, `packages/auth` `^1.6.11` — align both |
| **drizzle-orm** | 0.36.4 | **0.45.2** | S-03; 9 minors of API drift — the `numeric`-as-string workaround in `jobs.ts` may get a real `mode` option |
| drizzle-kit | 0.30.6 | 0.31.10 | pairs with ORM bump |
| drizzle-zod | 0.5.1 | 0.8.3 | pairs; check `createInsertSchema` API changes |
| zod | **3.25.76 AND 4.4.3** | 4.4.3 | split-brain: db+api on v3, web+auth on v4 — unify on v4 |
| @trpc/* | 11.17.0 | 11.18.0 | minor |
| @tanstack/react-query | 5.100.10 | 5.101.4 | patch |
| tailwindcss / @tailwindcss/postcss | 4.3.0 | 4.3.3 | patch |
| typescript | 5.9.3 | 7.0.2 | two majors (native-port line). Do NOT jump in the deps wave — verify @typescript-eslint/Next support separately; stay on latest 5.x/6.x that the toolchain supports |
| vitest / @vitest/coverage-v8 | 4.1.6 | 4.1.10 | patch |
| @playwright/test | 1.60.0 | 1.62.1 | minor |
| eslint | 10.3.0 root / **9.39.4 in web** | 10.8.1 | web pinned `^9` — align to 10 |
| pg | 8.20.0 | 8.23.0 | specs mixed `^8.13.1`/`^8.20.0` — align |
| **happy-dom** | 15.11.7 | **20.11.2** | S-04 critical (dev) |
| testcontainers / @testcontainers/postgresql | 10.28.0 | 12.1.0 | two majors, dev-only |
| resend | 6.12.3 | 6.18.1 | minor |
| @react-email/render | 2.0.8 | 2.1.0 | components 1.0.12 already latest |
| lucide-react | 1.14.0 | 1.31.0 | minor |
| @base-ui/react | 1.4.1 | 1.7.0 | minor |
| shadcn (CLI) | 4.7.0 | 4.16.2 | dev tool |
| tsx | 4.21.0 | 4.23.11 | ALSO hard-pinned in Dockerfile (`npm i -g tsx@4.21.0`) — bump both |
| prettier | 3.8.3 | 3.9.6 | patch |
| @types/node | 25.7.0 root / `^20` in web | 26.2.0 | align to the Node target chosen |
| pnpm | 11.1.2 | 11.21.0 | `packageManager`, CI `PNPM_VERSION`, Dockerfile corepack pin |
| Node (image/CI) | 22-alpine / "22" | 24 LTS | 22 = maintenance LTS (EOL 2027-04); `engines: >=20` is stale (20 EOL'd) |

### 2.3 Test coverage reality

- 83 unit/integration test files + 46 Playwright e2e specs; per-package vitest
  configs; Testcontainers `postgres:16` for anything DB-shaped (no engine
  substitution — normative rule, held in practice).
- `docs/plans/COVERAGE.md` maps every MVP PRD requirement to plan+validation;
  spot-checks agree with the test tree.
- CI: `lint-and-typecheck` + `test` required checks; `e2e` advisory
  (skips docs-only). All green on the last ~12 runs (through 2026-05-21).
- Verified 2026-08-09: `pnpm install --frozen-lockfile` and `pnpm typecheck`
  pass on a fresh checkout. Full `pnpm test` needs Docker (not run in this
  audit pod); CI history is the evidence of record.
- Coverage gaps worth knowing: no load/perf tests; SSE bus unit-tested but the
  multi-pod path is (deliberately) unbuilt; e2e suite drives the local-auth
  flows heavily — **Phase 2 will invalidate roughly the whole `__e2e__/auth/`
  tree and every `signInAs`-style credential fixture** (see Phase 2 file map).

### 2.4 CI / release health

- `ci.yml` (lint+typecheck, test, build-image on tag/release),
  `e2e.yml` (advisory Playwright), `release-please.yml` (PAT-backed after the
  GITHUB_TOKEN-suppression saga — documented in-line in the workflow).
- release-please works: v0.8.0 tagged, image built + pushed to GHCR, deployed.
- **Stale**: open release PR #48 (v0.8.1) since 2026-05-21 (docs-wave leftovers).
- **Risk**: `RELEASE_PLEASE_PAT` is a fine-grained PAT with an expiry —
  runbook told the operator to rotate; 80 days idle means check it before
  relying on tonight's release cycle.
- Actions runners: `actions/checkout@v4`, `setup-node@v4`, docker actions v3–v6
  — one major behind on several (checkout@v5/v6 era); low priority.

### 2.5 Dead code / vestigial

- `apps/web/e2e/walking-skeleton.spec.ts` — 326-line monolithic happy-path
  superseded by the 8 granular specs in `e2e/walking-skeleton/`;
  `playwright.config.ts` runs BOTH, doubling happy-path runtime. Delete the
  monolith.
- `apps/web/public/{file,globe,next,vercel,window}.svg` — create-next-app
  boilerplate, zero references. Delete.
- Dead branch in `jobs.listByState` (`routers/jobs.ts:743-750`) — no-op Alumni
  condition; removed as part of the S-M3 fix.
- `app/forgot-password/actions.ts` redirects to `/reset-password`, which has
  **no page** — dead target today (whole flow dies in Phase 2 anyway).
- `findActiveInviteToken` (packages/auth) — exported, never imported (dies in
  Phase 2 regardless).
- NOT dead (checked): `packages/api/src/dues.ts` — used by `jobs.complete`
  (`computeDuesSplit`).

## 3. Local-auth surface (what dies with ADR 0007)

Summary here; the exhaustive file-by-file removal map lives in the plan
(Phase 2). Four concerns die, one survives:

1. **Invite-token system** (dies whole): `packages/auth/src/invite-tokens/`,
   `packages/db/src/schema/invite-tokens.ts` (+ `INVITE_TOKEN_ROLES`),
   `packages/api/src/routers/invites.ts`, `/signup` (page+form+action),
   `/admin/invites` (page + `InviteList`/`MintInviteButton`/`RevokeInviteButton`),
   the AdminNav entry, plus a NEW migration to `DROP TABLE invite_tokens`.
2. **Email+password** (dies whole): `/login` action+form, `/forgot-password`
   (all), the `emailAndPassword` + `accountLinking` blocks in
   `packages/auth/src/config.ts`; `account.password` and the `verification`
   table go dormant (Better Auth still expects the tables — keep them).
3. **Direct Google Workspace OIDC** (replaced, not deleted): the `genericOAuth`
   block in `config.ts` is already a *generic* OIDC client pointed at Google
   purely by config — repoint `discoveryUrl`/`providerId` at the portal, drop
   the `hd` param and `packages/auth/src/hooks/hd-restriction.ts`, rewrite
   `mapProfileToUser` to consume portal tier claims instead of hardcoding
   `role:'Alumni'`.
4. **Bootstrap-admin-on-signin** (dies): `hooks/bootstrap-admin.ts`, the
   `databaseHooks.session.create.after` hook, `BOOTSTRAP_ADMIN_EMAIL`.
5. **Survives**: Better Auth core (`drizzleAdapter`, `nextCookies`, session
   7d/1d), `/api/auth/[...all]` handler, `users/session/account/verification`
   tables, `getServerSession`/`getSessionRole`, tRPC context + role middleware,
   `transitionRole` + audit trail + min-Admin trigger (but see the role-mapping
   decision below).

Env vars: `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` re-point to portal client
creds; `OIDC_DISCOVERY_URL` changes value; `OIDC_HOSTED_DOMAIN` +
`BOOTSTRAP_ADMIN_EMAIL` die; `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`/
`DATABASE_URL` stay.

**The one real design decision — role mapping.** App roles are behavior tiers
(`Active` does jobs, `Alumni` posts+pays, `Moderator` approves, `Admin`
governs). Portal claims are membership tiers (`pending/brother/operator/admin`
+ `organizer` capability). No 1:1 exists — in particular, undergrad Actives are
not alumni-registry members at all, and the DB's min-1-Admin trigger assumes
the app owns Admin assignment. See the plan's Phase 2 §decision for the
proposed default mapping and its open questions. Test data in prod means no
migration-of-users problem — accounts can be wiped.

## 4. Live instance

| Fact | Value |
|---|---|
| Namespace / workload | `frontend` / Deployment `todos-for-dues`, 1 replica |
| Image | `ghcr.io/thaynes43/todos-for-dues:v0.8.0` (= repo HEAD release → **prod staleness: none**) |
| Pod | 64d old, **5 restarts** (last 2026-07-29, exit 143/SIGTERM after CNPG failover-driven `uncaughtException`s — see S-06; earlier restarts correlate with node drains) |
| Resources | requests 50m CPU / 256Mi, limit 1Gi mem — sane for the workload |
| Probes | startup/readiness/liveness all on `/api/health` — good |
| Ingress | Traefik IngressRoute `todos-for-dues.haynesops.com` (internal-only, `certificate-haynesops` TLS) |
| Database | CNPG `postgres16` cluster (`database` ns), DB `todos_for_dues`, user `todos_for_dues_user`; created/migrated by init containers (`postgres-init:18.4` + repo migrator via `tsx`) |
| Secrets | ExternalSecret ← 1Password items `todos-for-dues` + `cloudnative-pg` |
| GitOps | Flux HelmRelease (bjw-s app-template 5.0.1), reloader-annotated |
| Data | **Test/smoke only** (see §0) — users: `admin@sigoalumni.org` (google-workspace SSO), `manofoz@gmail.com` + 3 `*-1b767b72@sigoalumni.org` personas (credential accounts); 6 junk jobs; 1 revoked invite token; `chapter_display_name = "Sigo"` |

Health right now: `{"status":"ok","version":"dev","db":true}`.

## 5. Docs truth — stale claims

| Doc | Claim | Reality |
|---|---|---|
| `apps/web/README.md` | "scaffolded MVP shell … no procedures or plugins", routes list = placeholder only | Full MVP: 5 routers, ~15 pages, SSE, emails. **Fixed inline in this PR** (worst lie, trivial) |
| `README.md` (root) | two lines, no description | Not false, just useless — Phase 3 rewrites it with the Sigo framing |
| `docs/releases/001-mvp.md` | `status: Planned` | MVP shipped + deployed (v0.8.0). Needs status flip + closeout note |
| `docs/adrs/007-google-workspace-oidc.md` | `status: Proposed` | Implemented and live — but about to be superseded by the portal-OIDC ADR (Phase 2 writes ADR-013; supersede rather than flip to Accepted) |
| `docs/ops/runbook.md` §2 | `kubectl exec -n frontend -it cluster16-1 -- psql -U todos_for_dues …` | Wrong namespace, wrong pod, wrong user: `kubectl exec -n database postgres16-1 -c postgres -- psql -d todos_for_dues`. **Fixed inline in this PR** |
| `docs/ops/runbook.md` §1 | Loki deeplink "TODO: paste" | Still TODO after 80 days; fill or drop in Phase 4 |
| `.agents/context/014-…` | "Live instance … running v0.6.0" | v0.8.0 — handoffs are historical records though; note, don't rewrite |
| `docs/ops/runbook.md` §4/5 | references `packages/auth/src/oidc.ts` | file does not exist — the genericOAuth/`mapProfileToUser` code lives inline in `packages/auth/src/config.ts`; Phase 2 rewrites these sections anyway |
| `packages/notifications/src/send-email.ts:64` | comment cites `/api/_test/resend-calls` | route moved to `/api/test/resend-calls` |
| `.env.example` | omits `RESEND_WEBHOOK_SECRET`, `RESEND_FROM_ADDRESS`, the 5 `BOOTSTRAP_*_RECIPIENT/…` seed vars | All required/used in prod (ExternalSecret template). Phase 2 rewrites this file anyway |
| `CLAUDE.md` §Auth wiring | describes invite + HD-restriction as current | True today; Phase 2 must rewrite this section same-PR as the auth swap |

## 6. Brand gap (input to the rebrand agent)

Current UI (screenshotted live 2026-08-09, `/` and `/login`):

- Default shadcn/Tailwind monochrome: black text on white, black primary
  buttons, hairline borders. No color anywhere, no logo, no crest, no imagery.
  Wordmark is plain-text "TODOs for Dues" in the header.
- Copy: "Per-chapter dues-credit job board", tipping footer note; login shows
  a mismatched pairing "Have an invite link? / Forgot password?".
- Layout: single centered column, no hero, no footer identity, no dark mode.

The Sigo look (sigoalumni.org, the suite's reference until ux-governance ships
tokens): warm white background, **forest/olive-green primary buttons and
accents**, rounded-2xl cards with soft borders, photo hero with dark overlay
and white display type, "Sigo Alumni" wordmark left + roomy top nav, humanist
sans, footer with full org name + motto *Non Sibi Sed Omnibus* + contact.
North star (ux-governance): "feel-good, all ages, idiot-proof."

Delta = everything: palette (introduce the green primary + warm neutrals as
Tailwind v4 `@theme` tokens), typography scale, header/footer org identity
("Sigo Alumni" family branding, app name as a suite member, e.g. "Dues Jobs —
Sigo Alumni"), card/button radii, empty-state warmth, and the app-name
question itself (product copy says "TODOs for Dues"; org docs call it the
dues-tracking app — naming decision belongs to Tom, flag in the rebrand PR).
Screens inventory for the restyle is in the plan, Phase 3. NOTE: ux-governance
design tokens do not exist yet (design-system saga is `scoping`) — the rebrand
mirrors the live site's look rather than consuming a published token set, and
must be re-checked once item 02 (identity guidelines + tokens) lands.

## 7. Known-issues carry-over (from the repo's own backlog)

From handoff 014 + PLAN-013 §3.1 (still open, unaffected by modernization
unless noted): invite-email delivery (dies with Phase 2 — drop), audit-log
search polish, tipping flow (`TippingNudge` placeholder), multi-pod SSE
adapter, release-please PAT rotation reminder.
