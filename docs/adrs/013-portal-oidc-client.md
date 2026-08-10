---
id: ADR-013
title: Become an OIDC client of the sigoalumni.org portal and remove all local auth
status: Accepted
date: 2026-08-10
deciders: [Tom Haynes]
consulted: [sigo-alumni ADR 0006 (tier ladder), sigo-alumni ADR 0007 (suite SSO)]
informed: []
related:
  prds: [PRD-001, PRD-003]
  adrs: [ADR-002, ADR-011]      # ADR-002 partly superseded (invite gating + credential path removed; Better Auth choice stands); ADR-011 role partition still applies
  flows: []
  designs: [DESIGN-004]         # auth wiring — superseded by this ADR's wiring
  supersedes: ADR-007
  superseded_by: null
---

## Context and problem statement

The Sigo Alumni suite adopted portal-centralized SSO (sigo-alumni ADR 0007):
sigoalumni.org runs a Better Auth OIDC **provider** ("the members door"), and
every suite app authenticates against it as an OIDC client, authorizing
locally from the claims it carries. Membership is granted at the portal via
its tier ladder (sigo-alumni ADR 0006): `pending → brother → operator →
admin`, plus capability claims (e.g. `organizer`).

TODOs for Dues predates that decision and carried its own identity plumbing:
Google Workspace OIDC with an HD restriction (ADR-007), email+password signup
gated by invite tokens (ADR-002), forgot-password email flows, and a
`BOOTSTRAP_ADMIN_EMAIL` promotion hook. Running a second membership system
next to the portal means two onboarding queues, two offboarding surfaces, and
a standing drift risk between "portal member" and "dues member".

Decision: how does this app authenticate and authorize now that the suite
portal is the identity source?

## Decision drivers

1. **One membership truth** — brothers are verified once, at the portal;
   apps must not re-implement onboarding (suite ADR 0007).
2. **Local authorization stays local** — app behavior roles
   (`Active|Alumni|Moderator|Admin`, DB CHECK + min-1-Admin trigger +
   FSM-audited transitions, ADR-011) are this app's own domain; the portal
   knows tiers, not job-board roles.
3. **No real data at stake** — prod contains junk rows only (audit §0);
   a clean identity wipe is acceptable and simpler than sub-mapping.
4. **Config-only cutover** — the portal issuer moves from its Cloud Run
   origin to https://sigoalumni.org at launch; the app must follow via env
   change alone.
5. **Fail closed** — a misconfigured or unreachable IdP must disable
   sign-in, never widen it; the app still boots so operators can see why.

## Considered options

- **Option A** — Portal OIDC only; delete local credential + invite auth
- **Option B** — Portal OIDC alongside the existing credential/invite path
- **Option C** — Portal OIDC plus a break-glass local admin login

## Decision outcome

**Option A.** The app is a confidential OIDC client of the portal
(authorization code + PKCE S256 only), and the portal is the ONLY door.

Wiring (the chokepoint is `packages/auth/src/config.ts`):

- Better Auth `genericOAuth`, `providerId: 'sigo-portal'`, discovery from
  `OIDC_DISCOVERY_URL`, `pkce: true`, scopes
  `openid profile email offline_access`. Registered redirect URI:
  `https://todos-for-dues.haynesops.com/api/auth/oauth2/callback/sigo-portal`
  (renaming the provider id invalidates it). Client id `todos-for-dues`;
  secret via `OIDC_CLIENT_SECRET`.
- Sign-in is enabled iff `OIDC_CLIENT_ID` + `OIDC_CLIENT_SECRET` +
  `OIDC_DISCOVERY_URL` are all set; otherwise `/login` shows a terse
  operator note and no auth path exists (fail closed, app boots).
- Deleted: invite tokens (schema + router + UI + `invite_tokens` table via
  migration 0011), email+password + forgot-password, HD restriction,
  `BOOTSTRAP_ADMIN_EMAIL` hook, `OIDC_HOSTED_DOMAIN`. Existing pre-SSO
  user rows are wiped by migration 0011 (driver 3); chapter settings
  survive the wipe.
- The Better Auth session model is unchanged (7-day sessions, 1-day
  update age); `account`/`verification` tables stay, `account.password`
  is dormant.

### Tier → role mapping (adopted by default; TODO(tom): bless or amend)

| Portal tier | App role |
|---|---|
| `admin` | `Admin` |
| `operator` | `Moderator` |
| `brother` | `Alumni` |
| `pending` | sign-in refused — terse "membership pending" screen, no user row |

- `Active` (undergrads doing the work) stays **app-granted**: the portal
  registry has no actives, so a portal-`brother` user can be switched
  Alumni↔Active by self-service/admin exactly as before (`users.changeRole`
  survives). `brother` is therefore consistent with BOTH Alumni and Active.
- Unknown/missing tier ⇒ refused (fail closed, driver 5).
- The mapping runs in `mapProfileToUser` at first sign-in (initial role) and
  re-runs on EVERY session create (`packages/auth/src/hooks/claim-sync.ts`),
  reading the tier from the freshest stored `sigo-portal` id_token. Role
  writes route through `transitionRole`, so `user_role_transitions` stays
  honest (initiator `system`, note `portal claim-sync`). Claim changes
  propagate at the next sign-in (suite ADR 0007 C-3); the refresh grant
  returns access tokens only, so mid-session tier changes wait for the next
  sign-in.
- **Min-Admin conflict**: if claims demote the LAST Admin, the deferred
  min-1-Admin trigger (migrations 0003/0008) aborts the transition. The
  claim-sync catches it, retries with `Moderator` (closest privileged role —
  also blocked while admin-count is 1), then keeps the user Admin, logs
  loudly, and lets the sign-in succeed. The demotion lands at a later
  sign-in once another Admin exists. The trigger stays (the app still owns
  Active/Alumni grants; dropping it was rejected).
- `organizer` capability: ignored by this app for now (open question — no
  dues-app behavior hangs off it yet).

### Consequences

- **C-01 (good)** — One onboarding/offboarding surface: the portal.
  Verifying a brother there grants dues access; demoting to `pending`
  locks them out at next sign-in. No invite links to mint or leak.
- **C-02 (good)** — Portal-first SSO: a user already signed in at
  sigoalumni.org completes the dues sign-in silently; signing in from dues
  bounces through the portal's members door and back.
- **C-03 (good)** — Config-only cutover (driver 4): the issuer move to
  https://sigoalumni.org is an `OIDC_DISCOVERY_URL` env change
  (`TODO(cutover)` markers in `.env.example` / config).
- **C-04 (good)** — The e2e suite runs against a portal-shaped OIDC mock
  (PKCE-enforcing, tier claims in id_token + userinfo, per-email identity
  registry) — no live portal dependency in CI.
- **C-05 (bad)** — Total availability coupling: if the portal is down,
  nobody signs in to dues (existing sessions ride out their 7 days).
  Accepted at chapter scale; no break-glass local login (Option C rejected
  — it recreates the credential surface this ADR deletes).
- **C-06 (bad)** — Tier changes propagate only at sign-in, not
  mid-session: a demoted brother keeps an active dues session up to 7 days
  (session expiry) unless an Admin deactivates them in-app.
- **C-07 (neutral)** — Elevated app roles granted in-app (e.g. Admin makes
  a `brother` a Moderator via the UI) are ephemeral: the next sign-in's
  claim-sync reverts them to the tier mapping. Durable elevation belongs at
  the portal (tier change). Alumni↔Active grants are unaffected.
- **C-08 (bad, watch item)** — The portal's discovery advertises
  `claims_supported: [sub, iss, aud, …, email, email_verified, name]`
  WITHOUT `tier`/`capabilities` (verified 2026-08-10). Suite ADR 0007 says
  the claims travel in the token; if the live id_token/userinfo turn out
  not to carry `tier`, first sign-ins fail closed (refused) and existing
  users' sync no-ops — the Phase-4 live round-trip must confirm before
  cutover (coordinate with the members-portal workstream).
- **C-09 (neutral)** — Migration 0011 wipes all pre-SSO identities (and
  their jobs/audit rows); chapter settings are preserved. Everyone
  re-onboards through the portal; the practical rollback floor is the last
  pre-0011 tag.

## Validation

- `packages/auth/__tests__/portal-tiers.test.ts` (mapping table),
  `__tests__/integration/claim-sync.integration.test.ts` (sync, pending
  gate, min-Admin guard against the real trigger).
- e2e: `apps/web/e2e/auth/{portal-sso,claim-resync,min-admin-guard}.spec.ts`
  drive the full browser flow against the portal-shaped mock.
- Live: one discovery fetch verified config parsing (2026-08-10); full
  round-trip is Phase 4 (secret delivery via ExternalSecret).
