---
id: ADC-02
title: User
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
related:
  prds: [PRD-001, PRD-003, PRD-008]
  bounded_contexts: [BCC-01, BCC-03]            # owned by Identity & Access; role mutated by Role Management
  aggregates: []
  designs: []
  supersedes: null
---

## 1. Name

**User** (the central aggregate of BCC-01 Identity & Access).

## 2. Description

One User represents a chapter member with stable identity (id, email, display name) and a current role in {Active, Alumni, Moderator, Admin}. Owns: identity fields (id, email, display name), the `role` column, password hash (for app-managed accounts), OIDC linkage (for SSO accounts), and the relationship to active sessions (managed by Better Auth).

**Boundaries:** all identity-related state changes (account creation, password reset, email change, role assignment at signup) are transactional within this aggregate. Post-signup role changes are owned by BCC-03 Role Management — they write to the same `role` column but conceptually belong to a different bounded context (the *Shared Kernel* on the role enum + helper + invariant trigger; see BCC-01 §10 + BCC-03 reasoning in `004-bounded-contexts.md` §4).

**Why these boundaries:** the User is a small, stable aggregate with infrequent writes and very few invariants. Splitting auth fields from role fields would just add a join. The Shared Kernel arrangement with BCC-03 is the right tradeoff: one row, two contexts that conceptually own different aspects of it.

## 3. State transitions

The User aggregate has a thin lifecycle. Most "state" is on the `role` column, which is mutated post-signup by BCC-03 Role Management — those transitions are documented in PRD-008 R-NN and the (future) `user_role_transitions` audit-log table, not here.

```
              ┌──────────────┐
              │              │
              ▼              │
        (none) ──┐           │
                 │ signup    │
                 ▼           │
            [active]         │ (re-link to SSO on first SSO sign-in
                 │            of existing app-managed account)
                 │            │
                 │            │
                 │ deactivate │
                 │ (deferred  │
                 │  per       │
                 │  PRD-003   │
                 │  Q-02)     │
                 ▼            │
          [deactivated]       │
            (terminal,        │
             not in MVP)      │
```

| ID | From state | Event (trigger) | To state | Actor | Owning PRD |
|----|------------|-----------------|----------|-------|------------|
| ST-01 | (none) | SignupWithInviteToken | active | (the new user) | PRD-003 |
| ST-02 | (none) | SignInWithWorkspace (first time, no existing account by email) | active | (the new user) | PRD-003 |
| ST-03 | active (app-managed) | SignInWithWorkspace (first SSO sign-in for an existing app-managed account) | active (now linked to SSO) | (the user) | PRD-003 R-09 (account linking) |
| ST-04 *(deferred)* | active | DeactivateUser (Admin action) | deactivated (terminal) | Admin | PRD-003 Q-02 — out of MVP |

> **Heuristic check:** thin transition set. User is mostly created-and-stable; the interesting state changes happen *on* the User (the role column) but are owned by BCC-03's transitions, not by the User aggregate's own lifecycle. Anaemic-aggregate smell? Yes — but acceptable: we're using Better Auth's user model wholesale, so we're not in the business of growing User behaviour. If User starts accumulating chapter-specific state (membership terms, dues balance, profile preferences), revisit.

## 4. Enforced invariants

| ID | Invariant | Source |
|----|-----------|--------|
| INV-01 | `email` is unique within the chapter (Better Auth UNIQUE constraint) | ADR-002; ADR-011 |
| INV-02 | `role` is one of `{Active, Alumni, Moderator, Admin}` (Postgres CHECK constraint) | ADR-011 |
| INV-03 | At least one User in the chapter has `role = Admin` (DEFERRABLE constraint trigger per ADR-011) | PRD-001 R-16; ADR-011 |
| INV-04 | App-managed accounts have a non-null password hash; SSO-only accounts have a non-null OIDC linkage; both may be present (linked accounts) | PRD-003 R-09; ADR-002 |
| INV-05 | `display_name` is non-empty at the moment of session creation (downstream contexts assume it for roster + emails) | PRD-003 design |

## 5. Corrective policies

For MVP, none. SSO claim drift (e.g., display name changes in Workspace) is reflected on the next sign-in by Better Auth's claim-mapping — no separate corrective policy.

> **Heuristic check:** zero corrective policies = the aggregate's responsibilities are well-contained. Healthy.

## 6. Handled commands

| ID | Command | Pre-conditions | Resulting events |
|----|---------|----------------|-------------------|
| CMD-01 | SignupWithInviteToken(token, email, password, display_name) | token valid + unused; email not already used in chapter (INV-01); password meets Better Auth policy; display_name non-empty (INV-05) | EVT-01 UserCreated (role determined by token's pre-selection — Active or Alumni) |
| CMD-02 | SignInWithWorkspace(oidc_callback_payload) | callback signature valid; HD restriction passes (BR-04 in BCC-01); claims include sub + email + name | EVT-01 UserCreated *(if first time)* OR EVT-02 UserLinkedToSSO *(if linking existing account)* OR session-only *(if returning)* |
| CMD-03 | AuthenticatePassword(email, password) | account exists; password matches | session-only |
| CMD-04 | RequestPasswordReset(email) | account exists and is app-managed | EVT-03 PasswordResetRequested (Better Auth fires reset email) |
| CMD-05 | CompletePasswordReset(token, new_password) | reset token valid + unused; new password meets policy | session-only |
| CMD-06 *(deferred)* | DeactivateUser(user_id) | actor.role == Admin; subject to INV-03 (cannot deactivate the only Admin) | EVT-04 UserDeactivated — out of MVP per PRD-003 Q-02 |

Note: post-signup role changes (e.g., promoting Alumni to Moderator) are NOT commands on this aggregate — they are commands on the role column owned by BCC-03 Role Management. The role column lives on the User row, but the *operation* belongs to BCC-03.

## 7. Created events

Conceptual for MVP (no event bus); used as design vocabulary.

| ID | Event (past tense) | Caused by | Conceptual consumers |
|----|--------------------|-----------|----------------------|
| EVT-01 | UserCreated | CMD-01 / CMD-02 (first time) | (would notify Admin in a Notifications PRD: "new user signed up") |
| EVT-02 | UserLinkedToSSO | CMD-02 (account linking) | — |
| EVT-03 | PasswordResetRequested | CMD-04 | Better Auth's email plumbing |
| EVT-04 *(deferred)* | UserDeactivated | CMD-06 | BCC-02 Job Lifecycle (would trigger POL-01: clean up enrollments) |

## 8. Throughput

| Measure | Average | Max |
|---------|---------|-----|
| Command rate (per chapter, per minute) | < 0.01 | ~5 (during initial chapter onboarding burst) |
| Concurrent clients writing to a single User | 1 | 1 (a user only writes their own row) |

**Conflict-chance assessment:** **Very low.** A user only modifies their own row; concurrent writes to the same User row are essentially impossible in normal operation.

## 9. Size

| Measure | Value |
|---------|-------|
| Event growth rate | ~1–3 audit-log-equivalent rows per User per year (signups, occasional password reset, occasional re-link) |
| Lifetime of a User | years (until deactivation, which is post-MVP) |
| Estimated total audit-log-equivalent rows per chapter after 5 years | < 1000 (hundreds of users × ~3 events each) |

**Size assessment:** **Very low.** No archival or partitioning concerns. Note: the role-change audit log (`user_role_transitions`) is owned by BCC-03 Role Management, not by this aggregate — see ADC for that context (not yet drafted; deferred since walking skeleton doesn't exercise BCC-03 writes).

## 10. Open questions

| ID | Question | Owner | Needed by |
|----|----------|-------|-----------|
| Q-AGG-01 | When SignInWithWorkspace fires for an existing app-managed account (CMD-02 linking path), the user gets transparently linked. Should we surface a "Your account has been linked to your Google sign-in" toast on first link, or silent? Lean: **surface it once** — feels weird to silently link credentials. | Design | Before implementing PRD-003 |
| Q-AGG-02 | INV-04 says SSO-only accounts have OIDC linkage but no password. If such a user is later deprecated from SSO (e.g., leaves Workspace), they have no way to sign in. Lean: **manual Admin reset gives them a temp password** in the deferred deactivation flow; out of MVP. | Product | Post-MVP |
| Q-AGG-03 | Should display_name be editable post-signup? Better Auth supports it; PRD-003 doesn't say. Lean: **yes, in profile settings** — costs nothing. | Design | Before implementing PRD-003 |

## 11. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Thin User aggregate (mostly created-and-stable). 4 state transitions (one deferred), 5 invariants, 0 corrective policies, 6 commands (one deferred), 4 conceptual events. Throughput Very Low; Size Very Low. 3 design follow-up questions. The role-column-mutated-by-BCC-03 Shared Kernel relationship explicitly noted (CMD-NN list excludes role-change commands; those belong to BCC-03's own ADC, deferred since walking skeleton doesn't exercise them). |
