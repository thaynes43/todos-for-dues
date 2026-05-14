---
id: PRD-006
title: Loop closure & dispute
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
size: S
related:
  parent_prd: PRD-001
  parent_requirements: [R-08, R-12, R-14]      # R-08 receipt confirmation; R-12 dispute; R-14 (a) admin distro email
  adrs: [ADR-001, ADR-003, ADR-004, ADR-005, ADR-008, ADR-009, ADR-010]
  flows: []
  designs: []
  bounded_contexts: []
  prds: [PRD-001, PRD-005]
  supersedes: null
---

## 1. Objective

> **Problem:** A `payment-sent` job needs to either close (the chapter received the dues) or surface a dispute (something went wrong) — and the closure-confirming role must be permissive enough to fit a trust-based culture without overcomplicating the model.
> **Audience:** Actives (close or dispute), Admins (close, dispute, or resolve). Treasurer is a notification recipient only.
> **Why now:** Final feature on the walking-skeleton critical path. Without closure, the job loop never terminates.
> **One-sentence definition of success:** Either an enrolled Active or any Admin can transition a `payment-sent` job to `closed` (loop closure) or `disputed` (with a free-text reason); the dispute path emails the Admin recipient and is resolvable by an Admin.

## 2. Background & context

- **Decomposes:** PRD-001 R-08 (receipt confirmation by Active or Admin), R-12 (Active or Admin dispute with reason), R-14 (a) (Admin-recipient email on dispute).
- **State machine slice owned here:** `payment-sent → closed | disputed → closed | cancelled | payment-sent`. The Admin-resolution path back out of `disputed` is part of this PRD.
- **Tech stack:** ADR-001/003/004; ADR-005 for dispute email via Resend.
- **Trust model:** Q-04 resolved 2026-05-14 — out-of-band escalation with in-app signal. No in-app dispute conversation, no two-sided escrow ceremony.

## 3. Success metrics *(deferred to PRD-001)*

## 4. Personas & user scenarios

### 4.1 Personas

Inherited from PRD-001 §4.1.

### 4.2 Scenarios / user stories

PRD-006 owns its own US-NN namespace. Stories trace back to PRD-001 US-08 (Active confirm received), US-11 (Active dispute), US-13 (Admin dispute notification).

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As an **Active** enrolled in a job that's `payment-sent`, I want to confirm I saw my dues balance credited (in the chapter books), so the loop closes and the audit trail completes. | P0 |
| US-02 | As an **Admin**, I want to be able to confirm receipt on behalf of the Actives on any `payment-sent` job, so the loop closes when an Active is unreachable or unresponsive. | P0 |
| US-03 | As an **Active** enrolled in a job that's `payment-sent`, I want to dispute the payment with a free-text reason if my dues balance never showed the credit, so an Admin is alerted and the job isn't silently closed. | P0 |
| US-04 | As an **Admin**, I want to dispute a `payment-sent` job on behalf of the chapter (e.g., the treasurer says "I never got the Venmo"), so the issue is recorded and routable. | P0 |
| US-05 | As an **Admin**, I want to receive an email notification when any job enters `disputed`, so I find out without polling the dashboard. | P0 |
| US-06 | As an **Admin**, I want to resolve a `disputed` job by transitioning it to `closed` (resolved off-app, dues credited eventually), `cancelled` (won't be resolved, treat as dead), or back to `payment-sent` (false alarm — dues actually were credited), with a free-text resolution note in each case, so the audit log captures what happened. | P0 |

## 5. Requirements

Style: EARS. Each R-NN cites the PRD-001 R-NN it decomposes; transitions defer to ADR-008 (FSM) and ADR-009 (audit log).

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| R-01 | PRD-001 R-08, R-15 | When an Active enrolled in a job in state `payment-sent` confirms receipt, the system shall transition the job to `closed` via the FSM (ADR-008) and write an audit-log row (ADR-009) capturing the Active as actor. | P0 | US-01 | "Enrolled" — not "Alumni-confirmed-attendee." Any Active who signed up can confirm; we trust the chapter culture (§8 assumption). |
| R-02 | PRD-001 R-08, R-15 | When any Admin confirms receipt on a job in state `payment-sent`, the system shall transition the job to `closed` via the FSM and write an audit-log row capturing the Admin as actor. | P0 | US-02 | Admin doesn't need to be enrolled — they're acting on chapter authority (e.g., treasurer told them dues were credited). |
| R-03 | PRD-001 R-08 | If receipt confirmation is requested by a non-enrolled non-Admin user (e.g., a different Active who wasn't on this job), the system shall return 403 Forbidden. | P0 | US-01, US-02 | Locks down the unauthorised actor case. |
| R-04 | PRD-001 R-08 | If two valid receipt-confirmation requests for the same job arrive concurrently (e.g., an Active and an Admin click within milliseconds of each other), the system shall apply first-write-wins via FSM atomicity (ADR-008): one transition succeeds, the second receives a "job already closed" non-error response. | P0 | US-01, US-02 | DDD-002 H-03 resolved here. Idempotent UI — second clicker sees "Already closed by [name]" not an error toast. |
| R-05 | PRD-001 R-12, R-15 | When an Active enrolled in a job in state `payment-sent` disputes the payment, providing a free-text reason of at least 1 non-whitespace character, the system shall transition the job to `disputed` via the FSM and write an audit-log row capturing the Active as actor with the dispute reason in the `note` field. | P0 | US-03 | Reason is REQUIRED — no empty-reason disputes. |
| R-06 | PRD-001 R-12, R-15 | When any Admin disputes a job in state `payment-sent`, providing a free-text reason of at least 1 non-whitespace character, the system shall transition the job to `disputed` via the FSM and write an audit-log row capturing the Admin as actor with the dispute reason in the `note` field. | P0 | US-04 | Same shape as R-05 with Admin actor. |
| R-07 | PRD-001 R-14 | When a job transitions to `disputed`, the system shall send one email via the platform email provider (ADR-005 — Resend) to the chapter's configured admin-recipient address (per ADR-010 `chapter_settings.admin_recipient_email`), containing: (a) the job description, (b) the dispute reason, (c) the disputer's display name + role, (d) the job ID, (e) a link to the Admin view's dispute drill-in for this job (route owned by PRD-007). | P0 | US-05 | Q-02 resolved 2026-05-14: one email per dispute (not batched). MVP volume is low; a per-dispute email is straightforward and timely. |
| R-08 | PRD-001 R-12, R-15 | When an Admin transitions a job from `disputed` to `closed` (resolved off-app), the system shall require a free-text resolution note of at least 1 non-whitespace character, write the audit-log row with the resolution note in the `note` field, and only an Admin may perform this transition. | P0 | US-06 | Q-01 resolved 2026-05-14: resolution note required. |
| R-09 | PRD-001 R-12, R-15 | When an Admin transitions a job from `disputed` to `cancelled` (won't be resolved), the system shall require a free-text resolution note, write the audit-log row, and only an Admin may perform this transition. | P0 | US-06 | `cancelled` here means "the dues are not coming and the job is being written off." Mirror of PRD-004 R-12 terminal-cancel — but this state is reached from `disputed` (PRD-004 covered the pre-completion cancel paths). |
| R-10 | PRD-001 R-12, R-15 | When an Admin transitions a job from `disputed` back to `payment-sent` (false alarm — dues actually were credited), the system shall require a free-text resolution note explaining the false-alarm reason, write the audit-log row, and only an Admin may perform this transition. The job is then re-eligible for closure or re-dispute via R-01..R-06. | P0 | US-06 | Q-01 resolved: note required. Re-dispute is allowed (audit log captures the cycle). |
| R-11 | PRD-001 R-07 | The `closed` and `cancelled` states (the latter when reached from `disputed` via R-09) shall be terminal — the system shall NOT permit any FSM transition out of either for any actor. | P0 | US-06 | Mirror of PRD-002 R-10 / PRD-004 R-12. |
| R-12 | PRD-001 R-07 | If a non-Admin user (Active or Alumni or Moderator) attempts any `disputed → *` resolution transition, the system shall return 403 Forbidden. | P0 | US-06 | Only Admin resolves disputes. |

### 5.1 Acceptance criteria

- **AC-01** — covers R-01
  - **Given** a job J in state `payment-sent` with Active A enrolled
  - **When** A clicks "confirm received"
  - **Then** J is in state `closed` AND an audit-log row records `from_state: payment-sent, to_state: closed, actor_id: A, actor_kind: user`.

- **AC-02** — covers R-02
  - **Given** a job J in state `payment-sent`
  - **When** Admin M clicks "confirm received" (M is not enrolled in J)
  - **Then** J is in state `closed` AND an audit-log row records `actor_id: M`.

- **AC-03** — covers R-03
  - **Given** a job J in state `payment-sent` and Active X not enrolled in J (and not an Admin)
  - **When** X attempts to confirm receipt
  - **Then** the system returns 403 Forbidden AND J's state is unchanged.

- **AC-04** — covers R-04 (race)
  - **Given** a job J in state `payment-sent` with Active A enrolled and Admin M
  - **When** A and M both submit "confirm received" within the same FSM-transition window
  - **Then** exactly one transition succeeds (the first to acquire the row lock); the other receives a 200 response with body `{state: "closed", closed_by: <first actor>}` (not an error); only one audit-log row is written.

- **AC-05** — covers R-05
  - **Given** a job J in state `payment-sent` with Active A enrolled
  - **When** A submits a dispute with reason "Treasurer says they never got the Venmo"
  - **Then** J is in state `disputed` AND an audit-log row records `to_state: disputed, actor_id: A, note: "Treasurer says they never got the Venmo"` AND the admin-recipient email per R-07 fires.

- **AC-06** — covers R-05 (validation)
  - **Given** a job J in state `payment-sent` with Active A enrolled
  - **When** A submits a dispute with empty reason
  - **Then** the system rejects with a validation error AND J's state is unchanged.

- **AC-07** — covers R-07 (email content)
  - **Given** a job J disputed by Active A with reason R
  - **When** the disputed transition completes
  - **Then** an email is sent to `chapter_settings.admin_recipient_email` containing J's description, R, A's display name, A's role ("Active"), J's ID, and a link to PRD-007's dispute drill-in route for J.

- **AC-08** — covers R-08
  - **Given** a job J in state `disputed`
  - **When** Admin M transitions J to `closed` with resolution note "Treasurer credited dues on 2026-06-02 after manual reconciliation"
  - **Then** J is in state `closed` AND an audit-log row records `from_state: disputed, to_state: closed, actor_id: M, note: <resolution>`.

- **AC-09** — covers R-08 (note required)
  - **Given** a job J in state `disputed`
  - **When** Admin M attempts `disputed → closed` with empty note
  - **Then** the system rejects with a validation error AND J's state is unchanged.

- **AC-10** — covers R-09
  - **Given** a job J in state `disputed`
  - **When** Admin M transitions J to `cancelled` with resolution note "Alumni unreachable; chapter wrote off"
  - **Then** J is in state `cancelled` AND an audit-log row records the transition with M and the note.

- **AC-11** — covers R-10
  - **Given** a job J in state `disputed`
  - **When** Admin M transitions J back to `payment-sent` with note "False alarm — Active checked the wrong term"
  - **Then** J is in state `payment-sent` AND an audit-log row records the revert with M and the note AND J is re-eligible for receipt confirmation (R-01) or re-dispute (R-05).

- **AC-12** — covers R-11
  - **Given** a job J in state `closed` (or `cancelled` reached from `disputed`)
  - **When** any actor attempts any FSM transition on J
  - **Then** the system rejects with an FSM-violation error.

- **AC-13** — covers R-12
  - **Given** a job J in state `disputed`
  - **When** a non-Admin user (e.g., enrolled Active A) attempts any `disputed → *` transition
  - **Then** the system returns 403 Forbidden AND J's state is unchanged.

### 5.2 Examples

**Dispute reason captured as free text:**

| Disputer | Disputer's role | Reason text |
|----------|-----------------|-------------|
| Active A | Active | "I checked the chapter dues book and my balance wasn't updated for this job." |
| Admin M | Admin | "Treasurer told me they never received a Venmo for Job X from Alumni P. Looking into it." |

**Admin resolution note examples** (R-08, R-09, R-10):

| To-state | Note |
|----------|------|
| closed | "Treasurer credited Active A on 2026-06-02 after Alumni P resent the Venmo. All squared." |
| cancelled | "Alumni P unreachable for 30 days. Chapter wrote off the dues. Active A's balance adjusted manually." |
| payment-sent | "False alarm — Active A was looking at the previous term's books. Dues were credited correctly." |

**Admin-recipient email sketch (R-07):**

```
Subject: TODOs for Dues — DISPUTE on "Help me move a couch"

A job has been disputed and needs Admin attention.

Job: Help me move a couch
Job ID: 9f1a3c8e-...
Disputed by: Alice Adams (Active)
Reason: I checked the chapter dues book and my balance wasn't updated for this job.

Open in Admin view: https://<chapter-domain>/admin/jobs/9f1a3c8e-…

— Sent by TODOs for Dues
```

## 6. User experience

- Mocks: pending
- UX rules: closure is a single click for Active or Admin; dispute requires a reason; Admin sees disputed jobs in the Admin view (PRD-007) and can transition them out via in-line action.
- **"Confirm received" is a single click** with no confirmation modal — low-cost happy path, idempotent if double-clicked.
- **"Dispute" requires a reason** — a modal with a `<textarea>` for the reason. Submit disabled until non-empty. Disputes are rare enough that the friction is appropriate.
- **Race-resolution UX (R-04):** if you click "confirm received" and someone else just closed it, the page shows "Already closed by [name] at [time]" — informational, not an error. Reload not required.
- **Admin dispute-resolution UI** (lives in PRD-007's Admin view): for each disputed job, show three buttons {Mark closed, Mark cancelled, Mark false-alarm (revert to payment-sent)}; each opens a modal requiring a resolution note.
- **Active-side view of a `disputed` job** shows "This job is disputed. An Admin is reviewing." — no in-app dispute conversation per the trust-based model. Admin handles off-app and resolves in the app.
- **Active-side view of a `closed` job** shows "Loop closed. Closed by [Active or Admin name]." — small confirmation that the audit trail completed.

## 7. Scope boundaries

### 7.1 Non-goals

- No in-app dispute conversation, structured rebuttal flow, or auto-refund (PRD-001 §7).
- No per-Active payment-receipt tracking — confirmation is single-shot for the job (PRD-001 §7).
- **No auto-close after N days.** A job stalled in `payment-sent` stays there until someone (Active or Admin) acts (DDD-001 H-01 — risk acknowledged; reminder UX deferred to post-MVP).
- **No reminder emails to Actives** prompting them to confirm receipt. Loop-stall risk is real but small at MVP volume; post-MVP if it becomes a problem.
- **No direct `payment-sent → cancelled` path.** Cancellation from `payment-sent` requires going through `disputed` first — the act of cancelling post-payment is by definition a dispute (something went wrong), and the audit log captures the dispute reason + resolution note as a pair.
- **No per-dispute Admin assignment.** Any Admin can resolve any disputed job; first to act wins. If a chapter wants per-Admin dispute queues, post-MVP feature.

### 7.2 DO NOT CHANGE

| Concern | Owned by | Reason |
|---------|----------|--------|
| The `locked → completed → payment-sent` transitions | PRD-005 | Upstream. |
| Admin-recipient address provisioning | PRD-007 + design | This PRD uses the configured address. |
| Audit log persistence | PRD-007 | Records here, surfaces there. |
| Role grants and partition (who counts as Admin) | PRD-003 + PRD-008 | Identity / role plumbing. |

## 8. Assumptions & dependencies

- **Assumption:** A single `disputed` state is enough — no "disputed-pending-info" or "disputed-resolved-but-not-closed" sub-states. — *if false:* expand state machine here.
- **Assumption:** Active doesn't need to be the *enrolled-and-attended* Active to dispute — any *enrolled* Active can dispute. — *if false:* tighten to Alumni-confirmed-attendee only. (R-05 reflects the looser stance.)
- **Assumption:** Loop-stall risk (DDD-001 H-01) is acceptable at MVP volume. Active sees the job in their list (PRD-004 R-06) and is expected to follow up. — *if false:* add post-MVP reminder emails or auto-close.
- **Assumption:** First-write-wins via FSM transaction lock is sufficient race resolution; no UI lock or "someone else is currently confirming" indicator needed. — *if false:* add an optimistic-lock UI affordance.
- **Depends on:** PRD-005 (a `payment-sent` job exists).
- **Depends on:** PRD-007 for Admin-recipient address (per ADR-010 `chapter_settings.admin_recipient_email`) + dispute drill-in UI route (cited in R-07's email link).
- **Depends on:** ADR-005 (Resend email), ADR-008 (FSM with first-write-wins atomicity), ADR-009 (audit log), ADR-010 (chapter settings).

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | ~~When an Admin transitions a `disputed` job back to `payment-sent`, should it require a resolution note?~~ **Resolved 2026-05-14: yes — required for all three resolution paths (R-08 closed, R-09 cancelled, R-10 payment-sent revert).** Audit log captures the note. | Product | ✅ Resolved 2026-05-14 |
| Q-02 | ~~Should the dispute notification email batch or fire one per dispute?~~ **Resolved 2026-05-14: one email per dispute (R-07).** MVP volume doesn't warrant batching; per-dispute email is timely and unambiguous. | Product / Design | ✅ Resolved 2026-05-14 |
| Q-03 | DDD-001 H-01 — loop-stall risk: Active doesn't see dues balance in-app; loop may sit in `payment-sent` indefinitely. **Resolved 2026-05-14 inline: no MVP reminder; post-MVP if real signal.** Active sees the job in their list (PRD-004 R-06); follow-up is expected. Add a future Notifications PRD if stall pattern emerges. | Product | Post-MVP |
| Q-04 | DDD-002 H-03 — Active+Admin race click. **Resolved 2026-05-14: first-write-wins via FSM atomicity (R-04, AC-04).** Second clicker sees a "Already closed by X" informational response, not an error. | Design | ✅ Resolved 2026-05-14 |

## 10. Release plan

- **Walking skeleton:** Active confirms received → job closes. (No dispute flow.)
- **MVP:** full P0 set including dispute, admin email, admin in-app resolution.
- **Post-MVP:** automatic reminders before auto-close (if we ever introduce one).

## 11. Glossary changes

No new terms. Uses Loop closure (T-17), Admin recipient (T-13), Audit log (T-14).

## 12. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial scaffold. §5 deferred to Phase 5. |
| 2026-05-14 | Tom Haynes | **Q-01 resolved: resolution note required for all three Admin dispute-resolution paths.** **Q-02 resolved: one email per dispute (not batched).** **Q-03 (DDD-001 H-01) resolved: no MVP reminder, defer to post-MVP.** **Q-04 (DDD-002 H-03) resolved: first-write-wins via FSM atomicity.** |
| 2026-05-14 | Tom Haynes | **§5 drafted: 12 R-NN (EARS), 13 ACs, §5.2 examples for dispute reasons + Admin resolution notes + admin-recipient email sketch.** §4.2 stories US-01..US-06 covering Active confirm/dispute, Admin confirm/dispute, Admin notification, Admin resolution. §6 UX rules expanded with 6 MVP-specific (single-click confirm, dispute-requires-reason modal, race-resolution UX, Admin dispute-resolution buttons, Active-side disputed view, Active-side closed view). §7.1 non-goals expanded with 4 (no auto-close, no reminder emails, no direct payment-sent → cancelled path, no per-Admin dispute assignment). §8 assumptions added 2 (loop-stall acceptable, first-write-wins sufficient). Cited ADR-005 + ADR-008 + ADR-009 + ADR-010 throughout. |
