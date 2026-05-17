---
id: PRD-003
title: TODOs for Dues — Identity and Access
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
related:
  adrs: [ADR-002, ADR-007]    # auth library, Google Workspace OIDC federation model
  flows: []                   # docs/flows/walking-skeleton.md pending — will trace both signup paths
  designs: []                 # docs/design/auth.md pending — invite-token table, account-linking logic, SSO callback
  supersedes: null
---

## 1. Objective

> **Problem:** TODOs for Dues serves two user populations with fundamentally different identity provenances. Alumni at the launch chapter already have managed identities in Google Workspace (`@sigoalumni.org`); those accounts are tightly controlled and carry implicit membership authorization. Actives, and Alumni without Workspace accounts, have no such pre-existing credential — they need invite-gated app-managed accounts. A single, uniform signup flow cannot serve both without being either too open (no invite requirement) or unnecessarily burdensome (forcing Workspace members through a separate invite loop).
> **Audience:** Alumni, Actives, Moderators, Admins, and any future chapter instance operators.
> **Why now:** Both identity paths must be designed together before the auth design doc and walking skeleton can be finalized; retrofitting SSO later would require a schema change and a rewrite of the session middleware.
> **One-sentence definition of success:** Any user with a chapter-Workspace account can sign in via Google SSO with no friction, while users without one can sign up via invite link, and no account is ever created for someone outside both gates.

## 2. Background & context

- **PRD-001 R-01** — invite-link-based signup is the access-control gate for the platform. This PRD refines R-01: the invite gate applies only to the app-managed path. The OIDC SSO path substitutes Workspace membership as the gate.
- **PRD-001 R-10 / US-10** — elevated from P1 to P0. OIDC SSO is a hard MVP requirement for the launch chapter. See PRD-001 changelog.
- **ADR-002** — Better Auth is the chosen auth library. Its OIDC client plugin (or `genericOAuth` plugin) provides the client-side OAuth implementation. ADR-002 was updated to reflect SSO as MVP scope.
- **ADR-007** — captures the decision to use Better Auth's OIDC client with HD restriction (no new IdP service), per-instance env-var config, and delegation of SSO-user MFA to the Workspace admin. Read ADR-007 for the options analysis.
- The launch chapter (sigoalumni.org) already uses Google Workspace for other services (Outline wiki). The Workspace admin manages membership tightly — being in the Workspace is itself authorization to join the app as an Alumni.
- One instance of the SaaS is deployed per fraternal organization. Each instance has its own OIDC provider configuration (client ID, secret, hosted domain). Chapters without a Workspace IdP use app-managed accounts only.

## 3. Success metrics

| Metric | Type | Baseline | Target | How measured |
|--------|------|----------|--------|--------------|
| Unauthorized account creation rate | Quality | 0 | 0 incidents | Any account created without valid invite token or valid HD credential = incident |
| SSO sign-in success rate (valid HD users) | Quality | n/a | ≥ 99 % | OAuth callback success / attempt at steady state |
| Invite redemption completion rate | Quality | n/a | ≥ 95 % | Signup form completed / invite link clicked |
| SSO-only users blocked from app-managed path | Quality | n/a | 100 % | Non-HD address submitted at signup form → rejected before account creation |

## 4. Personas & user scenarios

### 4.1 Personas

Personas are defined in PRD-001 §4.1. Reproduced in brief for this PRD's scope:

- **Alumni (Workspace)** — has an `@sigoalumni.org` Google Workspace account managed by the chapter's IT Admin. Signs in via Google SSO.
- **Alumni (app-managed)** — an Alumni without a Workspace account (e.g., early adopter before the SSO was configured, or a chapter without Workspace). Signs up via invite link + email + password.
- **Active** — current undergraduate member. Does not have a Workspace account. Signs up via invite link + email + password.
- **Moderator / Admin** — either account path; role is conferred after first login by an existing Admin.
- **Instance operator** — deploys and configures the SaaS instance. Supplies OIDC provider env vars; bootstraps the first Admin.

### 4.2 Scenarios / user stories

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As an Alumni with an `@sigoalumni.org` Workspace account, I want to sign in via Google SSO without an invite token, so that I don't manage a separate credential. | P0 |
| US-02 | As a new user without a Workspace account, I want to sign up with email + password after clicking an invite link, so that I can access the platform. | P0 |
| US-03 | As an instance operator, I want the SSO provider (client ID, secret, hosted domain) configured via env vars, so that deploying a new chapter instance requires no code change. | P0 |
| US-04 | As an Admin, I want to be able to deactivate or change the role of any account regardless of whether it was created via SSO or app-managed signup, so that I can govern the instance uniformly. | P0 |
| US-05 | As a non-Workspace-member, I want to be clearly told that I don't have access via Google sign-in, so that I know to use the invite link instead (or contact an Admin). | P1 |

## 5. Requirements

| ID | Requirement | Priority | Linked stories | Notes |
|----|-------------|----------|----------------|-------|
| R-01 | The system shall support two account paths: (a) **OIDC SSO** for users whose email matches the instance-configured hosted domain, authenticated via Google Workspace OAuth; (b) **app-managed** (email + password, with optional MFA) for all other users. | P0 | US-01, US-02 | Both paths must coexist on the same instance. |
| R-02 | App-managed signup shall require a valid, unexpired, unrevoked invite token (per PRD-001 R-01 and ADR-002). The SSO path shall NOT require an invite token. | P0 | US-01, US-02 | Workspace membership is the authorization signal for SSO users. |
| R-03 | First OIDC SSO login from a valid hosted-domain user shall automatically create an app account with role = Alumni. No Admin action is required to activate the account. | P0 | US-01 | Role is set to Alumni; escalation to Moderator or Admin requires an Admin action per R-07. |
| R-04 | The SSO path shall enforce hosted-domain restriction. An OAuth callback presenting a non-hosted-domain email shall be rejected server-side before any session is created, and no account shall be created. | P0 | US-05 | The HD check is application-level (callback), not Google-side. This is a security guarantee, not a UX one — the user may see a Google consent screen before rejection. |
| R-05 | Per-instance OIDC provider configuration (client ID, client secret, hosted domain) shall be supplied as environment variables. No code change shall be required to configure or swap the IdP for a given instance. | P0 | US-03 | A chapter without OIDC env vars configured operates in app-managed-only mode. |
| R-06 | MFA enforcement for SSO-authenticated sessions in privileged roles (Moderator, Admin) shall be delegated to the Workspace admin. The app shall not enforce app-level MFA (TOTP / passkey) for SSO sessions. MFA enforcement via app-managed factors continues to apply to app-managed users in privileged roles (per ADR-002). | P0 | US-01 | See Q-03. Workspace admin must enable Workspace-level MFA for privileged Workspace users — this is a chapter-admin setup concern, not an app constraint. |
| R-07 | Role escalation (Active → Moderator, any role → Admin) shall require an explicit Admin action regardless of account path. Neither SSO first-login nor invite redemption grants a privileged role. | P0 | US-04 | Consistent with PRD-001 R-02 and R-09. |
| R-08 | Admins shall be able to deactivate or reassign the role of any account regardless of whether it was created via SSO or app-managed signup. | P0 | US-04 | Deactivation blocks login; it does not delete the account or its history. |
| R-09 | When a user signs in via Google SSO and an app-managed account already exists with the same email address, the system shall automatically link the SSO credential to the existing account rather than creating a duplicate. | P0 | US-01 | Merge is by email, automatic, no Admin action required. Exact linking semantics (session history, which credential takes precedence) belong in the auth design doc. Better Auth's account-linking feature is the implementation path. |
| R-10 | At account creation (app-managed signup form) or first SSO sign-in, the system shall require a display name (text, ≥ 1 non-whitespace char) and persist it on the User row. The display name is used by PRD-004 R-05 (job roster visibility), PRD-005 R-07 (treasurer email line items), PRD-007 R-06 (audit-log actor rendering), and PRD-008 R-08 / R-10 (role-change history). | P0 | US-01, US-02 | App-managed signup: required field on the signup form. SSO first-login: prefilled from the OIDC `name` / `given_name` claim where available, with a one-step confirm screen if absent or empty. Display name is editable post-signup (TBD which surface owns the editor; not blocking MVP). Stored as `users.display_name NOT NULL` per DESIGN-001 §4.2. |
| R-11 | When an Admin submits a request to mint an invite token specifying a preselected non-privileged role (Active or Alumni), the system shall persist a row in `invite_tokens` with a securely-generated random `token` value (URL-safe, ≥ 128 bits of entropy), `preselected_role` set to the requested role, `created_by` set to the Admin's user id, and return the token string to the caller for distribution. | P0 | US-02 | Backs R-02 by giving Admins a first-class way to mint tokens without raw SQL. Token format: URL-safe (base64url of 16+ random bytes is the lean). The CHECK constraint `invite_tokens_role_non_privileged` on `invite_tokens.preselected_role` blocks any attempt to mint a Moderator/Admin invite. |
| R-12 | The system shall expose to Admins a list of outstanding invite tokens (`revoked_at IS NULL`) ordered most-recent-first, showing each token's preselected role, creation timestamp, the display name of the Admin who minted it, and an action affordance to revoke or copy the signup URL. The list shall NOT include revoked tokens by default. | P0 | US-02 | Admin-only visibility — non-Admins must not be able to enumerate tokens (privileged data). Includes a "copy URL" affordance using the URL form `<base>/signup?token=<token>` (matches `apps/web/app/signup/page.tsx`'s existing param parsing). |
| R-13 | When an Admin submits a request to revoke an outstanding invite token, the system shall set the token's `revoked_at` to the current timestamp; subsequent attempts to redeem the token shall be rejected per R-02 with the existing "Invite link is invalid or has been revoked" error. | P0 | US-02 | One-way operation; no un-revoke. To restart, Admin mints a fresh token. |
| R-14 | Upon successful signup that consumed an invite token, the system shall set that token's `revoked_at` to the current timestamp atomically with the user-account creation, so the token cannot be reused by a subsequent signup. Tokens are single-use. | P0 | US-02 | Closes a security hole: prior to R-14 the signup action verified the token but never marked it consumed, so a single URL could be redeemed by an unlimited number of users. The atomicity requirement (single transaction) avoids a race where two concurrent signups both observe `revoked_at IS NULL` and both succeed; an `UPDATE … WHERE revoked_at IS NULL` + row-count check is sufficient. If the UPDATE affects zero rows the second signup is rejected with the revoked error. |

### 5.1 Acceptance criteria

- **AC-01** — covers R-01, R-02, R-03
  - **Given** an `@sigoalumni.org` user exists in the configured Workspace and has no existing app account
  - **When** they complete the Google OAuth flow via the SSO sign-in button
  - **Then** an app account is created with role = Alumni, a session is established, and no invite token was consulted

- **AC-02** — covers R-04
  - **Given** a user with a non-hosted-domain Google account (e.g., `user@gmail.com`)
  - **When** they complete the Google OAuth flow and the callback is processed
  - **Then** the callback rejects the credential, no account is created, no session is established, and the user receives an error indicating they are not authorized

- **AC-03** — covers R-02
  - **Given** a user without a hosted-domain email attempts to access the signup form
  - **When** they submit the form without a valid invite token
  - **Then** signup is rejected before account creation; the user is directed to obtain an invite link

- **AC-04** — covers R-05
  - **Given** the instance has `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_HOSTED_DOMAIN` set
  - **When** an `@{configured-domain}` user signs in
  - **Then** SSO login succeeds; the HD restriction uses the configured domain value

- **AC-05** — covers R-05 (negative — no OIDC config)
  - **Given** the instance has no OIDC env vars configured
  - **When** a user visits the sign-in page
  - **Then** no SSO option is presented; the app-managed path is the only sign-in method

- **AC-06** — covers R-07
  - **Given** an SSO-authenticated Alumni has just signed in for the first time
  - **When** their session is established
  - **Then** their role is Alumni; no Moderator or Admin capabilities are accessible until an Admin escalates them

- **AC-07** — covers R-08
  - **Given** an Admin deactivates a SSO-created Alumni account
  - **When** that user attempts to sign in via Google SSO
  - **Then** the OAuth callback succeeds at Google, but the app rejects the session because the account is deactivated

- **AC-08** — covers R-10 (app-managed signup)
  - **Given** a user is on the signup form with a valid invite token
  - **When** they submit without a display name (empty / whitespace-only)
  - **Then** signup is rejected with a validation error citing the display-name field; no account is created.

- **AC-09** — covers R-10 (SSO first-login with no name claim)
  - **Given** a hosted-domain user completes Google OAuth and Google returns no `name` / `given_name` claim
  - **When** the OIDC callback runs
  - **Then** the user is shown a one-step "What should we call you?" form before the session is established; submitting a non-empty value persists `users.display_name` and creates the session.

- **AC-10** — covers R-11 (mint invite)
  - **Given** Admin A is logged in
  - **When** A submits a mint request specifying preselected role `Active`
  - **Then** a new `invite_tokens` row exists with `preselected_role: Active`, `created_by: A.id`, `revoked_at: NULL`, a populated `token`, and the caller receives the token string back. Mint with role `Moderator` or `Admin` is rejected at the DB layer by the `invite_tokens_role_non_privileged` CHECK constraint (the procedure should refuse before the DB call as an early guard).

- **AC-11** — covers R-12 (list outstanding)
  - **Given** the DB has 3 outstanding invites + 1 revoked invite + 1 redeemed invite (revoked-after-signup per R-14)
  - **When** Admin A views the invites list
  - **Then** exactly the 3 outstanding rows appear, ordered `created_at DESC`, with each row showing role + creation time + minter display name + signup-URL + revoke action. The 2 non-outstanding rows are absent.

- **AC-12** — covers R-13 (revoke)
  - **Given** an outstanding invite token T
  - **When** Admin A revokes T via the UI
  - **Then** T's `revoked_at` is set to now; a subsequent `GET /signup?token=<T>` shows the existing "Invite link is invalid or has been revoked" error from `verifyInviteToken`; the row no longer appears in the outstanding list.

- **AC-13** — covers R-14 (single-use redemption)
  - **Given** an outstanding invite token T
  - **When** user U1 successfully signs up with T
  - **Then** T's `revoked_at` is set to now atomically with U1's account creation; a second user U2 attempting signup with T receives the revoked error and no account is created for U2.

## 6. User experience

- Mocks: pending
- Flow spec: `docs/flows/walking-skeleton.md` (pending) — will trace both the invite-token + app-managed path and the SSO first-login path
- UX rules:
  - The sign-in page shows a "Sign in with Google" button only when `OIDC_HOSTED_DOMAIN` is configured. If not configured, the button is absent — not grayed out.
  - A non-HD user who completes the Google OAuth flow and is rejected should see a clear, human-readable message: "Your Google account is not associated with this chapter. Use an invite link to sign up, or contact your chapter Admin." Not a raw HTTP error.
  - First-time SSO users who land in the app with role = Alumni see the Alumni default view, not a blank onboarding page. (Welcome / onboarding state is a UX concern for the MVP design; this PRD only specifies the account is created with a valid role.)

## 7. Non-goals (explicitly not doing)

- The app **does not** manage Google Workspace accounts — it cannot create, modify, or delete Workspace users.
- The app **does not** support SAML or other IdP protocols; Google OAuth / OIDC is the only SSO path in MVP.
- The app **does not** automatically deactivate accounts when a user is removed from the Workspace (see Q-02). Manual Admin deactivation is the mechanism.
- The app **does not** expose an Admin UI for OIDC configuration; configuration is env-var only.
- The app **does not** provide SCIM synchronization with the Workspace in MVP.

## 8. Assumptions & dependencies

- **Assumption:** Alumni are the only users with Workspace accounts; Actives do not have `@sigoalumni.org` credentials. — *if false:* R-03's "first SSO login → Alumni" default breaks and a role-picker on first login may be needed.
- **Assumption:** The Workspace admin enforces Workspace-level MFA for accounts that will hold Moderator or Admin roles in the app. — *if false:* R-06 must be revised: the app must enforce app-level MFA even for SSO sessions, which requires additional Better Auth integration.
- **Assumption:** The per-instance env-var config approach scales to the chapter count we anticipate. — *if false:* move OIDC config to the DB and build an Admin UI (post-MVP).
- **Depends on:** ADR-002 (Better Auth — chosen auth library).
- **Depends on:** ADR-007 (Google Workspace OIDC — federation model and HD restriction decision).
- **Depends on:** PRD-001 R-01 (invite-token model — still fully applies to the app-managed path).

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | ~~**Account linking**~~ — **Resolved.** Same email = same account; SSO credential is automatically linked to the existing app-managed account on first SSO sign-in. No duplicate account is created, no Admin action required. Captured as R-09. Detail in the auth design doc. | — | — |
| Q-02 | **Workspace-revoked users** — when someone leaves the Workspace, the app account is not automatically deactivated. Is manual Admin deactivation the accepted procedure, or do we need a lightweight webhook or periodic sync? Lean: manual Admin action for MVP; SCIM or a Workspace-admin-notified runbook step post-MVP. | Product | Before launch |
| Q-03 | **MFA for SSO-using privileged accounts** — R-06 delegates MFA to the Workspace admin. Should the app still emit a warning or gate access if it cannot verify the SSO session had MFA? Lean: no app-level verification; documented requirement in the chapter-admin setup checklist. | Product / Security | Before launch |
| Q-04 | **Generic Workspace OIDC for all instances** — is the per-instance env-var mechanism available to any chapter instance, or is Google Workspace the only supported IdP? Lean: generic mechanism — any OIDC-compliant provider can be configured the same way; Google Workspace happens to be the first consumer. If confirmed, this should be reflected in the env var naming (e.g., `OIDC_HOSTED_DOMAIN` is Google-specific; a generic provider might not have an HD concept). | Product / Design | Before design doc |

## 10. Release plan

- **Phasing:**
  1. Walking skeleton — app-managed accounts only (invite token + email + password + email verification). OIDC env vars are optional and have no effect if absent.
  2. MVP — Google Workspace OIDC SSO activated for the launch chapter (`@sigoalumni.org`). Both account paths available and tested.
  3. Post-MVP — SCIM sync for automated deactivation on Workspace offboarding (if chapter admins require it).
- **Rollout:** OIDC config is an env-var change; it can be enabled for the launch-chapter instance without redeploying code.
- **Reversibility:** Removing the OIDC env vars disables the SSO button with no data loss. SSO-created accounts fall back to the "account inactive" state and Admin can issue app-managed credentials if needed.

## 11. Glossary alignment

New terms introduced by this PRD for `docs/domain/glossary.md`:

- **OIDC SSO** — sign-in via an OpenID Connect / OAuth provider configured per-instance. Google Workspace is the first-party implementation.
- **Hosted domain (HD)** — Google's term for a Workspace-managed email domain. The app uses HD restriction to limit OIDC sign-in to members of the chapter's Workspace.
- **App-managed account** — an account whose credentials (email + password, optional MFA factors) are stored and managed by the app itself, created via the invite-token-gated signup flow.
- **Account path** — one of the two creation / authentication routes: OIDC SSO or app-managed.

## 12. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Reflects confirmed product decision: Workspace membership is sufficient authorization for SSO users; invite token required for app-managed only. OIDC SSO promoted to P0 / MVP scope. |
| 2026-05-14 | Tom Haynes | Resolved Q-01 (account linking): same email = automatic link, no duplicate account, no Admin action. Added R-09. |
| 2026-05-14 | Tom Haynes | Added R-10 (display-name capture) + AC-08 (app-managed signup validation) + AC-09 (SSO fallback prompt). Closes the gap where every downstream PRD (004 / 005 / 007 / 008) and DESIGN-001 §4.2 assumed `users.display_name NOT NULL` without any PRD-003 R-NN owning the capture flow. |
| 2026-05-17 | Tom Haynes | Added R-11..R-14 + AC-10..AC-13 for Admin-side invite-token management. Closes the gap surfaced post-PLAN-012 deploy: invite-token DB / verify / signup-consumption infrastructure existed since PLAN-002/004, but no Admin UI to mint, list, or revoke tokens — chapter Admins had to issue raw SQL to onboard non-SSO members. R-14 also fixes a latent security bug in the signup action: tokens were verified but never marked consumed, so a single URL could be redeemed an unlimited number of times. Paired implementation: PLAN-014. |
