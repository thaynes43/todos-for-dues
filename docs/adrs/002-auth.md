---
id: ADR-002
title: Use Better Auth for application authentication, with invite-token-gated signup
status: Proposed
date: 2026-05-06
deciders: [Tom Haynes]
consulted: []
informed: []
related:
  prds: [PRD-001, PRD-003]
  adrs: [ADR-001, ADR-007]      # web framework; Google Workspace OIDC federation model
  flows: []                     # docs/flows/walking-skeleton.md pending — will trace signup
  designs: []                   # docs/design/auth.md pending — invite-token table, MFA enforcement
  supersedes: null
  superseded_by: null
---

## Context and problem statement

Auth is the highest-stakes decision in TODOs for Dues because the product is invite-only by design — non-members of a fraternal organization must not be able to gain access. Per PRD-001 R-01 and R-02, signup is gated by an Admin-issued invite token, the user picks Active or Alumni at signup, and Moderator/Admin are escalated only.

Product discovery (during ADR-002 drafting) confirmed:
- Email + password is the primary login method for app-managed accounts.
- Optional MFA (TOTP) and passkey (WebAuthn) enrollment post-signup, available to all app-managed users.
- MFA **required** for Moderator and Admin on app-managed accounts (conditional enforcement based on role). MFA for SSO-authenticated privileged users is delegated to the Workspace admin (ADR-007 C-07).
- **OIDC SSO via Google Workspace is required for MVP** at the launch chapter. Better Auth's OIDC client plugin is the implementation path. HD restriction is enforced at the application callback. Per-instance config via env vars. Full model: ADR-007 and PRD-003.
- Bootstrap admin on a fresh instance via an env-var-seeded flow.
- A single active invite token per instance, with whichever-comes-first expiry (time or use-cap), Admin-rotatable. Redeemable via clickable link **or** typed code (Discord-style).

This ADR picks the auth library/strategy and the high-level shape of the invite-gating flow. It does not specify the API contract for mobile portability (ADR-003 pending), the database/ORM (ADR-004 pending), the email provider for verification and password reset (ADR-005 pending), or hosting details (ADR-006 pending). Detailed schema, endpoints, and the invite-token state machine belong in `docs/design/auth.md` (pending).

## Decision drivers

1. **Invite-token gating must happen before account creation**, not as an after-the-fact check. The chosen library must allow a custom pre-signup gate without contortion.
2. **Supports the chosen auth primitives**: email + password (with email reset), TOTP MFA, passkeys (WebAuthn), and OIDC client (post-MVP).
3. **Conditional MFA enforcement** by role (required for Moderator + Admin).
4. **Self-hosted**, no per-MAU fees. Chapter-scale economics rule out hosted SaaS auth.
5. **TypeScript-native API**, consistent with ADR-001's TS-everywhere posture; types double as agent context.
6. **Mobile-future portability**: token model must work for both web cookies and mobile bearer tokens. (Full mobile contract is ADR-003.)
7. **Reasonable migration path** to enterprise IdP (Keycloak, Ory) if the product later needs federated identity for orgs with mature SSO.
8. **Active maintenance** with a credible security posture; this is the worst place for a stalled or abandoned dependency.

## Considered options

- **Option A** — Better Auth (TypeScript-native, self-hosted, plugin model)
- **Option B** — Auth.js (formerly NextAuth) — mature, Next.js-native, plugin/adapter model
- **Option C** — Clerk — hosted SaaS, polished UI primitives
- **Option D** — Keycloak — self-hosted IdP, OIDC-native, JVM service
- **Option E** — Ory Kratos — self-hosted identity service, K8s-native
- **Option F** — Roll our own using low-level primitives (oslo, jose, argon2)

## Decision outcome

**Chosen option:** **Option A — Better Auth**, with the invite-token gate implemented as a small custom layer (table + pre-signup endpoint) on top.

Better Auth covers every primitive on our roadmap as first-party functionality: email + password, email verification, password reset, TOTP MFA, passkeys, and an OIDC client plugin for in-MVP Google Workspace SSO (ADR-007). Its TypeScript-first API matches ADR-001 and gives agents typed call sites, which materially improves their precision when modifying auth code. Self-hosting keeps member-roster data in our database and avoids per-MAU pricing that would scale poorly across many small chapters. The session model supports both cookies (web) and bearer tokens (mobile), preserving the mobile-future option without committing us to a contract here. The invite-token gate is custom application code on top of any library we'd pick — Better Auth's plugin/middleware shape makes the wrapper straightforward.

Auth.js is the credible alternative — more mature, larger community — but its TypeScript types are weaker, MFA and passkey support are community-driven rather than first-party, and the session/adapter model is opinionated in ways that make custom pre-signup gating awkward. Clerk is rejected on cost, lock-in, and data-residency. Keycloak and Ory are credible but introduce a separate service to operate before we need its capabilities; both remain viable migration targets if SSO/SCIM ever needs to live in a dedicated IdP.

### Consequences

- **C-01 (good)** — TypeScript-native API and types compose with ADR-001's stack; auth code reads as normal app code to agents.
- **C-02 (good)** — Self-hosted; no per-MAU fees as the product expands chapter-by-chapter; member rosters remain in our DB.
- **C-03 (good)** — First-party plugins for TOTP MFA, passkeys (WebAuthn), and OIDC client cover the full feature roadmap without third-party glue. OIDC client is confirmed in MVP scope (ADR-007).
- **C-04 (good)** — Sessions support both cookies and bearer tokens, keeping the mobile path open for ADR-003.
- **C-05 (good)** — Drizzle and Prisma adapters fit whichever ORM ADR-004 picks.
- **C-06 (bad)** — Younger and less battle-tested than Auth.js; smaller community, fewer worked examples online. Mitigation: pin a known-good version, write our own integration tests, and maintain an Auth.js-shaped escape hatch in our session middleware boundary so a future migration is a matter of re-implementing one module rather than threading a new auth library through the whole app.
- **C-07 (bad)** — The Better Auth API has shifted across 1.x; expect periodic upgrade work. Mitigation: pin a major version, watch CHANGELOG, schedule upgrade lanes.
- **C-08 (bad)** — The invite-token gate is custom code; it's small but it's *our* code to maintain (not the library's). Mitigation: design doc and integration tests cover the state machine explicitly.
- **C-09 (neutral)** — If the product later needs full enterprise IdP (SCIM, federated identity at scale), we'd front Better Auth with Keycloak or Ory rather than swap libraries. That's a future ADR, not a fork in the road today.

### Confirmation

- Walking-skeleton flow spec (`docs/flows/walking-skeleton.md`, pending) traces invite-token redemption → signup form (Active/Alumni picker) → email verification → first login.
- Integration test: an invite token cannot be redeemed past its expiry or after its use-cap is hit (whichever comes first).
- Integration test: an Admin's revocation of the active invite token immediately invalidates further redemptions.
- Integration test: the bootstrap-admin flow creates an Admin from `BOOTSTRAP_ADMIN_EMAIL` only on a database with zero existing Admins.
- Integration test: a Moderator or Admin cannot complete login (or perform any privileged action) without an enrolled MFA factor.
- Integration test: a non-Admin cannot promote any user (R-09 enforcement).
- Integration test: a passkey-enrolled user can log in without their password using only the passkey.
- Integration test: first OIDC SSO login from a valid `@{OIDC_HOSTED_DOMAIN}` email with no existing app account → Alumni account created, session established, no invite token consulted.
- Integration test: OIDC callback presenting a non-hosted-domain email → rejected server-side, no account created, no session established.
- Integration test: OIDC callback with a valid HD email where the account is marked deactivated by an Admin → OAuth succeeds at Google but app rejects the session.

## Pros and cons of the options

### Option A — Better Auth

TypeScript-native authentication library; self-hosted; plugin model; framework-agnostic but with strong Next.js support.

- Good — First-party plugins cover every primitive on our roadmap (email + password, verification, reset, TOTP MFA, passkeys, OIDC client).
- Good — Clean, typed API; agents produce idiomatic auth code with less coaching.
- Good — Self-hosted; no per-MAU fees; member-roster data stays in our DB.
- Good — Sessions support both cookies and bearer tokens — keeps the mobile path open.
- Good — Drizzle and Prisma adapters available out of the box.
- Bad — Younger than Auth.js; smaller community; fewer worked examples online.
- Bad — 1.x API has shifted; pin and plan upgrade lanes.
- Neutral — The invite-token gate is custom application code regardless of library choice.

### Option B — Auth.js (NextAuth)

The canonical Next.js auth library; mature; large ecosystem.

- Good — Battle-tested at scale; large community; copious tutorials and worked examples.
- Good — Deepest Next.js-native integration of any option.
- Good — Self-hosted; no per-MAU fees.
- Bad — TypeScript types are weaker than Better Auth's; agent productivity suffers slightly.
- Bad — MFA support is community-driven, not first-party — we'd glue together adapters and accept their maintenance burden.
- Bad — Passkey support is experimental at this point.
- Bad — Session/adapter model is opinionated; custom pre-signup gating typically means a hand-rolled endpoint that bypasses some of Auth.js's conveniences.

### Option C — Clerk

Hosted SaaS auth with polished UI primitives.

- Good — Best DX for getting auth running fast; pre-built UI components.
- Good — First-class MFA, passkeys, magic links.
- Good — Built-in invite/organization model — close to our flows out of the box.
- Bad — Per-MAU pricing scales painfully across many small fraternal-organization instances; cost grows with deploys.
- Bad — Hosted service is a third-party SPOF and a data-residency concern (member rosters are non-trivially sensitive).
- Bad — Vendor lock-in; migration off Clerk later is real work.

### Option D — Keycloak

Heavyweight self-hosted IdP; mature; standards-first.

- Good — Best-in-class OIDC / SAML / SCIM support.
- Good — Self-hosted; runs on K8s; could centralize all SSO eventually.
- Bad — A separate JVM service to operate — significant ops surface for an MVP.
- Bad — User-facing flows (signup, password reset, invite redemption) require theming and customization we'd otherwise get for free.
- Bad — Overkill for app-managed accounts day one; we'd run Keycloak just to consume features we don't need yet.

### Option E — Ory Kratos

Modular open-source identity service.

- Good — Self-hosted; K8s-native; clean architecture.
- Good — Strong on identity primitives (OIDC, MFA, passkeys).
- Bad — Significantly more integration work than Better Auth or Auth.js — Kratos is a *service*, not an in-process library.
- Bad — Smaller community than Keycloak; fewer worked examples for our shape of app.

### Option F — Roll our own (oslo + jose + argon2 + custom session table)

Compose primitives directly; own every line.

- Good — Zero dependency surprises; complete visibility.
- Bad — We become responsible for every CVE response and every primitive's correct use (PBKDF tuning, session fixation, CSRF, replay).
- Bad — Time to MVP balloons; subtle errors in auth code are catastrophic; the libraries above have absorbed the lessons we'd be re-learning.
- Bad — Recruits for the project would need to onboard onto a bespoke auth implementation — anti-productivity.

## More information

### Invite-token implementation (informative — design lives in `docs/design/auth.md`, pending)

- Tokens live in our own `invite_tokens` table (not Better Auth's tables): `id`, `token_hash` (random ≥ 32-byte secret hashed at rest), `created_at`, `expires_at`, `max_uses`, `used_count`, `revoked_at`, `created_by`.
- Per PRD-001 (post-discovery): one active token per instance at any time, with whichever-comes-first expiry on time-cap or use-cap. Admin rotation revokes the current token and issues a new one.
- The token can be redeemed two ways: a clickable URL (`/signup?invite=<token>`) or a typed code on the signup page. Both flows hit the same validation.
- The signup endpoint validates (`not revoked` ∧ `not expired` ∧ `used_count < max_uses`), atomically increments `used_count`, then delegates to Better Auth's signup. The increment + signup is a single transaction; either both happen or neither.

### Bootstrap-admin flow (informative)

- On app start: if `BOOTSTRAP_ADMIN_EMAIL` is set **and** the `users` table contains zero Admins, create an Admin record with that email and dispatch a Better-Auth password-reset link to it. After the bootstrap Admin completes setup, the env var is no longer load-bearing.
- The condition is "zero Admins ever," guarded by the DB state — restarting with the env var still set does not re-trigger if an Admin exists.

### MFA conditional enforcement (informative)

- Better Auth's `twoFactor` plugin supports per-user enrollment with TOTP and recovery codes.
- Conditional enforcement is application middleware: if `user.role ∈ {Moderator, Admin}` and the user has no enrolled MFA factor, redirect to the MFA-enrollment page before any privileged action proceeds. Admins escalating a user into a privileged role MUST trigger an enrollment requirement on that user's next session.

### Session strategy (informative)

- DB-backed sessions (Better Auth supports both DB and JWT; DB-backed is simpler to invalidate, important for role demotion and forced sign-out).
- HTTP-only Secure SameSite=Lax cookies on web. Bearer tokens for mobile (ADR-003).

### Links

- Better Auth: <https://www.better-auth.com/docs>
- Auth.js: <https://authjs.dev/>
- WebAuthn / Passkeys: <https://www.w3.org/TR/webauthn-3/>
- Keycloak: <https://www.keycloak.org/>
- Ory Kratos: <https://www.ory.sh/kratos/>

### Follow-ups this ADR implies

- **ADR-003** (API contract for mobile) — must accommodate Better Auth's session model (cookies for web; bearer tokens for native clients).
- **ADR-004** (DB + ORM) — informs the adapter choice (Drizzle vs. Prisma); both are first-party in Better Auth.
- **ADR-005** (Email provider) — verification + password reset + bootstrap-admin link delivery all depend on it.
- **ADR-007** (Google Workspace OIDC, Proposed) — captures the federation model: Better Auth OIDC client plugin, HD restriction at callback, per-instance env-var config, and MFA delegation to Workspace admin.
- **Future ADR** — if member-roster sensitivity grows (e.g., national-org compliance requirements), evaluate moving to Keycloak/Ory for SCIM and audit-grade IdP features.

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-06 | Tom Haynes | Initial draft. |
| 2026-05-14 | Tom Haynes | OIDC SSO promoted from post-MVP to MVP scope per confirmed product requirement. Updated context, decision outcome, C-03, and confirmation tests to reflect Google Workspace OIDC as in-scope. Linked ADR-007 (federation model) and PRD-003 (Identity & Access). |
