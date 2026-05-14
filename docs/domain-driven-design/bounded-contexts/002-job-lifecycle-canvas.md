---
id: BCC-02
title: Job Lifecycle
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
related:
  prds: [PRD-001, PRD-002, PRD-004, PRD-005, PRD-006, PRD-007]
  adrs: [ADR-001, ADR-003, ADR-004, ADR-005, ADR-008, ADR-009, ADR-010]
  aggregates: [ADC-01]                                # ADC-01 Job — pending
  bounded_contexts: [BCC-01, BCC-03]                  # depends on Identity for user lookup; reads role from BCC-03 partition
  flows: []
  supersedes: null
---

## 1. Name

**Job Lifecycle**

## 2. Purpose

Owns the Job aggregate from creation through terminal state. Coordinates the moderation handoff, the Active enrollment relationship, the Alumni-driven lock + completion + payment-sent flows, and the closure / dispute terminal paths. **Primary value:** turns Alumni intent + Active labor into a verifiable dues credit recorded in the chapter's books, with every state change provably attributable to an actor and timestamp via the audit log.

## 3. Strategic classification

| Dimension | Value | Justification |
|-----------|-------|---------------|
| Importance | **Core** | The product's differentiator. Everything novel — the post → moderate → enroll → lock → complete → pay → close loop, the dues split at completion, the dispute path — is here. If this context is wrong, the product fails. |
| Business model role | Revenue generator (proxy) | Generates *dues revenue* indirectly by routing money the chapter would otherwise miss. Directly: drives engagement on both the Active and Alumni sides. |
| Evolution stage (Wardley) | **Genesis** | Greenfield, custom-built; no off-the-shelf product matches the Greek-life-chapter dues-routing pattern. |

## 4. Domain roles (model traits)

- [x] **Specification/Draft Model** — the Alumni "drafts" a posting (description, dues, recommended count) before it becomes a live job.
- [x] **Execution Model** — the entire post-approval flow (enroll → lock → complete → pay → close) is operational state-tracking.
- [x] **Approver** — the Moderator phase gates progression from draft to live.
- [x] **Engagement Context** — drives Active-side engagement (earning toward dues) and Alumni-side engagement (getting work done while helping the chapter).
- [ ] Enforcer — partial: enforces FSM transitions and per-step authorization, but the *substantive* enforcement (HD restriction, role partition, min-Admin) lives elsewhere.
- [ ] Audit Model — partial: maintains the audit log per ADR-009 but doesn't analyze it; that's an Admin-view (cross-cutting) concern.

Not selected: Octopus Enforcer, Interchanger, Gateway, Bubble, Brain, Funnel.

## 5. Ubiquitous language (this context)

| Term | Meaning in this context | T-NN (glossary) |
|------|-------------------------|------------------|
| Job (TODO) | The central aggregate; one piece of work an Alumni posts. | T-05 |
| Posting | The Alumni's act of submitting a job (transitions to `awaiting moderation`). Distinct from the Job itself. | (new — promote?) |
| Enrollment | An Active's commitment to do the work, recorded as a (job, active) relationship. | T-09 |
| Roster | The set of currently-enrolled Actives on a job. (Local term; not in glossary — context-local.) | — |
| Lock | Alumni-initiated transition from `enrollment-open → locked` with a confirmed work date. | T-10 |
| Reschedule | Alumni-initiated transition `locked → enrollment-open` preserving roster. | T-11 |
| Confirmed attendees | Subset of enrolled Actives the Alumni confirms actually did the work, recorded at completion. | (new — promote to T-NN) |
| Dues split | Total dues ÷ confirmed-attendees count, rounded with cents on alphabetically-first attendee. | (new — promote) |
| Resolution note | Free-text note an Admin captures when transitioning a disputed job out (closed / cancelled / payment-sent revert). | (new — promote) |
| Audit log | Per-job append-only record of state transitions with actor + timestamp + note. | T-14 |

> Promote terms marked (new — promote) to `003-ubiquitous-language.md` when this canvas reaches Proposed.

## 6. Business decisions (key rules and policies)

| ID | Rule / Policy | Source |
|----|---------------|--------|
| BR-01 | A posting must have a positive dues amount (no $0). | PRD-002 R-02; PRD-001 Q-02 resolved 2026-05-14 |
| BR-02 | Enrollment is open with no seat cap; the recommended people count is informational only. | PRD-001 R-05; PRD-001 Q-05 resolved |
| BR-03 | Dues are split evenly across the Alumni-confirmed attendees at completion (not enrollees), rounded with cent surplus on the alphabetically-first attendee. | PRD-001 R-08; PRD-005 R-04 |
| BR-04 | Only the posting Alumni controls the post-approval flow (lock, reschedule, complete, mark payment-sent, cancel). | PRD-004 R-07/R-10/R-11; PRD-005 R-09 |
| BR-05 | Receipt confirmation may be performed by any enrolled Active OR any Admin (first-write-wins). | PRD-006 R-01, R-02, R-04 |
| BR-06 | Disputed jobs require an Admin to resolve them with a free-text resolution note (closed / cancelled / payment-sent revert). | PRD-006 R-08, R-09, R-10 |
| BR-07 | `rejected` and `cancelled` and `closed` are terminal — no transitions out. | PRD-002 R-10; PRD-004 R-12; PRD-006 R-11 |
| BR-08 | Single Venmo to chapter treasurer; no per-Active payment tracking in-app. | PRD-001 R-08; PRD-005 R-08 |
| BR-09 | All FSM transitions are atomic with their audit-log row (per ADR-008 + ADR-009). | ADR-008, ADR-009 |
| BR-10 | Moderator self-approval is permitted (audit log captures the actor). | PRD-002 Q-03 resolved |
| BR-11 | Locking with a past work date or zero enrolled Actives is rejected. | PRD-004 R-08, R-09 |
| BR-12 | Tips are not tracked in any form (no field, no compute, no display beyond a static cultural nudge). | PRD-001 Q-06 resolved |
| BR-13 | Edit-and-resubmit on rejected postings is not permitted; new posting required to retry. | PRD-002 Q-01 resolved |

## 7. Inbound communication

### 7.1 Commands handled

All commands transition the Job aggregate via the FSM (ADR-008) atomically with an audit-log write (ADR-009). Authorization is enforced per-command per BR-04, BR-05, BR-06, BR-10.

| ID | Command | From (collaborator) | Triggers event(s) |
|----|---------|---------------------|-------------------|
| CMD-01 | PostJob(description, dues_amount, recommended_count) | Alumni | EVT-01 JobPosted |
| CMD-02 | ApproveJob(job_id) | Moderator | EVT-02 JobApproved + EVT-03 EnrollmentOpened (auto, system) |
| CMD-03 | RejectJob(job_id, reason) | Moderator | EVT-04 JobRejected |
| CMD-04 | EnrollInJob(job_id) | Active | EVT-05 ActiveEnrolled |
| CMD-05 | UnenrollFromJob(job_id) | Active (own enrollment) | EVT-06 ActiveUnenrolled |
| CMD-06 | LockJob(job_id, work_date) | Alumni-poster | EVT-07 JobLocked |
| CMD-07 | RescheduleJob(job_id) | Alumni-poster | EVT-08 JobRescheduled |
| CMD-08 | CancelJob(job_id, reason) | Alumni-poster | EVT-09 JobCancelled |
| CMD-09 | CompleteJob(job_id, attendees[]) | Alumni-poster | EVT-10 JobCompleted |
| CMD-10 | RevertCompletion(job_id) | Alumni-poster | EVT-11 JobCompletionReverted |
| CMD-11 | MarkPaymentSent(job_id) | Alumni-poster | EVT-12 PaymentSent |
| CMD-12 | ConfirmReceipt(job_id) | Active (enrolled) OR Admin | EVT-13 ReceiptConfirmed |
| CMD-13 | DisputeJob(job_id, reason) | Active (enrolled) OR Admin | EVT-14 JobDisputed |
| CMD-14a | ResolveDisputeAsClosed(job_id, note) | Admin | EVT-15 DisputeResolvedClosed |
| CMD-14b | ResolveDisputeAsCancelled(job_id, note) | Admin | EVT-16 DisputeResolvedCancelled |
| CMD-14c | ResolveDisputeAsPaymentSent(job_id, note) | Admin | EVT-17 DisputeResolvedFalseAlarm |

### 7.2 Queries handled

| ID | Query | From | Returns |
|----|-------|------|---------|
| Q-01 | ListJobsByState(state, limit, offset) | Active / Alumni / Moderator / Admin (role-filtered) | Job[] |
| Q-02 | GetJobById(job_id) | Active / Alumni / Moderator / Admin | Job (with role-aware field projection — e.g., non-enrolled Actives see count not roster per PRD-004 R-05) |
| Q-03 | GetJobHistory(job_id) | Admin only | Transition[] (from `job_state_transitions`) |
| Q-04 | ListMyPostedJobs() | Alumni (own postings) | Job[] |
| Q-05 | ListMyEnrolledJobs() | Active (own enrollments) | Job[] |
| Q-06 | GetAggregateCounts() | Admin only | `{state: count}` map |
| Q-07 | ListDisputedJobs() | Admin only | Job[] with disputer + reason + age |
| Q-08 | ListModerationQueue() | Moderator only | Job[] in `awaiting moderation`, oldest-first |

### 7.3 Events consumed

None in MVP. (No event bus; BCC-01 / BCC-03 don't publish to BCC-02. Job Lifecycle reads role from session — a query, not an event.)

Future: if BCC-03 adds a `UserDeactivated` event, BCC-02's POL-01 corrective policy (clean up the deactivated user's enrollments) becomes consumable.

## 8. Outbound communication

### 8.1 Commands issued

None in MVP across context boundaries. Side effects (treasurer email, admin email) are routed through the Notifications cross-cutting adapter, which is invoked synchronously from the FSM helper (ADR-008) within the same Drizzle transaction.

### 8.2 Queries issued

| ID | Query | To | Used for |
|----|-------|----|----|
| Q-OUT-01 | GetUserDisplayName(user_id) | BCC-01 Identity & Access | Roster display, audit-log actor display, treasurer email line items. |
| Q-OUT-02 | GetSession() (returns user + role) | BCC-01 Identity & Access | Read on every authenticated request to authorize commands per BR-04, BR-05, BR-06. |
| Q-OUT-03 | GetSetting(key) | Chapter Settings (cross-cutting infra, ADR-010) | Treasurer recipient email (CMD-11 side effect), Admin recipient email (CMD-13 side effect), chapter timezone (display). |

### 8.3 Events published

None in MVP across context boundaries (no event bus). The events listed in §7.1 are *conceptual* — recorded in the audit log as state transitions and used as design vocabulary, but not pub-sub published. Future: a chapter-level event log could publish `PaymentSent`, `JobDisputed`, `JobClosed` for analytics or Notifications.

## 9. Aggregates owned

| ADC ID | Aggregate | Notes |
|--------|-----------|-------|
| ADC-01 | **Job** | The central aggregate; owns posting fields, enrollments, work date, confirmed attendees, dues split, reasons (rejection / cancellation / dispute / resolution), and FSM state. See `aggregates/001-job-aggregate-canvas.md` *(pending)*. |

Considered alternatives:
- **JobEnrollment as a separate aggregate.** Rejected for MVP — keeps enrollment+state-change atomicity simple within the Job aggregate. Revisit if concurrent-enrollment write contention becomes a real problem (very unlikely at MVP scale).
- **Dispute as a separate aggregate.** Rejected — disputes are job *states* with a reason field, not separate entities.

## 10. Dependencies

| Dependency | Type | Relationship pattern | Notes |
|------------|------|----------------------|-------|
| BCC-01 Identity & Access | bounded context | **Conformist** | Job Lifecycle conforms to BCC-01's session shape and `users` table contract. No translation layer; we use the session payload directly. |
| BCC-03 Role Management | bounded context | **Customer/Supplier** (Customer side) | BCC-02 reads the `role` (set by BCC-01 at signup, mutated by BCC-03 post-signup) and uses `isPrivileged()` from the shared role-helper module. We *consume* the role contract; BCC-03 is the supplier. |
| Notifications (cross-cutting adapter) | shared infra | n/a | Direct synchronous call to a typed `sendEmail()` helper; the adapter wraps Resend per ADR-005. |
| Chapter Settings (cross-cutting infra) | shared infra | n/a | `getSetting('treasurer_recipient_email')` etc. per ADR-010. |
| Postgres + Drizzle | technology | n/a | ADR-004. |
| `transitionJob()` FSM helper | shared module | n/a | ADR-008. The single chokepoint for all state mutations. |

## 11. Assumptions

- **Assumption:** Single Job aggregate per job is sufficient throughput-wise. — *if false:* split enrollment into its own aggregate; reconsider concurrency model.
- **Assumption:** All state transitions go through the `transitionJob()` helper — no direct `UPDATE jobs SET state = ...` in app code. — *if false:* the audit log will have gaps; add a Postgres constraint or pre-commit hook to enforce.
- **Assumption:** Audit log is forever-retention (per ADR-009). Storage growth at MVP scale is negligible. — *if false:* add an archival policy.
- **Assumption:** Single-chapter timezone (per ADR-010 + PRD-004 Q-04 resolved) is sufficient for date display. — *if false:* per-Active timezone preferences land in BCC-01.
- **Assumption:** Display names are present on all User records (per PRD-003 design). — *if false:* roster + audit log + emails fall back to email addresses (functional but ugly).

## 12. Verification metrics

| Metric | Source | Target |
|--------|--------|--------|
| % of jobs reaching `closed` (excluding `rejected` / `cancelled`) | live SQL on `jobs` table | ≥ 70% (MVP target per PRD-001 §3) |
| Median time from `posted` → `enrollment-open` (moderation latency) | audit log delta | ≤ 24h |
| Median time from `payment-sent` → `closed` (loop closure latency) | audit log delta | ≤ 7 days |
| Dispute rate (disputed / closed) | live SQL | ≤ 5% (signal of trust-model failure if higher) |
| Audit log completeness: % of state-column changes with a corresponding audit-log row | SQL diff `jobs.updated_at` vs. `job_state_transitions.created_at` | **100%** (any deviation = bug) |
| FSM-violation rejection count | application logs | 0 in production (illegal transitions should be caught at compile time per ADR-008 type-safety) |

## 13. Open questions

| ID | Question | Owner | Needed by |
|----|----------|-------|-----------|
| Q-CTX-01 | Should completed jobs auto-archive to a separate table after N months? Lean: **no for MVP** — table is small; revisit at scale. | Design | Post-MVP |
| Q-CTX-02 | Should we promote enrollment to its own aggregate eventually? Trigger: concurrent-enrollment write contention. Lean: **defer** — single aggregate is fine at MVP scale. | Design | Post-MVP |
| Q-CTX-03 | Are conceptual events (§8.3) worth materialising into an actual event-bus / outbox table for analytics + Notifications decoupling? Lean: **defer** — direct synchronous Notifications call is simpler for MVP; add outbox if/when async retries / replay become valuable. | Design | Post-MVP |
| Q-CTX-04 | The "Dispute as a state" choice means a Job in `disputed` carries the dispute metadata (reason, disputer) directly on the Job row. Is this clean enough, or should disputes be a separate child entity (1:N from Job for re-disputes)? Lean: **single-shot dispute on the Job row** for MVP — re-disputes after Admin resolves to `payment-sent` overwrite the previous reason (audit log preserves history). | Design | Post-MVP |

## 14. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Captures the central Core context owning the Job aggregate. 13 business rules, 16 commands (CMD-01..CMD-14 with CMD-14 split into 3 variants), 8 queries, 17 conceptual events. Dependencies on BCC-01 (Conformist) and BCC-03 (Customer/Supplier). 4 open design questions surfaced. |
