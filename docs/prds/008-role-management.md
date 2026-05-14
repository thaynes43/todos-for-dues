---
id: PRD-008
title: Role management
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
size: S
related:
  parent_prd: PRD-001
  parent_requirements: [R-02, R-09, R-16]
  adrs: [ADR-001, ADR-002, ADR-003, ADR-004]
  flows: []
  designs: []
  bounded_contexts: []
  prds: [PRD-001, PRD-003]
  supersedes: null
---

## 1. Objective

> **Problem:** Users need to change their own role (graduations, voluntary step-down from Moderator/Admin) without putting that burden on Admins; Admins need to grant privileged roles (Moderator, Admin); the system needs to prevent zero-Admin states.
> **Audience:** All authenticated users (self-service Active ↔ Alumni transitions, voluntary step-down from privileged roles); Admins (privilege grants).
> **Why now:** Plumbing PRD — no other capability fully ships without role transitions working. Lower priority than the job-loop PRDs only because the launch chapter can be bootstrapped with hand-set roles.
> **One-sentence definition of success:** A user can self-change their role to any non-privileged role; an Admin can grant Moderator or Admin to anyone; no operation can reduce the chapter's Admin count to zero.

## 2. Background & context

- **Decomposes:** PRD-001 R-02 (privileged/non-privileged role partition), R-09 (self-service for non-privileged transitions; Admin-grant for privileged), R-16 (DB-level minimum-Admin invariant).
- **Resolved 2026-05-14:** non-privileged transitions self-service; privileged grants Admin-only; min-Admin invariant DB-enforced; recovery via `BOOTSTRAP_ADMIN_EMAIL` env var (ADR-002) or operator-level direct DB access.
- **Tech stack:** ADR-002 (Better Auth — role storage + session-context source-of-truth), ADR-003 (tRPC procedure for role-change), ADR-004 (Postgres CHECK or trigger for the invariant).

## 3. Success metrics *(deferred to PRD-001)*

## 4. Personas & user scenarios

### 4.1 Personas

Inherited from PRD-001 §4.1.

### 4.2 Scenarios / user stories

*(TBD Phase 5; traces to PRD-001 US-09, US-15.)*

## 5. Requirements

*(TBD Phase 5. Decomposes R-02, R-09, R-16.)*

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| *(TBD)* | | | | | |

### 5.1 Acceptance criteria

*(TBD)*

### 5.2 Examples

*(TBD — example error wording when min-Admin invariant blocks a demotion.)*

## 6. User experience

- Mocks: pending
- UX rules: self-service role change is a one-click in the user's profile/settings; Admin role-grant is a separate action in the Admin view (PRD-007); the min-Admin error is surfaced as a clean inline message, not a stack trace.

## 7. Scope boundaries

### 7.1 Non-goals

- Time-limited role grants (e.g., "Moderator for one term") — out of MVP.
- N≥2-Admin confirmation for Admin demotion (rejected at Q-08 resolution).
- Per-role permission matrices in-app — roles map to capabilities by code, not by Admin-editable config.

### 7.2 DO NOT CHANGE

| Concern | Owned by | Reason |
|---------|----------|--------|
| Authentication (login, session, password reset, OIDC) | PRD-003 + ADR-002, ADR-007 | Identity layer. |
| Invite-link signup and link-pre-selects-role | PRD-003 + PRD-001 R-01 | Owned at signup, not at runtime role-change. |
| Audit log for role-change events | PRD-007 (audit-log analog of PRD-001 R-15 for users) | Records, doesn't drive. |

## 8. Assumptions & dependencies

- **Assumption:** Better Auth's user/role storage can express the four roles + the partition without significant custom schema. — *if false:* small ADR addendum to ADR-002.
- **Assumption:** Min-Admin invariant can be enforced as a Postgres CHECK constraint on a per-chapter materialised count or a BEFORE-UPDATE trigger. — *if false:* application-layer enforcement (riskier — race conditions).
- **Depends on:** PRD-003 (Identity & Access).

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | When a user self-demotes from Admin and they're the only Admin, the operation fails — should the error message suggest "promote someone else first" with a quick link? Lean: yes. | Design | Phase 5 |
| Q-02 | Does the audit log record the *initiator* and *target* of the role change separately, or just "user X is now role Y"? Lean: both, since Admin-grants and self-changes look different in the log. | Product | Phase 5 |

## 10. Release plan

- **Walking skeleton:** Admin can change another user's role via direct DB or env-var bootstrap; in-app UI deferred. Min-Admin invariant present at the DB layer from day one.
- **MVP:** full P0 set including in-app self-service role change, Admin grant UI, error surfacing.
- **Post-MVP:** time-limited grants, per-role permission inspection.

## 11. Glossary changes

No new terms. Uses Active (T-01), Alumni (T-02), Moderator (T-03), Admin (T-04).

## 12. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial scaffold. §5 deferred to Phase 5. |
