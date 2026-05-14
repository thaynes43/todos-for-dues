---
id: BCC-01
title: Identity & Access
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
related:
  prds: [PRD-001, PRD-003]
  adrs: [ADR-002, ADR-007, ADR-011]
  aggregates: [ADC-02]                                # ADC-02 User
  bounded_contexts: [BCC-02, BCC-03]                  # BCC-02 + BCC-03 are downstream consumers
  flows: []
  supersedes: null
---

## 1. Name

**Identity & Access**

## 2. Purpose

Authenticates users and establishes session context (user identity + role at the moment of session creation). Handles two signup paths — invite-link app-managed accounts and Workspace OIDC SSO — and produces a stable session contract that downstream contexts (BCC-02 Job Lifecycle, BCC-03 Role Management, the Admin View UI) consume on every request. **Primary value:** a trusted "who is this?" + "what role do they have?" answer on every authenticated request, with no surprises from the chapter or the IdP.

## 3. Strategic classification

| Dimension | Value | Justification |
|-----------|-------|---------------|
| Importance | **Generic** | Authentication, session, OIDC SSO, and invite-token signup are universal patterns served by stable off-the-shelf libraries (Better Auth + its Workspace OIDC plugin). We are not building anything novel here; the value is in *correct* identity, not differentiated identity. |
| Business model role | Compliance enforcer | HD restriction (workspace-domain users only), invite-token validation, account-uniqueness enforcement — all are correctness/compliance properties, not engagement drivers. |
| Evolution stage (Wardley) | **Product** | Better Auth is a maturing product; Workspace is a commodity. We sit on top of both. |

## 4. Domain roles (model traits)

- [x] **Gateway** — manages the boundary between the app and Workspace OIDC. Translates external OAuth claims into our user shape.
- [x] **Gateway Interchange** — translates between the IdP's identity vocabulary (subject, hosted domain, claims) and our domain's vocabulary (User, Role, Session).
- [x] **Enforcer** — HD restriction at the OAuth callback, invite-token validity, email uniqueness.
- [ ] Specification, Execution, Approver, Audit, Octopus Enforcer, Bubble, Brain, Funnel, Engagement, Dogfood — none apply.

## 5. Ubiquitous language (this context)

| Term | Meaning in this context | T-NN (glossary) |
|------|-------------------------|------------------|
| User | A chapter member with stable identity (id, email, display name) and a role. Owned by ADC-02. | (project-wide; no T-NN) |
| Account | The full set of authentication artifacts for a User: password hash (app-managed) and/or OIDC linkage (SSO). | (new — local to BCC-01) |
| Session | The short-lived authenticated context returned by Better Auth, carrying user_id + role. | (new — local) |
| Invite Token | A single-use credential gating app-managed signup, scoped to a chapter and to one role (Active or Alumni). | (new — local) |
| Hosted Domain (HD) | The Google Workspace domain (e.g., `sigoalumni.org`) that gates SSO eligibility. | (new — local) |
| Workspace OIDC | Google Workspace as the identity provider for SSO, accessed via Better Auth's OIDC client plugin. | (new — local) |
| Bootstrap Admin | The user identified by `BOOTSTRAP_ADMIN_EMAIL` env var, auto-promoted to Admin role on next login. | (new — local) |

## 6. Business decisions (key rules and policies)

| ID | Rule / Policy | Source |
|----|---------------|--------|
| BR-01 | Workspace OIDC users bypass invite tokens — Workspace membership is sufficient authorization. | PRD-003 R-01 (b); ADR-007 |
| BR-02 | App-managed signups (email + password) require a valid invite token. | PRD-003 R-01 (a) |
| BR-03 | Same email = same account. SSO sign-in for an existing app-managed email auto-links the OIDC provider to the existing account (no duplicate user row). | PRD-003 R-09 |
| BR-04 | HD restriction is enforced server-side at the OAuth callback. Non-HD users are rejected before any session is created. | PRD-003 R-04; ADR-007 |
| BR-05 | `BOOTSTRAP_ADMIN_EMAIL` env var, when set, promotes the named user to Admin on next login (recovery path). | ADR-002 |
| BR-06 | Invite tokens are scoped per chapter and per non-privileged role (Active or Alumni); the link pre-selects the role at signup. | PRD-001 R-01; PRD-003 |
| BR-07 | Privileged roles (Moderator, Admin) are NEVER granted at signup — only by an existing Admin via BCC-03. | PRD-001 R-02; PRD-003 |
| BR-08 | OIDC client config (`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_HOSTED_DOMAIN`) lives in env vars, not in the DB. Pre-auth chicken-and-egg. | ADR-007; ADR-010 |

## 7. Inbound communication

### 7.1 Commands handled

| ID | Command | From (collaborator) | Triggers event(s) |
|----|---------|---------------------|-------------------|
| CMD-01 | SignupWithInviteToken(token, email, password, display_name) | Active or Alumni clicking invite link | EVT-01 UserCreated |
| CMD-02 | SignInWithWorkspace(oidc_callback_payload) | Alumni clicking "Sign in with Google" | EVT-01 UserCreated (if first time) **OR** EVT-02 UserLinkedToSSO (if linking) **OR** session-only (if returning) |
| CMD-03 | SignIn(email, password) | App-managed user | session-only |
| CMD-04 | SignOut() | Any authenticated user | session-only |
| CMD-05 | RequestPasswordReset(email) | App-managed user | EVT-03 PasswordResetRequested (Better Auth handles email send) |
| CMD-06 | CompletePasswordReset(token, new_password) | App-managed user | session-only |

### 7.2 Queries handled

| ID | Query | From | Returns |
|----|-------|------|---------|
| Q-01 | GetSession() | Every authenticated request from BCC-02, BCC-03, the Admin view UI | `{user_id, role, display_name, ...}` or unauthenticated |
| Q-02 | GetUserById(user_id) | BCC-02 (for roster + audit-log display) | `{id, display_name, email, role}` |
| Q-03 | GetUserByEmail(email) | BCC-03 (for Admin role-grant by email lookup), Bootstrap-Admin promotion | User or null |

### 7.3 Events consumed

None in MVP. (No event bus.)

## 8. Outbound communication

### 8.1 Commands issued

| ID | Command | To (collaborator) | When |
|----|---------|-------------------|------|
| CMD-OUT-01 | (via Better Auth internals) ExchangeOIDCCode | Google Workspace OIDC | During CMD-02 SignInWithWorkspace |
| CMD-OUT-02 | (via Better Auth internals) SendPasswordResetEmail | Notifications adapter / Resend | During CMD-05 RequestPasswordReset |

### 8.2 Queries issued

None across context boundaries. (Internal queries to Better Auth's user table happen within this context.)

### 8.3 Events published

For MVP, no event bus. Conceptually:
- EVT-01 UserCreated
- EVT-02 UserLinkedToSSO
- EVT-03 PasswordResetRequested
- EVT-04 UserDeactivated (deferred — out of MVP per PRD-003 §8 / Q-02)

These are useful as design vocabulary; not pub-sub in MVP.

## 9. Aggregates owned

| ADC ID | Aggregate | Notes |
|--------|-----------|-------|
| ADC-02 | **User** | Identity + auth fields + the `role` column (set at signup by this context; mutated post-signup by BCC-03). See `aggregates/002-user-aggregate-canvas.md` *(pending)*. |

The `role` column is shared with BCC-03 — see §10 dependencies for how this is modelled.

## 10. Dependencies

| Dependency | Type | Relationship pattern | Notes |
|------------|------|----------------------|-------|
| Better Auth | external library | **Conformist** | We use Better Auth's user / session / OIDC-client APIs as-is. No translation layer. ADR-002 + ADR-007. |
| Google Workspace OIDC | external IdP | **Conformist + ACL** | Workspace is the upstream we conform to (OAuth code flow). The Better Auth OIDC client plugin acts as our ACL — translates claims into our session payload. ADR-007. |
| BCC-03 Role Management | bounded context (downstream-of-us in some flows, peer in others) | **Shared Kernel** | Both contexts mutate the same `users.role` column. BCC-01 sets it at signup; BCC-03 mutates it post-signup. The shared kernel is the role enum + the `isPrivileged()` helper + the deferred-CHECK trigger from ADR-011. |
| Notifications adapter | shared infra | n/a | Used internally by Better Auth for password-reset emails. |
| Postgres + Drizzle | technology | n/a | ADR-004. |

## 11. Assumptions

- **Assumption:** Better Auth's session shape is stable across upgrades. — *if false:* tighten the session-payload shape via a typed wrapper.
- **Assumption:** Google Workspace OIDC is reliably available; our app degrades gracefully (showing only the app-managed signin path) when SSO is misconfigured. — *if false:* improve fallback UX.
- **Assumption:** Single-chapter instance — no cross-chapter user identity or federated sign-on. — *if false:* multi-tenancy refactor is significant; out of MVP scope.
- **Assumption:** Display name is collected at signup (app-managed) or from Workspace claims (SSO). All downstream contexts assume non-null display_name. — *if false:* coordinate fallback with BCC-02 / BCC-03 to render emails.

## 12. Verification metrics

| Metric | Source | Target |
|--------|--------|--------|
| Signup-completion rate (app-managed): users who land on signup form → successfully sign up | application logs | ≥ 90% (low for an MVP — friction is fine, but token failures should be rare) |
| Workspace SSO callback success rate | application logs | ≥ 99% (HD-restricted rejections are expected; "wrong domain" should be a *clean* 4xx, not a 5xx) |
| Account-linking success rate (first SSO of existing app-managed user) | application logs + `user_role_transitions` | 100% — any failure here is a duplicate-account bug |
| Auth-related 5xx rate | application logs | < 0.1% |

## 13. Open questions

| ID | Question | Owner | Needed by |
|----|----------|-------|-----------|
| Q-CTX-01 | What's the deactivation flow when a Workspace user leaves the org? Lean: **manual Admin deactivation for MVP** (PRD-003 Q-02). SCIM auto-sync deferred post-MVP. | Product | Before launch |
| Q-CTX-02 | Should the OIDC mechanism be generic (any OIDC provider) or Google-Workspace-specific? Lean: **generic with HD restriction parameterised** — rename env vars to `OIDC_*` (already done in ADR-007). | Product | Before second-chapter onboarding |
| Q-CTX-03 | When `BOOTSTRAP_ADMIN_EMAIL` promotes a user, should the audit log row attribute it to `actor_kind: system` with `initiator_id: NULL`? **Confirmed** in ADR-011 / PRD-008 R-07 example. (Question kept here for cross-doc traceability.) | — | ✅ Resolved per ADR-011 |

## 14. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Generic identity context wrapping Better Auth + Workspace OIDC. 8 business rules, 6 commands, 3 queries, 4 conceptual events. Conformist relationship to Better Auth + Workspace; Shared Kernel with BCC-03 on the `users.role` column. |
