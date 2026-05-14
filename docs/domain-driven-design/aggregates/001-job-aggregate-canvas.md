---
id: ADC-01
title: Job
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
related:
  prds: [PRD-001, PRD-002, PRD-004, PRD-005, PRD-006, PRD-007]
  bounded_contexts: [BCC-02]                    # owned by Job Lifecycle
  aggregates: [ADC-02]                          # depends on ADC-02 User for actors
  designs: []
  supersedes: null
---

## 1. Name

**Job** (the central aggregate of BCC-02 Job Lifecycle).

## 2. Description

One Job represents a single piece of work an Alumni posts and tracks its full lifecycle from `posted` (Alumni hits submit) through terminal (`closed` / `cancelled` / `rejected`). The aggregate owns: posting fields, the enrollment list (Active IDs), the confirmed work date (when locked), the confirmed-attendees subset (when completed), the computed per-Active dues split, the various reasons (rejection / cancellation / dispute / Admin resolution note), and the FSM state itself.

**Why these boundaries:** all state changes for a single job MUST be transactional with their audit-log row (per ADR-008 + ADR-009). Splitting Job from JobEnrollment would require either distributed transactions or eventual consistency for "Active enrolled + audit-log row" — overkill for MVP scale. Considered alternatives:
- **Separate Enrollment aggregate** — rejected. Adds complexity for no MVP benefit; concurrent-enrollment write contention is hypothetical at this scale.
- **Separate Dispute aggregate** — rejected. Disputes are job *states* with metadata fields, not separate entities.
- **Per-attendee DuesAttribution aggregate** — rejected. The split is a derived value computed at completion; the chapter treasurer credits books off-app, so there's no per-Active payment entity to model.

## 3. State transitions

```
                 ┌──────────────────────────────────┐
                 │                                  │
                 ▼                                  │
              [posted]                              │
                 │                                  │
                 │ submit                           │
                 ▼                                  │
       [awaiting moderation]                        │
            │         │                             │
   approve  │         │  reject                     │
            ▼         ▼                             │
       [approved] [rejected]                        │
            │     (terminal)                        │
   system   │                                       │
   auto     ▼                                       │
       [enrollment-open] ◀──────────┐               │
            │     │                 │               │
            │     │ cancel          │               │
            │     ▼                 │               │
            │  [cancelled]          │               │
            │  (terminal)           │               │
       lock │                       │ reschedule    │
            ▼                       │               │
        [locked] ──────────────────┘                │
            │     │                                 │
            │     │ cancel                          │
            │     ▼                                 │
            │  [cancelled]                          │
            │                                       │
   complete │                                       │
            ▼                                       │
       [completed] ◀────────┐                       │
            │               │ revert                │
            │               │                       │
   payment- │               │                       │
   sent     ▼               │                       │
       [payment-sent] ──────┘                       │
            │     │                                 │
   confirm  │     │ dispute                         │
            ▼     ▼                                 │
        [closed] [disputed]                         │
       (terminal)   │                               │
                    │ Admin resolves                │
                    ├─→ [closed] (terminal)         │
                    ├─→ [cancelled] (terminal)      │
                    └─→ [payment-sent] (false alarm)─┘
```

| ID | From state | Event (trigger) | To state | Actor | Owning PRD |
|----|------------|-----------------|----------|-------|------------|
| ST-01 | (none) | PostJob | posted (transient) | Alumni | PRD-002 |
| ST-02 | posted | (system, immediate) | awaiting moderation | system | PRD-002 |
| ST-03 | awaiting moderation | ApproveJob | approved | Moderator | PRD-002 |
| ST-04 | awaiting moderation | RejectJob (with reason) | rejected (terminal) | Moderator | PRD-002 |
| ST-05 | approved | (system, immediate) | enrollment-open | system | PRD-004 R-01 |
| ST-06 | enrollment-open | LockJob (with date) | locked | Alumni-poster | PRD-004 |
| ST-07 | locked | RescheduleJob | enrollment-open | Alumni-poster | PRD-004 |
| ST-08 | enrollment-open | CancelJob (with reason) | cancelled (terminal) | Alumni-poster | PRD-004 |
| ST-09 | locked | CancelJob (with reason) | cancelled (terminal) | Alumni-poster | PRD-004 |
| ST-10 | locked | CompleteJob (with attendees) | completed | Alumni-poster | PRD-005 |
| ST-11 | completed | RevertCompletion | locked | Alumni-poster | PRD-005 |
| ST-12 | completed | MarkPaymentSent | payment-sent | Alumni-poster | PRD-005 |
| ST-13 | payment-sent | ConfirmReceipt | closed (terminal) | Active (enrolled) OR Admin | PRD-006 |
| ST-14 | payment-sent | DisputeJob (with reason) | disputed | Active (enrolled) OR Admin | PRD-006 |
| ST-15 | disputed | ResolveDisputeAsClosed (with note) | closed (terminal) | Admin | PRD-006 |
| ST-16 | disputed | ResolveDisputeAsCancelled (with note) | cancelled (terminal) | Admin | PRD-006 |
| ST-17 | disputed | ResolveDisputeAsPaymentSent (with note) | payment-sent | Admin | PRD-006 |

> **Heuristic check:** 17 transitions across 10 states — substantial but not pathological. The FSM is the central thing this aggregate does. Number is appropriate for a Core domain; would be a smell in a Supporting context.

## 4. Enforced invariants

These invariants are protected within the Job aggregate's consistency boundary. Every command checks them before executing the FSM transition.

| ID | Invariant | Source |
|----|-----------|--------|
| INV-01 | `dues_amount > 0` (positive number) | PRD-002 R-02 |
| INV-02 | `recommended_people_count >= 1` (positive integer) | PRD-002 R-04 |
| INV-03 | `description` is non-empty (≥ 1 non-whitespace char) | PRD-002 R-03 |
| INV-04 | `confirmed_attendees` is a non-empty subset of currently-enrolled Actives at the moment of `completed` | PRD-005 R-02, R-03 |
| INV-05 | `per_active_dues_credit` map sums exactly to `dues_amount` (cents-rounding-on-alphabetically-first preserves total) | PRD-005 R-04 |
| INV-06 | All state transitions are via the FSM helper (no direct `state` column writes) | ADR-008 |
| INV-07 | Only the posting Alumni controls post-approval transitions (lock, reschedule, complete, revert, payment-sent, cancel) | PRD-004 R-07; PRD-005 R-09 |
| INV-08 | When transitioning to `rejected` / `cancelled` / `disputed`, a non-empty reason is required and persisted | PRD-002 R-08; PRD-004 R-11; PRD-006 R-05/R-06 |
| INV-09 | When transitioning out of `disputed` (closed / cancelled / payment-sent), a non-empty Admin resolution note is required | PRD-006 R-08, R-09, R-10 |
| INV-10 | `locked` requires a `work_date > now()` (future) | PRD-004 R-08 |
| INV-11 | `locked` requires `count(enrolled_actives) >= 1` | PRD-004 R-09 |
| INV-12 | `rejected`, `closed`, and `cancelled` are terminal — no transitions out | PRD-002 R-10; PRD-004 R-12; PRD-006 R-11 |
| INV-13 | `payment-sent` does not transition back to `completed` (no direct revert; only via `disputed → payment-sent`) | PRD-005 R-08 |
| INV-14 | An Active can have at most one enrollment per Job (re-enroll is a no-op) | PRD-004 R-02 (idempotency clause) |
| INV-15 | Receipt confirmation is first-write-wins (idempotent under concurrent calls) | PRD-006 R-04 |

## 5. Corrective policies

Compensating logic for inconsistencies that **can't** be enforced inside the aggregate (typically because the rule spans aggregates and is eventually consistent).

| ID | If… | Then… | Trigger |
|----|-----|-------|---------|
| POL-01 *(deferred)* | An enrolled Active is deactivated / removed from the chapter (BCC-01 EVT-04) | Their enrollment(s) on any non-terminal Job should be removed; if the Job was `locked` and the count drops to zero, the Job should auto-revert to `enrollment-open` (or be flagged for Alumni attention) | event: UserDeactivated (not yet wired) |

> **Heuristic check:** one deferred corrective policy. Few corrective policies = the aggregate boundary is well-chosen and most rules are intra-aggregate enforceable. Good sign.

## 6. Handled commands

All 16 commands from BCC-02 §7.1, repeated here for the aggregate's contract surface:

| ID | Command | Pre-conditions | Resulting events (audit-log entries) |
|----|---------|----------------|---------------------------------------|
| CMD-01 | PostJob(description, dues_amount, recommended_count) | actor.role == Alumni; INV-01..INV-03 satisfied | EVT-01 JobPosted (writes ST-01 + ST-02 atomically) |
| CMD-02 | ApproveJob(job_id) | actor.role == Moderator; current state == awaiting moderation | EVT-02 JobApproved (ST-03) + EVT-03 EnrollmentOpened (ST-05, system actor) |
| CMD-03 | RejectJob(job_id, reason) | actor.role == Moderator; current state == awaiting moderation; INV-08 (reason non-empty) | EVT-04 JobRejected (ST-04) |
| CMD-04 | EnrollInJob(job_id) | actor.role == Active; current state == enrollment-open; INV-14 (no double-enroll) | EVT-05 ActiveEnrolled (no FSM transition; relationship row only) |
| CMD-05 | UnenrollFromJob(job_id) | actor enrolled in job; current state == enrollment-open | EVT-06 ActiveUnenrolled |
| CMD-06 | LockJob(job_id, work_date) | actor == job.posted_by AND actor.role == Alumni; current state == enrollment-open; INV-10 (future date), INV-11 (≥1 enrollee) | EVT-07 JobLocked (ST-06) |
| CMD-07 | RescheduleJob(job_id) | actor == job.posted_by; current state == locked | EVT-08 JobRescheduled (ST-07; clears work_date; preserves enrollments per PRD-004 Q-01) |
| CMD-08 | CancelJob(job_id, reason) | actor == job.posted_by; current state in {enrollment-open, locked}; INV-08 | EVT-09 JobCancelled (ST-08 or ST-09) |
| CMD-09 | CompleteJob(job_id, attendees[]) | actor == job.posted_by; current state == locked; INV-04 (attendees subset of enrolled, non-empty) | EVT-10 JobCompleted (ST-10; computes INV-05 dues split) |
| CMD-10 | RevertCompletion(job_id) | actor == job.posted_by; current state == completed | EVT-11 JobCompletionReverted (ST-11; clears confirmed_attendees per PRD-005 R-05) |
| CMD-11 | MarkPaymentSent(job_id) | actor == job.posted_by; current state == completed | EVT-12 PaymentSent (ST-12; triggers Notifications side effect to treasurer recipient) |
| CMD-12 | ConfirmReceipt(job_id) | (actor enrolled in job AND actor.role == Active) OR actor.role == Admin; current state == payment-sent; INV-15 (idempotent) | EVT-13 ReceiptConfirmed (ST-13) |
| CMD-13 | DisputeJob(job_id, reason) | (actor enrolled in job AND actor.role == Active) OR actor.role == Admin; current state == payment-sent; INV-08 | EVT-14 JobDisputed (ST-14; triggers Notifications side effect to admin recipient) |
| CMD-14a | ResolveDisputeAsClosed(job_id, note) | actor.role == Admin; current state == disputed; INV-09 | EVT-15 DisputeResolvedClosed (ST-15) |
| CMD-14b | ResolveDisputeAsCancelled(job_id, note) | actor.role == Admin; current state == disputed; INV-09 | EVT-16 DisputeResolvedCancelled (ST-16) |
| CMD-14c | ResolveDisputeAsPaymentSent(job_id, note) | actor.role == Admin; current state == disputed; INV-09 | EVT-17 DisputeResolvedFalseAlarm (ST-17) |

## 7. Created events

Conceptual for MVP (no event bus); used as design vocabulary and as audit-log entries.

| ID | Event (past tense) | Caused by | Conceptual consumers |
|----|--------------------|-----------|----------------------|
| EVT-01 | JobPosted | CMD-01 | (would notify Moderators in a Notifications PRD) |
| EVT-02 | JobApproved | CMD-02 | EVT-03 fires immediately after |
| EVT-03 | EnrollmentOpened | CMD-02 (system, post-approval) | (Active-side UI updates on next refresh) |
| EVT-04 | JobRejected | CMD-03 | (would notify Alumni in a Notifications PRD) |
| EVT-05 | ActiveEnrolled | CMD-04 | — |
| EVT-06 | ActiveUnenrolled | CMD-05 | — |
| EVT-07 | JobLocked | CMD-06 | (would notify enrolled Actives in a Notifications PRD) |
| EVT-08 | JobRescheduled | CMD-07 | (would notify enrolled Actives in a Notifications PRD) |
| EVT-09 | JobCancelled | CMD-08 / CMD-14b | (would notify enrolled Actives) |
| EVT-10 | JobCompleted | CMD-09 | (Active-side UI shows attendee-confirmed status) |
| EVT-11 | JobCompletionReverted | CMD-10 | — |
| EVT-12 | PaymentSent | CMD-11 | Notifications adapter → treasurer recipient |
| EVT-13 | ReceiptConfirmed | CMD-12 | — |
| EVT-14 | JobDisputed | CMD-13 | Notifications adapter → admin recipient |
| EVT-15 | DisputeResolvedClosed | CMD-14a | — |
| EVT-16 | DisputeResolvedCancelled | CMD-14b | — |
| EVT-17 | DisputeResolvedFalseAlarm | CMD-14c | — |

## 8. Throughput

| Measure | Average | Max |
|---------|---------|-----|
| Command rate (per chapter, per minute) | < 0.1 | ~10 (during enrollment burst, e.g., right after approval) |
| Concurrent clients writing to a single Job | 1–3 | ~10 (all Actives enrolling simultaneously) |

**Conflict-chance assessment:** **Low.** The hottest write path is enrollment (CMD-04) right after a job is approved — multiple Actives may enroll within seconds. Postgres row-level locking on the Job row + idempotency on (job_id, active_id) handles this. State-machine transitions (CMD-06 onward) are single-actor (Alumni-poster), so no contention.

## 9. Size

| Measure | Value |
|---------|-------|
| Event growth rate (audit-log rows per Job per lifecycle) | ~7–12 (one per state transition + enroll/unenroll) |
| Lifetime of a Job aggregate | weeks to months (post → closed/cancelled) |
| Estimated audit-log rows per chapter per year | ~500–6000 (5–50 jobs/month × ~10 transitions) |
| Estimated total audit-log rows after 5 years | ~2,500–30,000 per chapter |

**Size assessment:** **Low.** Forever-retention (per ADR-009) is comfortable at this scale. No archival or partitioning needed for years. Re-evaluate if a chapter ever runs >10× the projected job volume.

## 10. Open questions

| ID | Question | Owner | Needed by |
|----|----------|-------|-----------|
| Q-AGG-01 | When CMD-07 RescheduleJob fires, should `EnrollmentOpened` (EVT-03) re-fire as a system event in the audit log? Currently the audit log captures the FSM transition (ST-07: locked → enrollment-open) once; no separate "EnrollmentOpened" duplicate. Lean: **single audit-log row** (the ST-07 transition) — duplicating EVT-03 here would clutter without informational gain. | Design | Before implementing PRD-004 |
| Q-AGG-02 | INV-05 (split sums to total) requires knowing which attendee gets the rounding cent. Lean: **alphabetical by display name at completion time** (deterministic). What if display names are missing? Fallback: alphabetical by user_id UUID. | Design | Before implementing PRD-005 |
| Q-AGG-03 | INV-15 first-write-wins on ConfirmReceipt — the second clicker's UI sees a 200 with `closed_by`. Should we also surface this to the failed clicker as a brief toast ("Already closed by Alice") on the next page render, or silent? Lean: **brief toast** for clarity. | Design | Before implementing PRD-006 |
| Q-AGG-04 | Persisted shape of `confirmed_attendees` on the Job row: array of user_ids (jsonb / Postgres array column) or a separate `job_attendees` join table? Lean: **separate join table** for queryability (e.g., "show all jobs Active A was a confirmed attendee on"). | Design | Before implementing PRD-005 |

## 11. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Captures the central Core aggregate. 17 state transitions, 15 enforced invariants, 1 deferred corrective policy, 16 commands (CMD-01..CMD-14 with CMD-14 split into 3 variants), 17 conceptual events. Throughput Low; Size Low; forever-retention sustainable. 4 design follow-up questions surfaced. |
