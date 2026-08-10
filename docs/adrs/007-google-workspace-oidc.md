---
id: ADR-007
title: Use Better Auth OIDC client with hosted-domain restriction for Google Workspace SSO
status: Superseded by ADR-013
date: 2026-05-14
deciders: [Tom Haynes]
consulted: []
informed: []
related:
  prds: [PRD-001, PRD-003]
  adrs: [ADR-002]              # Better Auth — the auth library this decision builds on
  flows: []                   # docs/flows/walking-skeleton.md pending
  designs: []                 # docs/design/auth.md pending — SSO callback, account-linking logic
  supersedes: null
  superseded_by: ADR-013
---

## Context and problem statement

PRD-003 R-01 through R-05 require that TODOs for Dues support a Google Workspace OIDC SSO path alongside app-managed accounts. The launch chapter (`sigoalumni.org`) already operates a Google Workspace whose membership is tightly controlled by the chapter's IT Admin; being in the Workspace is sufficient authorization to join the app as an Alumni (PRD-003 R-02, R-03). ADR-002 chose Better Auth as the auth library and noted a future SSO ADR; this ADR is that decision.

The question is: given Better Auth is already in place, how do we wire up the Workspace IdP — specifically, which integration model (in-process plugin vs. dedicated IdP service) and how do we enforce that only Workspace members can use the SSO path?

## Decision drivers

1. **Workspace membership = authorization** — the HD-restriction check is the entire access gate for SSO users; it must be reliable and enforced server-side regardless of how the OAuth flow is initiated.
2. **Reuse Better Auth (ADR-002)** — introducing a separate IdP service (Keycloak, Authentik) before MVP adds operational surface with no proportionate benefit.
3. **Per-instance configurability** — each chapter instance may have its own Workspace domain. The solution must require only env-var changes to configure a new instance; no code change.
4. **No new service to operate** — K8s deployments are self-managed (ADR-006); every additional workload is maintenance burden at chapter scale.
5. **Forward-compatible** — the chosen model should not block a future move to a dedicated IdP if enterprise SSO (SAML, SCIM) is eventually needed.

## Considered options

- **Option A** — Better Auth `genericOAuth` / OIDC-client plugin, HD-restricted at application callback (per-instance env vars)
- **Option B** — Keycloak as a centralized IdP, fronting Better Auth
- **Option C** — Authentik per-instance, fronting Better Auth
- **Option D** — Firebase Authentication (Google's hosted IdP management service)

## Decision outcome

**Chosen option:** **Option A — Better Auth OIDC client plugin, HD-restricted at the OAuth callback.**

Better Auth's `genericOAuth` plugin (or its OIDC-client equivalent) handles the client-side OAuth flow — redirect, callback, token exchange, and user-info fetch — as in-process application code. The HD check (`id_token.hd === process.env.OIDC_HOSTED_DOMAIN`) is applied at the callback before any session is created; a mismatch is rejected server-side and no account is touched. Per-instance config is three env vars (`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_HOSTED_DOMAIN`); absent vars disable the SSO path silently. The integration sits entirely within the existing Better Auth session model (ADR-002), keeps the deployment footprint flat, and can be toggled per-instance without a code change.

Keycloak and Authentik are credible for orgs with mature SSO/SCIM needs, but both introduce a separate service to operate before any such need exists. Firebase Authentication is rejected: hosted lock-in, per-MAU pricing concern at scale, and member-roster data leaving our infrastructure without proportionate benefit.

### Consequences

- **C-01 (good)** — No new service or sidecar; the OIDC integration is in-process Better Auth code. Deployment surface stays flat.
- **C-02 (good)** — Per-instance HD config via three env vars; onboarding a new chapter with a different Workspace domain is a config-only operation.
- **C-03 (good)** — Workspace admin's existing user-lifecycle management (onboard, offboard, MFA enforcement) applies without any app-side synchronization.
- **C-04 (good)** — The SSO path shares the same Better Auth session model as the app-managed path; role escalation, session invalidation, and Admin deactivation work uniformly across both paths.
- **C-05 (bad)** — HD restriction is enforced at the application callback, not at Google's OAuth consent screen. A non-HD user can initiate the OAuth flow and will see a Google consent page before being rejected. This is UX friction, not a security gap — the session is created only after the callback check passes server-side.
- **C-06 (bad)** — When a user is offboarded from the Workspace, their app account is not automatically deactivated. Manual Admin action is required until a SCIM integration is added. Mitigation: documented in the chapter-admin setup checklist and in the ops runbook.
- **C-07 (neutral)** — MFA enforcement for SSO-authenticated Moderators/Admins is delegated to the Workspace admin. The app does not enforce app-level MFA (TOTP/passkey) for SSO sessions. This must be an explicit chapter-admin prerequisite: Workspace-level MFA must be enforced for accounts that will hold privileged roles. If that assumption breaks (Q-03 in PRD-003), this consequence becomes a C-07 (bad) and R-06 must be revised.
- **C-08 (neutral)** — If a chapter later needs SAML, SCIM, or enterprise-grade IdP features, Keycloak or Ory can be fronted without replacing Better Auth — the same migration path identified in ADR-002 C-09.

### Confirmation

- Integration test: first OIDC SSO login from a valid `@{OIDC_HOSTED_DOMAIN}` email that has no existing app account → an Alumni account is created, a session is established, no invite token consulted.
- Integration test: OIDC callback with a non-hosted-domain email (e.g., `@gmail.com`) → callback rejected, no account created, no session established, HTTP 4xx returned.
- Integration test: OIDC callback with a valid HD email where the app account is marked deactivated → callback token is valid, but the app rejects the session (account inactive check).
- Integration test: instance with no OIDC env vars configured → sign-in page renders no SSO option; attempting the OAuth route directly returns an appropriate error.
- Integration test: changing `OIDC_HOSTED_DOMAIN` env var and restarting → sign-in accepts only the new domain, rejects the old one.

## Pros and cons of the options

### Option A — Better Auth OIDC client plugin + HD check at callback

In-process OAuth client using Better Auth's `genericOAuth` plugin. Google is configured as the provider with `hd` (hosted domain) verification at the callback. Three env vars per instance. No additional process.

- Good — Zero new services; flat deployment footprint.
- Good — Per-instance HD config; no code change for new chapters.
- Good — Workspace user-lifecycle stays entirely with the Workspace admin.
- Good — Shares the existing Better Auth session model; Admin tools (deactivate, role-change) work uniformly.
- Bad — HD restriction fires at the callback, not at Google's consent screen; minor UX degradation for non-HD users who start the flow.
- Bad — No automatic offboarding when Workspace access is revoked.
- Neutral — MFA delegation to Workspace admin must be a documented chapter-admin prerequisite.

### Option B — Keycloak as a centralized IdP (fronting Better Auth)

Keycloak handles Workspace federation and issues tokens; Better Auth consumes Keycloak as its OIDC provider. All instances could share one Keycloak deployment, or each chapter gets its own realm.

- Good — Best-in-class OIDC / SAML / SCIM support; future-proof for enterprise IdP needs.
- Good — HD restriction and user-sync can be configured in Keycloak's identity provider settings.
- Bad — A new JVM service to deploy, upgrade, and operate before any of its enterprise features are needed.
- Bad — Adds per-chapter realm management or a centralized multi-tenant Keycloak — significant ops complexity at MVP.
- Bad — OIDC token chain is deeper (app → Keycloak → Google), which complicates debugging.

### Option C — Authentik per-instance (fronting Better Auth)

Authentik is a self-hosted identity provider, K8s-native, that can federate Google Workspace and issue OIDC tokens to Better Auth.

- Good — Self-hosted, K8s-native; fits the ADR-006 deployment model.
- Good — Admin UI for IdP configuration — no env-var management.
- Bad — Another service per instance (or a shared multi-tenant Authentik); ops burden before any feature warrant.
- Bad — Smaller community than Keycloak; fewer worked examples for our shape of app.
- Neutral — Could be introduced later if Admin-UI-driven OIDC configuration becomes necessary.

### Option D — Firebase Authentication

Google's hosted auth service; supports Google Sign-In with HD restriction natively.

- Good — HD restriction configurable at the Firebase console; no application-level HD check needed.
- Good — Google manages MFA for Workspace users natively.
- Bad — Hosted SaaS; member-roster data leaves our infrastructure.
- Bad — Per-MAU cost concern at chapter scale across many instances.
- Bad — Vendor lock-in; migrating off Firebase Auth requires rewriting the session layer.
- Bad — Redundant with Better Auth already chosen in ADR-002.

## More information

- PRD-003 §9 open questions Q-01 through Q-04 are relevant follow-up decisions (account linking, offboarding, MFA delegation, generic IdP support).
- The Outline wiki at `sigoalumni.org` uses the same Workspace IdP via Google OAuth (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Docker Compose). The pattern is well-understood for this org. Reference: `/Users/thaynes/src/projects/sigo-alumni/apps/Outline/compose/.env.example`.
- Better Auth `genericOAuth` plugin docs: <https://www.better-auth.com/docs/plugins/generic-oauth>
- Google OIDC hosted-domain (`hd`) parameter: <https://developers.google.com/identity/openid-connect/openid-connect#hd-param>

### Follow-ups this ADR implies

- **`docs/design/auth.md`** (pending) — must specify: the HD-check implementation, account-linking logic (PRD-003 Q-01), and the env-var schema (`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_HOSTED_DOMAIN` — or renamed if a generic multi-provider model is adopted per PRD-003 Q-04).
- **Chapter-admin setup checklist** (ops runbook, pending) — must include: enable Workspace-level MFA for any Workspace users who will hold Moderator or Admin roles; procedure for deactivating app accounts on Workspace offboarding.

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Follows confirmed product decision (PRD-003): Workspace membership sufficient authorization; invite token not required for SSO path. |
