---
id: MODERNIZATION-PLAN
title: Modernization plan — phased implementation for the overnight agent program
status: Ready
author: modernization-audit agent
created: 2026-08-09
inputs:
  - docs/audits/2026-08-modernization-audit.md   # findings + evidence
  - sigo-alumni ADR 0007 (suite SSO — portal is the IdP)
  - sigo-alumni ADR 0006 (tier ladder)
---

# Modernization plan

Four phases. **1 and 3 are independent and can run in parallel; 2 depends on
the portal's OIDC-provider endpoints existing (build against the e2e mock
until they do); 4 is last.** Each phase = its own PR(s) through the repo's
normative flow (branch → PR → `lint-and-typecheck` + `test` green →
squash-merge). Conventional commits; release-please computes versions.

**Before any phase: merge or close the stale release PR #48 (`chore(main):
release 0.8.1`, open since 2026-05-21)** so tonight's releases don't fold into
a stale changelog. Also verify `RELEASE_PLEASE_PAT` hasn't expired (runbook §9)
— a dead PAT silently breaks the tag → image pipeline.

Prod data is disposable (audit §0): no real member/dues data exists. No user
migration is required anywhere in this plan; wiping `todos_for_dues` rows is
acceptable if Phase 2 wants a clean slate.

---

## Phase 1 — dependencies + hygiene + security hotfixes

One PR for the dep wave, one for the security hotfixes (reviewable
separately; the hotfixes must not wait on dep churn).

### 1a. Security hotfixes (small, surgical — do first)

| Fix | File | Change |
|---|---|---|
| S-00 secret fallback | `packages/auth/src/config.ts` | Remove `?? 'dev-only-…'`; add a boot guard: in production, throw if `BETTER_AUTH_SECRET` or `BETTER_AUTH_URL` unset |
| S-M1 email leak | `packages/api/src/routers/users.ts` (`getById`) | Split: `authedProcedure` returns `{id, displayName}` only; email+role projection moves behind `adminProcedure` (new `getByIdAdmin` or input-flag + gate). Update callers: `apps/web/app/jobs/[jobId]/page.tsx`, `apps/web/app/admin/users/[userId]/page.tsx`, `apps/web/app/admin/jobs/[jobId]/page.tsx` |
| S-M2 job over-projection | `packages/api/src/routers/jobs.ts` (`getById`) | Replace `{...job}` spread with an explicit allow-list; include `perActiveDuesCredit`, `posterContactValue`, dispute/cancel/reject reasons only for privileged/owner/enrolled viewers (the `seesRoster`/`viewerCredit` scaffolding already computes the right predicate) |
| S-M3 list gate | `packages/api/src/routers/jobs.ts` (`listByState`) | Delete the dead branch (743-750); restrict Alumni to own postings for non-public states; narrow the selected columns to what `JobCard` renders |
| S-06 pool crash | `packages/db/src/index.ts` | `pool.on('error', …)` logging a one-line message (no client-object dumps); prevents `uncaughtException` on CNPG failover |
| Headers | `apps/web/next.config.ts` | `poweredByHeader: false` + `headers()` with HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (skip CSP for now — Tailwind/Next inline styles make it a project of its own) |
| Test endpoint | `apps/web/app/api/test/resend-calls/route.ts` | Add `NODE_ENV !== 'production'` to the gate; fix the stale path comment in `packages/notifications/src/send-email.ts:64` |
| Repo settings | GitHub | Enable Dependabot alerts + security updates (settings toggle, no code). **P1 outcome (2026-08-10): NEEDS TOM** — the dev-bot app token gets 403 `Resource not accessible by integration` on both `PUT /vulnerability-alerts` and `PUT /automated-security-fixes`; flip the two toggles in repo Settings → Security manually (~1 min) |

Tests to add: unit for the new `users.getById` projection split; integration
asserting a non-privileged viewer of `jobs.getById` gets no `perActiveDuesCredit`
/ reasons; existing suites (`events-*`, `webhooks-resend`) must stay green.

### 1b. Dependency wave (exact targets, from audit §2.2)

Update specs in ALL workspace `package.json`s that declare them (drift-align
the mismatched ones — better-auth, pg, eslint, @types/node):

```
next@^16.3.0            react@19.2.8  react-dom@19.2.8
better-auth@^1.6.26     (align apps/web spec from ^1.4.0)
drizzle-orm@^0.45.2     drizzle-kit@^0.31.10   drizzle-zod@^0.8.3
zod@^4.4.3              (unify: packages/db + packages/api migrate off v3)
@trpc/*@^11.18.0        @tanstack/react-query@^5.101.4
tailwindcss@^4.3.3      @tailwindcss/postcss@^4.3.3
vitest@^4.1.10          @vitest/coverage-v8@^4.1.10
@playwright/test@^1.62.1
eslint@^10.8.1          (align apps/web from ^9; keep eslint-config-next in lockstep with next)
pg@^8.23.0  @types/pg   (align all specs)
happy-dom@^20.11.2      testcontainers@^12.1.0  @testcontainers/postgresql@^12.1.0
resend@^6.18.1          @react-email/render@^2.1.0
lucide-react@^1.31.0    @base-ui/react@^1.7.0   shadcn@^4.16.2
tsx@^4.23.11            (ALSO bump the Dockerfile global pin `npm i -g tsx@…`)
prettier@^3.9.6         @types/node@^26.2.0 (align apps/web from ^20)
```

Toolchain, same PR:
- `packageManager: pnpm@11.21.0` + CI `PNPM_VERSION` + Dockerfile corepack pin.
- Node: Dockerfile `node:22-alpine` → `node:24-alpine`, CI `NODE_VERSION: "24"`,
  root `engines.node: ">=22"` (20 is EOL).
- **TypeScript stays `^5.9.3`** — 7.x (native-port line) is a separate spike;
  do not couple it to this wave.

Known-churn risks (budget time here):
- **drizzle 0.36 → 0.45**: 9 minors. Check `numeric` typing (the string-mode
  workaround in `packages/db/src/schema/jobs.ts` may become a real `mode`
  option), `drizzle-kit generate` output drift, `migrate()` API. The
  `no-direct-state-writes` scan-test and the constraint tests are the safety
  net — run the full DB suite.
- **zod v3 → v4 in `packages/db` + `packages/api`**: error-shape and
  `.strict()`/coercion behavior changed; `drizzle-zod@0.8` is the v4-compatible
  pairing (`packages/db/src/schema/zod.ts` will need its factory calls
  re-checked). tRPC input errors' client rendering (form error surfacing in
  `PostJobForm`/`EditJobForm`) must be spot-checked in e2e.
- **testcontainers 10 → 12**: `packages/test-utils/src/postgres.ts` API
  re-check (wait strategies / container types renamed across majors).
- **eslint 9 → 10 in apps/web**: needs `eslint-config-next` compatible with
  eslint 10 (ships with next 16.3) — keep them in one bump.
  **P1 outcome (2026-08-10): DEFERRED** — `eslint-config-next@16.3.0` still
  depends on `eslint-plugin-react@^7.37`, which crashes under eslint 10
  (peer range caps at `^9.7`; `context.getFilename` removed). apps/web is
  pinned to `eslint@^9.39.5` with a `TODO(modernization)` in its
  `eslint.config.mjs`; root stays on eslint 10. Everything else in the 1b
  wave landed at target.

### 1c. Verification (Phase 1 definition of done)

1. `pnpm install` (lockfile regenerated), `pnpm typecheck`, `pnpm lint` clean.
2. `pnpm test` with Docker (full Testcontainers suite) green.
3. `pnpm --filter web build` succeeds; `pnpm --filter web e2e` green locally/CI.
4. `pnpm audit --prod` reports **zero critical/high** (dev-tree stragglers:
   note and accept explicitly in the PR body).
5. release-please cycle produces a tag and GHCR image (proves the PAT lives).

---

## Phase 2 — auth restructure (remove local auth, become a portal OIDC client)

**Gate:** the portal's OIDC-provider endpoints (ADR 0007, Better Auth provider
plugin on sigoalumni.org) must exist for the live cutover; the code + tests can
be built NOW against the repo's e2e OIDC mock reshaped to the portal's claim
set. Register this app at the portal with redirect URI
`https://todos-for-dues.haynesops.com/api/auth/oauth2/callback/sigo-portal`
(providerId chosen below; regenerate if renamed).

### 2.0 The one design decision — claim → role mapping (needs Tom's ack; a
recorded default follows)

Portal claims (ADR 0006/0007): tier `pending|brother|operator|admin` +
capabilities (`organizer`). App roles: `Active|Alumni|Moderator|Admin`
(behavior tiers; DB CHECK + min-1-Admin trigger; FSM-audited transitions).

**Proposed default** (compliant with ADR 0007 "apps authorize locally from
claims"):
- Map at session establishment (in `mapProfileToUser` + a sync on sign-in):
  `admin → Admin`, `operator → Moderator`, `brother → Alumni`,
  `pending → sign-in refused` (friendly "almost in" screen).
- `Active` (undergrads doing the work) — portal registry doesn't include
  actives. Keep `Active` as an **app-granted** role: a portal-`brother` user can
  be switched Alumni↔Active by self-service/admin exactly as today
  (`users.changeRole` survives). This is local authorization on top of portal
  identity, not an out-of-band role fetch.
- Claim changes propagate at next token refresh (ADR 0007 C-3): re-run the
  mapping on each sign-in via `transitionRole` so the audit trail stays honest.
- **Min-Admin trigger conflict**: if claims demote the last Admin, the trigger
  would abort sign-in. Resolution: keep the trigger, but claim-sync demotions
  route through a system-actor path that downgrades to Moderator instead of
  violating the invariant, and log loudly. (Alternative — dropping trigger
  0003 — rejected: the app still owns Active/Alumni grants.)

Open question to record in the PR (not blocking the default): whether
`organizer` capability means anything to this app (lean: ignore for now).

### 2.1 Delete — invite-token system

Files to DELETE:
- `packages/auth/src/invite-tokens/verify.ts`
- `packages/db/src/schema/invite-tokens.ts`
- `packages/api/src/routers/invites.ts`
- `apps/web/app/admin/invites/page.tsx`
- `apps/web/components/InviteList.tsx`, `components/MintInviteButton.tsx`,
  `components/RevokeInviteButton.tsx`
- `apps/web/app/signup/actions.ts`, `app/signup/page.tsx`,
  `app/signup/signup-form.tsx`

Files to EDIT (remove references):
- `packages/api/src/routers/index.ts` (drop `invitesRouter`)
- `packages/db/src/schema/index.ts`, `schema/enums.ts` (drop
  `INVITE_TOKEN_ROLES`), `schema/zod.ts` (drop invite schemas)
- `packages/auth/src/index.ts`, `src/errors.ts` (drop `InviteTokenError`)
- `apps/web/components/AdminNav.tsx` (drop `/admin/invites` entry)

NEW migration `0011_drop_invite_tokens.sql`: `DROP TABLE invite_tokens;`
(+ journal entry). Historical migrations are immutable — do not edit 0002.

### 2.2 Delete — email+password + forgot-password

- DELETE: `apps/web/app/login/actions.ts`, `app/forgot-password/**` (3 files).
- REWRITE: `app/login/login-form.tsx` + `app/login/page.tsx` → single
  "Sign in with Sigo Alumni" button (POST `/api/auth/sign-in/oauth2`,
  `providerId: 'sigo-portal'`); drop the email/password form, the
  invite-link/forgot-password footer, and the `hd_restriction` error banner.
- `packages/auth/src/config.ts`: delete `emailAndPassword` and
  `account.accountLinking` blocks.
- `account`/`verification` tables stay (Better Auth expects them);
  `account.password` goes dormant.

### 2.3 Replace — Google OIDC → portal OIDC

- DELETE `packages/auth/src/hooks/hd-restriction.ts`.
- `packages/auth/src/config.ts` (the chokepoint — gut and rewrite):
  - `OIDC_PROVIDER_ID = 'sigo-portal'`; `discoveryUrl` from
    `OIDC_DISCOVERY_URL` (portal well-known; exact path comes from the portal
    implementation — coordinate with the members-portal workstream).
  - Drop `authorizationUrlParams.hd` + `enforceHdRestriction` call.
  - `mapProfileToUser`: read tier claim(s) from the portal profile → app role
    per §2.0; refuse `pending`.
  - Keep `oidcEnabled` gating (id+secret+discovery set) so dev without the
    portal still boots.
- DELETE `packages/auth/src/hooks/bootstrap-admin.ts` + the
  `databaseHooks.session.create.after` block; add the §2.0 claim-sync in its
  place (same hook point, new logic — reuse the idempotent-transition pattern).
- `packages/auth/src/index.ts`: exports follow.

### 2.4 Env + config surface

- `.env.example`: rewrite — keep `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `RESEND_*`; replace the OIDC block with
  `OIDC_CLIENT_ID/OIDC_CLIENT_SECRET/OIDC_DISCOVERY_URL` (portal); delete
  `OIDC_HOSTED_DOMAIN`, `BOOTSTRAP_ADMIN_EMAIL`; ADD the missing-but-required
  `RESEND_WEBHOOK_SECRET`, `RESEND_FROM_ADDRESS`, `BOOTSTRAP_*` seed vars
  (audit §5).
- `CLAUDE.md` §"Auth wiring" — rewrite in the same PR (it currently teaches
  agents the dead system).

### 2.5 Tests

DELETE: `packages/auth/__tests__/hd-restriction.test.ts`,
`__tests__/integration/{signup-flow,verify-invite-token,bootstrap-admin,bootstrap-admin-e2e}.integration.test.ts`,
`__tests__/integration/_next-shims.ts`;
`packages/api/__tests__/integration/invites.test.ts`;
`apps/web/__tests__/components/{InviteList,MintInviteButton,RevokeInviteButton}.test.tsx`;
the whole legacy `apps/web/__e2e__/auth/` suite (6 specs) + its
`support/db.ts` invite helpers; `apps/web/e2e/admin/invites.spec.ts`.

UPDATE (invite/credential references): `packages/auth/vitest.config.ts` (drop
next/navigation alias), `packages/auth/__tests__/integration/_db.ts`,
`packages/api/__tests__/integration/_setup.ts`,
`packages/api/__tests__/e2e/walking-skeleton.test.ts`,
`packages/db/__tests__/{constraints,enums,migrations}.test.ts`,
`apps/web/__tests__/components/AdminLayout.test.tsx`.

REBUILD the e2e auth harness — this is the big test cost:
`apps/web/e2e/fixtures/oidc-mock-server.ts` becomes a portal-shaped mock
(tier claims in userinfo/id_token); `global-setup.ts`/`global-teardown.ts`/
`runtime-env.ts`/`seed-chapter.ts`/`personas.ts` switch persona seeding from
credential rows (`upsertCredentialUser` + `loginViaForm`) to OIDC sign-ins
against the mock (one mock identity per persona/tier);
`e2e/roles/support.ts` drops `BOOTSTRAP_ADMIN_EMAIL`. ADD new specs:
pending-tier refusal, tier→role mapping per §2.0, claim-change re-sync,
min-Admin demotion guard.

### 2.6 Docs

New `docs/adrs/013-portal-oidc-client.md` (MADR): supersedes ADR-002 (partly)
and ADR-007; records §2.0 mapping. Flip ADR-007 to `Superseded by 013`.
Update PRD-003 §status with a pointer (don't renumber R-NNs), runbook §§4/5/7,
`docs/designs/004-auth-wiring.md` banner ("superseded by ADR-013 wiring").

### 2.7 Risks + verification

Risks: portal endpoint shape unknown until the portal ships (mitigate: mock
first, config-only cutover); Better Auth `genericOAuth` claim mapping only
sees the userinfo/id_token payload — confirm the portal puts tier claims
there (coordinate; ADR 0007 says claims travel in the token); wiping junk
prod users (intended) logs everyone out — fine.

Verify: full suite + rebuilt e2e green; `pnpm --filter web build`; manual
round-trip against the portal in Phase 4; grep-gate: zero hits for
`invite`, `OIDC_HOSTED_DOMAIN`, `BOOTSTRAP_ADMIN_EMAIL`, `signUpEmail`,
`signInEmail`, `requestPasswordReset` outside docs/changelog history.

---

## Phase 3 — Sigo rebrand

Reference: audit §6 (brand gap). The suite design tokens don't exist yet
(ux-governance design-system saga is scoping) — mirror the live
sigoalumni.org look: warm white, forest/olive-green primary, rounded-2xl
cards, humanist sans, org identity in header/footer, motto *Non Sibi Sed
Omnibus* in the footer. Re-check against ux-governance item 02 when it lands.

**Naming decision for Tom (flag in PR, don't block):** keep "TODOs for Dues"
as the product name under Sigo Alumni branding, or rename. Copy currently
says "Per-chapter dues-credit job board".

### Screens inventory (post-Phase-2 tree — 16 surfaces + chrome)

| Surface | File | Notes |
|---|---|---|
| Landing `/` | `app/page.tsx` | hero-ify; Sigo identity |
| Login | `app/login/page.tsx` + form | single SSO button, portal framing |
| Jobs list | `app/jobs/page.tsx` + `jobs-list.tsx` | + `JobCard` |
| Job detail | `app/jobs/[jobId]/page.tsx` | + `JobDetailView`, all banners |
| New job | `app/jobs/new/page.tsx` | + `PostJobForm` |
| Edit job | `components/EditJobForm.tsx` | |
| My postings / My enrollments | `app/my-postings/`, `app/my-enrollments/` | |
| Moderation queue | `app/moderation-queue/page.tsx` + `ModerationQueue` | |
| Profile | `app/profile/page.tsx` + `ProfileRoleSection` | |
| Admin: dashboard/users/user/disputes/audit-log/settings/job | `app/admin/**` (7 pages) | + `AdminNav`, `AggregateCountsCards`, `UserListTable`, `DisputeCardList`, `AuditLogTable`, `SettingsForm`, `RoleChange*` |
| Chrome | `components/ChapterHeader.tsx`, `Footer.tsx`, `RoleAwareNav.tsx` | org wordmark, motto, nav |
| Primitives | `components/ui/{button,input,modal,textarea}.tsx`, `app/globals.css` | tokens live here |
| State banners/modals | `components/*Banner.tsx`, `*Modal.tsx`, `JobStateBadge.tsx`, `TippingNudge.tsx` | recolor states (green=good, amber=waiting, red=disputed) |
| Emails | `packages/notifications/src/templates/*.tsx` + `_components/Layout.tsx` | same identity; 4 snapshot tests will need regen |
| Favicon/assets | `app/favicon.ico`, delete boilerplate SVGs (audit §2.5) | add Sigo favicon/wordmark asset |

Mechanics: define palette/radius/font tokens as Tailwind v4 `@theme` variables
in `app/globals.css` (no `tailwind.config` — v4 CSS-first); sweep components
off hardcoded grays onto the tokens; keep contrast ≥ WCAG AA ("all ages" north
star).

Risks: e2e specs assert copy/testids — run the full Playwright suite and fix
assertions alongside; snapshot tests for emails regenerate. Verification:
`pnpm --filter web e2e` green, before/after screenshots in the PR, manual pass
at 390px width (the audit screenshots showed mobile-width rendering already
works structurally).

---

## Phase 4 — deploy + verify (haynes-ops)

All through GitOps (branch + PR in haynes-ops; Flux applies). Files:
`kubernetes/main/apps/frontend/todos-for-dues/app/{helmrelease.yaml,externalsecret.yaml,ingressroute.yaml}`.

1. **Image bump**: release-please tag from Phases 1-3 (the auth swap is a
   `feat!:` → expect v1.0.0). Update the `&mainImage` tag anchor in
   `helmrelease.yaml` (covers app + migrator init container).
2. **ExternalSecret rewrite** (`externalsecret.yaml` template):
   - DROP `OIDC_HOSTED_DOMAIN`, `BOOTSTRAP_ADMIN_EMAIL`.
   - `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` now come from the portal's static
     client registration (1Password item update — **needs Tom / a
     secret-write path**; agents can stage the manifest but not the vault).
   - ADD `OIDC_DISCOVERY_URL` (portal well-known) and `APP_VERSION` (from the
     chart values, template it next to `NODE_ENV`) so `/api/health` stops
     reporting `dev`.
3. **Portal side**: register client `sigo-portal` redirect URI
   `https://todos-for-dues.haynesops.com/api/auth/oauth2/callback/sigo-portal`
   (members-portal workstream owns this).
4. **Egress check**: the app pod must reach `https://sigoalumni.org` (Cloud
   Run) for discovery + token exchange. Verify whether the `frontend`
   namespace has a restrictive CiliumNetworkPolicy; if so, allowlist the
   portal host. (The existing Google OAuth worked, so general internet egress
   likely exists — verify, don't assume. Keep `NODE_OPTIONS
   --dns-result-order=ipv4first`; the cluster has no IPv6 egress and the
   portal resolves AAAA on Cloud Run too.)
5. **Data reset (optional but recommended)**: truncate the junk rows
   (`users`/`jobs`/`sessions`/…) before first real sign-ins, or
   `kubectl cnpg destroy`-style re-clone is overkill — a SQL truncate via the
   migrator image is enough. Record what was done.
6. **Verify**: pod rolls cleanly (reloader picks up the secret change);
   `/api/health` → `{status: ok, version: v1.0.0}`; `LIVE_URL=… pnpm --filter
   web e2e:live` smoke; full sign-in round trip through the portal with a
   brother-tier + an admin-tier account; kill the CNPG primary once
   (`kubectl -n database delete pod postgres16-<primary>` is within operator
   tier) and confirm the app survives without restart (S-06 fix); fill the
   runbook's Loki deeplink TODO while in there.

Rollback: revert the haynes-ops PR (image tag + secret template are the whole
change); the DB migration only dropped `invite_tokens`, which v0.8.0 can
recreate from its migration set if ever rolled back that far (it can't —
`_journal` already past it; practical rollback floor is the last pre-Phase-2
tag with local auth intact).

---

## Sequencing summary

```
merge/close PR #48 ─┬─ Phase 1a security hotfixes ──┐
                    ├─ Phase 1b dep wave ────────────┤
                    └─ Phase 3 rebrand (parallel) ───┼─ Phase 2 auth swap ── Phase 4 deploy
portal OIDC provider endpoints (external gate) ──────┘   (mock-first build can start now)
```
