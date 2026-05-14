---
id: DDD-004
title: Bounded contexts catalog
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
related:
  prds: [PRD-001, PRD-002, PRD-003, PRD-004, PRD-005, PRD-006, PRD-007, PRD-008, PRD-009]
  adrs: [ADR-002, ADR-005, ADR-007, ADR-008, ADR-009, ADR-010, ADR-011]
  bounded_contexts: []     # populated as BCC-NN canvases land
  supersedes: null
---

<!--
The catalog of bounded contexts. One paragraph per context; full detail goes in
each context's own canvas under bounded-contexts/.

Each context is marked Core / Supporting / Generic (lightweight substitute
for a full Core Domain Chart for a single-product, single-team project), with
a "walking-skeleton: yes/no" flag indicating whether it's exercised in the MVP
walking skeleton (DDD-001 + DDD-002).

Reconciled from candidate contexts surfaced by DDD-001 §6 (Active walking skeleton)
and DDD-002 §6 (Alumni walking skeleton). See §4 for the reconciliation notes.
-->

## 1. Catalog

| BCC ID | Name | Importance | Owning PRDs | Canvas (per-context) | Walking skeleton? |
|--------|------|------------|-------------|----------------------|-------------------|
| BCC-01 | Identity & Access | Generic | PRD-003 | `bounded-contexts/001-identity-and-access-canvas.md` *(pending)* | **Yes** |
| BCC-02 | Job Lifecycle | Core | PRD-002, PRD-004, PRD-005, PRD-006 | `bounded-contexts/002-job-lifecycle-canvas.md` *(pending)* | **Yes** |
| BCC-03 | Role Management | Supporting | PRD-008 | `bounded-contexts/003-role-management-canvas.md` *(pending)* | No (read-only) |
| BCC-04 | In-App Communication | Supporting | PRD-009 | *(deferred — PRD-009 blocked on PRD-001 Q-07)* | No |

Three bounded contexts in the walking skeleton (BCC-01, BCC-02, plus BCC-03 as read-only — the role assigned at signup is read on every request but not transitioned). BCC-04 deferred because PRD-009 is itself blocked.

## 2. Contexts in detail

### BCC-01 — Identity & Access (Generic)

**Why generic:** authentication, session, OIDC SSO, invite-token signup are universal patterns served by stable off-the-shelf libraries (Better Auth + Workspace OIDC plugin). We are not building anything novel here; the value is in *correct* identity, not differentiated identity.

**Boundary:** account creation (both invite-link and Workspace SSO branches), session establishment, role assignment **at signup** (defaulting to the role the invite link suggests, or `Alumni` for SSO-created accounts). The boundary ends at "an authenticated user with a known role exists."

**Owns:** the `users` table (per Better Auth schema + ADR-011's `role` column), the invite-token table, OIDC client configuration env vars (per ADR-007), session cookies / tokens.

**Does NOT own:** post-signup role *changes* (those belong to BCC-03 Role Management); user-display names beyond the auth-layer minimum (a profile-extension concern handled here for convenience but conceptually adjacent); job-related state.

**Walking skeleton:** yes — DDD-001 E-01..E-04 (invite link → signup → login) and DDD-002 E-01a..E-04 (both signup branches) are entirely in this context.

**Anchored by:** PRD-003, ADR-002 (Better Auth), ADR-007 (Workspace OIDC), ADR-011 (role column shape).

---

### BCC-02 — Job Lifecycle (Core)

**Why core:** this is the differentiator. Everything novel about TODOs for Dues — the post → moderate → enroll → lock → complete → pay → close loop, the dues split at completion, the dispute path — lives here. If we don't do this well, the product fails; if we do this well, no other context's quality matters as much.

**Boundary:** the full Job state machine and the Job aggregate. Spans the slice from `posted` (Alumni hits submit) through `closed` / `cancelled` (terminal). Includes per-job enrollment relationships (Active ↔ Job), the locked work date, the confirmed-attendees list, the computed per-Active dues credit, the dispute reason and resolution note. Owns the per-job audit log of state transitions (the `job_state_transitions` table per ADR-009).

**Owns:** the `jobs` table, the `job_enrollments` table (or equivalent join), the `job_state_transitions` audit-log table, the FSM definition (per ADR-008's hand-rolled TypeScript module).

**Does NOT own:** the user identities of the actors (those live in BCC-01); the role each actor has (that's BCC-03's invariant — Job Lifecycle just *reads* the role to authorise actions); the actual money (off-app — see §4 off-app boundaries); the email plumbing for treasurer notifications (that's Notifications — see §3 cross-cutting); the chapter's dues books (off-app).

**Walking skeleton:** yes — DDD-001 E-05..E-13 and DDD-002 E-05..E-22 all live here.

**Internal phases (map to PRDs, not sub-contexts):**

| Phase | PRD | State-machine slice |
|-------|-----|---------------------|
| Posting & Moderation | PRD-002 | `posted → awaiting moderation → approved \| rejected` |
| Enrollment / Lock / Reschedule | PRD-004 | `approved → enrollment-open ↔ locked` (+ cancel from this slice) |
| Completion & Payment-sent | PRD-005 | `locked → completed → payment-sent` (+ revert `completed → locked`) |
| Loop Closure & Dispute | PRD-006 | `payment-sent → closed \| disputed → closed \| cancelled \| payment-sent` |

These phases share one Job aggregate, one FSM, one audit log. They are internal *phases* of one bounded context, not separate contexts. (See §4 reconciliation: DDD-001/002 candidates "Posting & Moderation," "Job Lifecycle," "Membership-Participation," and "Dues-Attribution" are all folded here.)

**Anchored by:** PRD-002, PRD-004, PRD-005, PRD-006, ADR-008 (FSM), ADR-009 (audit log).

---

### BCC-03 — Role Management (Supporting)

**Why supporting:** roles are real domain concepts (the privileged/non-privileged partition matters for authorisation) but not the product's differentiator. Generic auth doesn't capture the chapter-specific role transitions (graduation Active → Alumni, voluntary Mod step-down) that the product's culture demands.

**Boundary:** post-signup role transitions on the `users.role` column. Owns the partition rule (privileged = {Moderator, Admin}; non-privileged = {Active, Alumni}) and its derived authorisation predicates. Owns the min-Admin invariant (per ADR-011's deferred-CHECK trigger). Owns the role-change audit log (`user_role_transitions` table — analog of `job_state_transitions`).

**Owns:** post-signup writes to `users.role`, the `user_role_transitions` table, the `isPrivileged()` helper, the deferred-CHECK trigger function for the min-Admin invariant.

**Does NOT own:** initial role assignment at signup (that's BCC-01); session reads of the role (BCC-01 surfaces it on the session); job-related authorisation rules that *consume* the role (BCC-02 and the UI layer).

**Walking skeleton:** **no for transitions** — the walking-skeleton flow does not exercise any role change. The role is set once at signup by BCC-01 and read on every authenticated request. **Yes for read-only consumption** — every authenticated request reads the role from the session to authorise the action.

This means: for the walking skeleton, BCC-03's *write* path (transitions, audit log, min-Admin invariant) is not exercised. We can defer building those until after the walking skeleton ships, picking them up as part of the broader MVP. We still need the `role` column populated correctly at signup (BCC-01's responsibility) and read correctly downstream.

**Anchored by:** PRD-008, ADR-011 (data shape + invariant).

---

### BCC-04 — In-App Communication (Supporting)

**Why supporting (provisional):** if it ships at all in MVP. PRD-009 is blocked on PRD-001 Q-07 (in-app DM vs. phone reveal vs. link out to existing platform). Until Q-07 lands, this context's shape is undecided — it could be a thin "phone reveal" feature with no aggregate, a full DM context with messages and threads, or a no-op (link to GroupMe).

**Walking skeleton:** no.

**Anchored by:** PRD-009 (Draft, blocked).

---

## 3. Cross-cutting capabilities (not bounded contexts)

These are real capabilities the system needs, but they don't qualify as bounded contexts in the DDD sense — they own no domain aggregate, no state-of-record, and no ubiquitous-language differentiator. They're shared infrastructure consumed by the contexts above. **No Bounded Context Canvas** for these — they live in design docs / ADRs.

### Notifications (delivery boundary)

Outbound email plumbing via Resend (per ADR-005). Used by:
- BCC-02 Job Lifecycle: moderator-queue notification (PRD-002 R-08 — *not yet drafted*; surfaced as a near-term concern), treasurer breakdown email (PRD-005 R-07), admin-recipient dispute notification (PRD-006 R-07), Alumni rejection-reason notification (PRD-002, optional MVP).
- BCC-01 Identity & Access: signup confirmation, password reset (typically Better Auth defaults).

A thin adapter wraps Resend; recipient addresses come from `chapter_settings` (ADR-010). If notifications grow significantly (in-app notification center, push, SMS, scheduling, retries with exponential backoff, per-user preferences), revisit promoting to a real bounded context.

### Audit / Observability (cross-cutting capability)

Two related but distinct capabilities:
- **Write-side:** every state-changing operation in BCC-02 (and BCC-03's writes when those land) writes to its respective audit-log table atomically with the state mutation, via a single `transitionJob()` / `transitionRole()` helper (ADR-008 + ADR-009 + ADR-011). The capability lives in BCC-02 and BCC-03; the *pattern* is shared infrastructure (the `<state>_transitions` table shape).
- **Read-side:** the Admin view (PRD-007) surfaces audit logs and aggregate counts. PRD-007 owns the read-side UI but does not own the data — the audit-log tables are owned by the contexts that write to them.

### Chapter Settings (infrastructure key-value store)

The `chapter_settings` table (per ADR-010) — a hybrid env-var + DB-backed key-value store of per-instance operational settings (admin recipient email, treasurer recipient email, chapter timezone, chapter display name). Consumed by Notifications (recipient addresses), Job Lifecycle (timezone for displaying work dates), and the Admin view (settings-edit UI). Not a bounded context — no aggregate, no state machine, no ubiquitous-language differentiator.

### Admin View (UI surface)

The `/admin/*` route (per PRD-007) is a UI host that aggregates views from BCC-02 (job aggregates, dispute drill-in, audit log) and BCC-03 (Users sub-route) plus edits to Chapter Settings. It owns the navigation shell and aggregate-count queries, but does not own the underlying state. Not a bounded context — just a UI surface.

## 4. Reconciliation notes

DDD-001 §6 and DDD-002 §6 each surfaced candidate contexts. The reconciliation:

| Candidate (from walking skeleton) | Disposition | Reason |
|------------------------------------|-------------|--------|
| Identity & Access (Generic) | **Kept as BCC-01** | Both walking skeletons agree; clean boundary. |
| Posting & Moderation (Supporting, DDD-002) | **Folded into BCC-02 Job Lifecycle (internal phase)** | Shares the Job aggregate, the FSM, and the audit log with the rest of Job Lifecycle. Two contexts on one aggregate would create a "the Job moves between contexts" weirdness with no payoff. The phase distinction is captured as an internal concept, mapped 1:1 to PRD-002. |
| Job Lifecycle (Core, both) | **Kept as BCC-02** | Renamed from "Job Lifecycle" to match the broader scope after folding in the candidates above. |
| Membership-Participation (Supporting, DDD-001) | **Folded into BCC-02** | Per-job enrollment is a relationship on the Job aggregate, not a separate aggregate. There is no broader "Membership" concept (that role is played by Role Management's `users.role`). |
| Dues-Attribution (Core, both) | **Folded into BCC-02** | The per-Active dues credit is a derived value computed at completion time; it's a property of the Job, not its own aggregate. The chapter-treasurer side of attribution is off-app (see §5). |
| Notifications (Generic, both) | **Demoted to cross-cutting** (§3) | No domain aggregate, no state-of-record. Pure delivery boundary. |
| Audit / Observability (cross-cutting, DDD-002) | **Demoted to cross-cutting** (§3) | Already implicit; called out for clarity. The write-side lives in the state-owning contexts; PRD-007 owns the read-side UI. |
| Role Management (implicit, neither walking skeleton) | **Promoted to BCC-03** | Not in the walking-skeleton candidates because the walking skeleton doesn't exercise role transitions, but PRD-008 owns the post-signup role-change capability — different ubiquitous language ("partition," "transitions," "min-Admin invariant") from BCC-01's "auth, session, signup." |

## 5. Off-app boundaries

These exist outside the system entirely and are **explicitly out of any context we model:**

- **Chapter treasurer accounting** — the chapter's existing dues-tracking books (paper, spreadsheet, or chapter-management software). The treasurer credits each Active's dues balance off-app after receiving the Venmo and the breakdown email. The app's responsibility ends at sending the breakdown email; the chapter's responsibility begins there.
- **Venmo (or future payment channel)** — the Alumni initiates a single transfer; we do not custody, observe, or reconcile it. PRD-001 §7 non-goal.
- **Chapter-internal communication** (group chats, alumni newsletters, in-person conversations) — invite link distribution, off-app dispute resolution, etc. The app does not absorb these channels.

## 6. Walking-skeleton subset (per `README.md`)

For the MVP Walking Skeleton (REL-001 phase 1 per release manifest), the contexts touched are:

- **BCC-01 Identity & Access** — full canvas needed before walking-skeleton code lands.
- **BCC-02 Job Lifecycle** — full canvas needed; the central aggregate.

Aggregates the walking skeleton writes to:
- **User** (in BCC-01) — created at signup; read on every request.
- **Job** (in BCC-02) — the central domain entity; reaches `closed` over the walking-skeleton happy path.

Defer for post-walking-skeleton MVP:
- **BCC-03 Role Management** — write-side (transitions + invariant + audit) not exercised in the walking skeleton; ship as part of broader MVP.
- **BCC-04 In-App Communication** — blocked on PRD-009 / PRD-001 Q-07.

## 7. Open questions

| ID | Question | Owner | Needed by |
|----|----------|-------|-----------|
| Q-01 | Should the `user_role_transitions` audit-log table live in BCC-03 (Role Management) physically, or share the Job-Lifecycle audit-log table partitioned by entity type? Lean: separate table, same shape — keeps each context's audit independent and avoids a polymorphic `entity_id` column. | Design | Before BCC-03 canvas |
| Q-02 | If BCC-04 In-App Communication ends up being "phone reveal only," does it really warrant a separate bounded context? Or is it a single feature on the Job detail view? Defer until PRD-009 / Q-07 lands. | Product | Post-Q-07 |
| Q-03 | Does the chapter-display-name + timezone + recipient emails (chapter_settings) deserve a "Chapter" aggregate of its own (single-row), or stay as a key-value table? Lean: key-value for MVP — there's no behaviour, just storage. Promote to an aggregate if/when we add chapter-level domain rules (e.g., "chapter is suspended" = freeze all jobs). | Product | Post-MVP |

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Reconciled DDD-001 + DDD-002 §6 candidate contexts into 3 walking-skeleton-touching bounded contexts (BCC-01 Identity & Access, BCC-02 Job Lifecycle, BCC-03 Role Management) + 1 deferred (BCC-04 In-App Communication). Demoted Notifications and Audit/Observability to cross-cutting capabilities (§3). Folded Posting & Moderation, Membership-Participation, and Dues-Attribution into BCC-02 (§4 reconciliation notes). Listed off-app boundaries (§5) and walking-skeleton subset (§6). 3 open questions (Q-01..Q-03) for design follow-up. |
