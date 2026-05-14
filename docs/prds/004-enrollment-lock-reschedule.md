---
id: PRD-004
title: Enrollment, lock & reschedule
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
size: M
related:
  parent_prd: PRD-001
  parent_requirements: [R-05, R-07]            # R-07 partial: enrollment-open ↔ locked subset
  adrs: [ADR-001, ADR-003, ADR-004, ADR-008, ADR-009]
  flows: []
  designs: []
  bounded_contexts: []
  prds: [PRD-001, PRD-002]
  supersedes: null
---

## 1. Objective

> **Problem:** An approved job (PRD-002 output) needs to move from "anyone can sign up" to "the Alumni knows who's coming and when." Without a lock-in step, sign-ups thrash up to the work date and the Alumni has no definitive plan; without a reschedule path, a lock is permanent and any change becomes a cancellation.
> **Audience:** Actives (enroll/unenroll), Alumni (lock + reschedule).
> **Why now:** Second feature on the walking-skeleton critical path. Without enrollment + lock, jobs go nowhere after approval.
> **One-sentence definition of success:** An Active can enroll in or unenroll from an approved job; an Alumni can lock the job (confirming date + roster) and revert the lock back to enrollment when scheduling changes — with all transitions recorded.

## 2. Background & context

- **Decomposes:** PRD-001 R-05 (open enrollment, no seat cap, dues split evenly across Alumni-confirmed attendees at completion — Q-05 resolved 2026-05-14) + R-07 partial (the `approved → enrollment-open ↔ locked` subset of the state machine) + supports US-14 (Alumni lock/reschedule).
- **State machine slice owned here:** `approved → enrollment-open ↔ locked`. The bidirectional `enrollment-open ↔ locked` transition is the defining feature — it's what handles reschedules without forcing a cancel-and-repost cycle.
- **Tech stack:** ADR-001/003/004 (Next.js + tRPC + Drizzle/Postgres). No new ADR needed.
- **Audit log:** every transition recorded per PRD-001 R-15 (owned by PRD-007).
- **No payment yet.** This PRD ends at `locked` — completion + payment-sent live in PRD-005.

## 3. Success metrics *(deferred to PRD-001)*

## 4. Personas & user scenarios

### 4.1 Personas

Inherited from PRD-001 §4.1.

### 4.2 Scenarios / user stories

PRD-004 owns its own US-NN namespace. Stories trace back to PRD-001 US-05 (Active claim/enroll) and US-14 (Alumni lock/reschedule).

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As an **Active**, I want to enroll in an open job, so I can plan to do the work and earn toward my dues. | P0 |
| US-02 | As an **Active**, I want to see the current enrollment roster on a job, so I know who else is committed (carpool, planning, "is this overstaffed already?"). | P0 |
| US-03 | As an **Active**, I want to unenroll from an enrolled job before it locks, so I can back out if my plans change. | P0 |
| US-04 | As an **Active**, I want to see all jobs I'm currently enrolled in, so I know my commitments at a glance. | P0 |
| US-05 | As an **Alumni**, I want to lock my job with a confirmed work date once the roster is set, so the Actives have a definitive plan and sign-up changes stop. | P0 |
| US-06 | As an **Alumni**, I want to see the enrollment roster + recommended-count comparison on the lock-action UI, so I can make an informed lock decision. | P0 |
| US-07 | As an **Alumni**, I want to revert a locked job back to enrollment, so I can reschedule without forcing a cancel-and-repost cycle — and existing enrollees stay attached. | P0 |
| US-08 | As an **Alumni**, I want to cancel my job with a reason if it's no longer needed, so enrolled Actives know why and the loop closes cleanly. | P0 |

## 5. Requirements

Style: EARS. Each R-NN cites the PRD-001 R-NN it decomposes; transitions defer to ADR-008 (FSM) and ADR-009 (audit log) for implementation contract.

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| R-01 | PRD-001 R-07 | When a job's state becomes `approved` (set upstream by PRD-002 R-07), the system shall immediately transition the job to `enrollment-open` via the FSM (ADR-008) and record the transition in the audit log (ADR-009) with `actor_kind: system`. | P0 | — | The `approved` state is transient; the persisted post-approval state is `enrollment-open`. Two audit-log rows for one Moderator action: PRD-002 records the user-actor approval; PRD-004 records the system-actor visibility. |
| R-02 | PRD-001 R-05 | When a user with the Active role enrolls in a job in state `enrollment-open`, the system shall record the enrollment relationship (`(job_id, active_id)`) and write an audit-log row capturing the Active as actor. | P0 | US-01 | Open enrollment, no seat cap (PRD-001 R-05, Q-05 resolved). One enrollment per (job, Active) pair — re-enrolling is a no-op. |
| R-03 | PRD-001 R-05 | While a job is in state `enrollment-open`, the system shall let an Active who is currently enrolled remove their own enrollment (unenroll) and write an audit-log row capturing the Active as actor. | P0 | US-03 | Unenroll is only permitted in `enrollment-open` — once `locked`, the only escape is the Alumni reverting the lock. |
| R-04 | PRD-001 R-05, R-07 | If an Active attempts to unenroll from a job in any state other than `enrollment-open`, the system shall reject the action with a clear error. | P0 | US-03 | Covers the locked-job case explicitly. |
| R-05 | PRD-001 R-05 | The system shall display the full enrollment roster (list of enrolled Actives by display name) on a job's detail view to: (a) any Active enrolled in that job, (b) the Alumni who posted it, (c) any Moderator or Admin. | P0 | US-02, US-06 | Q-02 resolved 2026-05-14: full visibility — chapter-trust culture, supports coordination (carpool, "is this overstaffed?"). Non-enrolled Actives see only the count, not the names. |
| R-06 | PRD-001 R-05 | The system shall provide users with the Active role a list view of all jobs they are currently enrolled in, ordered by work date if locked (else by enrollment time, oldest-first). | P0 | US-04 | Mirror of PRD-002 R-11 for Actives. |
| R-07 | PRD-001 R-07, US-14 | When the Alumni who posted a job locks it from state `enrollment-open`, providing a confirmed work date, the system shall transition the job to `locked` via the FSM, persist the work date on the job record, and write an audit-log row capturing the Alumni as actor with the work date in the `note` field. | P0 | US-05 | Lock requires a date. Only the posting Alumni can lock (not other Alumni, not Admin). The work date is stored as `timestamptz` in UTC and rendered in the chapter's configured timezone (Q-04). |
| R-08 | PRD-001 R-07 | If the work date provided to the lock action is in the past (≤ now()), the system shall reject the lock action with a validation error. | P0 | US-05 | Locking with a past date is a UI bug or pilot error; reject server-side. |
| R-09 | PRD-001 R-07 | If a job has zero enrolled Actives, the system shall reject the lock action with a clear error. | P0 | US-05 | Locking with no roster is meaningless. |
| R-10 | PRD-001 R-07, US-14 | When the Alumni who posted a job reverts it from `locked` to `enrollment-open` (reschedule), the system shall: (a) preserve all existing enrollment relationships, (b) clear the persisted work date from the job record, (c) write an audit-log row capturing the Alumni as actor and the prior work date in the `note` field for forensic value. | P0 | US-07 | Q-01 resolved 2026-05-14: enrollments persist. Actives can self-unenroll if the new date won't work for them (R-03). |
| R-11 | PRD-001 R-07 | When the Alumni who posted a job cancels it from state `enrollment-open` or `locked`, the system shall: (a) require a free-text cancellation reason of at least 1 non-whitespace character, (b) transition the job to `cancelled` via the FSM, (c) write an audit-log row capturing the Alumni as actor with the cancellation reason in the `note` field. | P0 | US-08 | Cancellation reason is captured for the same transparency rationale as PRD-002 R-08 rejection reason. Visible to enrolled Actives on the job's detail view. |
| R-12 | PRD-001 R-07 | The `cancelled` state shall be terminal — the system shall NOT permit any FSM transition out of `cancelled` for any actor. | P0 | US-08 | Mirror of PRD-002 R-10 for cancellation. |

### 5.1 Acceptance criteria

- **AC-01** — covers R-01
  - **Given** a job in state `awaiting moderation` is approved by a Moderator (PRD-002 R-07)
  - **When** the approval transaction completes
  - **Then** within the same transaction the job transitions to `enrollment-open` AND an audit-log row exists with `from_state: approved, to_state: enrollment-open, actor_kind: system, actor_id: NULL`.

- **AC-02** — covers R-02
  - **Given** a job in state `enrollment-open` and Active A not currently enrolled
  - **When** A clicks "enroll"
  - **Then** the enrollment relationship `(job_id, A)` exists AND an audit-log row exists with `actor_id: A, actor_kind: user, note: "enroll"` (or equivalent).

- **AC-03** — covers R-02 (idempotency)
  - **Given** a job in state `enrollment-open` and Active A already enrolled
  - **When** A clicks "enroll" again
  - **Then** the system returns success with no duplicate enrollment row AND no new audit-log row.

- **AC-04** — covers R-03
  - **Given** a job in state `enrollment-open` and Active A currently enrolled
  - **When** A clicks "unenroll"
  - **Then** the enrollment relationship is removed AND an audit-log row records the unenroll with `actor_id: A`.

- **AC-05** — covers R-04
  - **Given** a job in state `locked` and Active A currently enrolled
  - **When** A attempts to unenroll
  - **Then** the system rejects the action with a clear error AND the enrollment is preserved.

- **AC-06** — covers R-05 (visibility, enrolled Active)
  - **Given** a job in state `enrollment-open` with Actives [A, B, C] enrolled
  - **When** Active A views the job's detail page
  - **Then** the page shows the full roster `[A, B, C]` by display name.

- **AC-07** — covers R-05 (visibility, non-enrolled Active)
  - **Given** a job in state `enrollment-open` with Actives [A, B, C] enrolled and Active D not enrolled
  - **When** D views the job's detail page
  - **Then** the page shows the count "3 enrolled" but does not list the names.

- **AC-08** — covers R-07 (lock happy path)
  - **Given** a job in state `enrollment-open` with ≥1 enrolled Active and Alumni P (the poster)
  - **When** P locks the job with a future work date D
  - **Then** the job is in state `locked` with `work_date == D` AND an audit-log row records `from_state: enrollment-open, to_state: locked, actor_id: P, note: "<D as ISO-8601>"`.

- **AC-09** — covers R-07 (only-poster-can-lock)
  - **Given** a job in state `enrollment-open` posted by Alumni P, and Alumni Q ≠ P
  - **When** Q attempts to lock the job
  - **Then** the system returns 403 Forbidden AND the job remains in `enrollment-open`.

- **AC-10** — covers R-08
  - **Given** a job in state `enrollment-open` with ≥1 enrolled Active
  - **When** the posting Alumni attempts to lock with a work date in the past
  - **Then** the system rejects with a validation error AND the job remains in `enrollment-open`.

- **AC-11** — covers R-09
  - **Given** a job in state `enrollment-open` with **zero** enrolled Actives
  - **When** the posting Alumni attempts to lock with a future work date
  - **Then** the system rejects with a clear error AND the job remains in `enrollment-open`.

- **AC-12** — covers R-10 (reschedule preserves enrollments)
  - **Given** a job in state `locked` with `work_date == D1` and Actives [A, B, C] enrolled
  - **When** the posting Alumni reverts the lock
  - **Then** the job is in state `enrollment-open` with `work_date == NULL` AND the enrollment relationships `[A, B, C]` are unchanged AND an audit-log row records `from_state: locked, to_state: enrollment-open, note: "<D1 as ISO-8601>"`.

- **AC-13** — covers R-11 (cancel happy path)
  - **Given** a job in state `enrollment-open` (or `locked`) with Actives enrolled
  - **When** the posting Alumni cancels with reason "Mom's couch already moved"
  - **Then** the job is in state `cancelled` AND an audit-log row records `to_state: cancelled, actor_id: <Alumni>, note: "Mom's couch already moved"`.

- **AC-14** — covers R-11 (cancellation reason required)
  - **Given** a job in state `enrollment-open`
  - **When** the posting Alumni attempts to cancel with an empty reason
  - **Then** the system rejects with a validation error AND the job remains in its current state.

- **AC-15** — covers R-12 (cancelled is terminal)
  - **Given** a job in state `cancelled`
  - **When** any actor attempts any FSM transition on the job
  - **Then** the system rejects with an FSM-violation error AND the job remains in `cancelled`.

### 5.2 Examples

**R-08 (lock date validation):**

| Input work date (relative to now) | Expected behaviour |
|-----------------------------------|---------------------|
| now − 1 hour | REJECTED ("Work date must be in the future.") |
| now + 5 minutes | ACCEPTED |
| now + 30 days | ACCEPTED |

**R-10 (reschedule audit-log row shape, per ADR-009):**

```json
{
  "job_id": "9f1a3c8e-...",
  "from_state": "locked",
  "to_state": "enrollment-open",
  "actor_id": "5d2b1f4a-...",
  "actor_kind": "user",
  "note": "2026-06-15T14:00:00.000Z",
  "created_at": "2026-05-30T09:11:42.812Z"
}
```

The `note` carries the prior work date so the audit log answers "what date did we just walk back from?" without joining to a historical job-version table.

## 6. User experience

- Mocks: pending
- UX rules inherited from PRD-001 §6: Alumni-initiated lock/reschedule (never automatic); enrollment is open with no seat cap; the "recommended people count" is informational only.
- **Enroll / unenroll are one-click actions** with toast confirmation (no modal). Frequent action; modal would be friction.
- **Lock UI shows the enrollment roster + count + recommended-count comparison** (e.g., "5 enrolled, recommended 4 — looks good") plus a **work date picker**. The Alumni picks the date at lock time; the date is not collected at posting (DDD-002 H-01 outcome — no per-Active scheduling poll).
- **Reschedule UI** explicitly states "Existing enrollments will be preserved. Actives can unenroll if the new date doesn't work for them." Removes ambiguity about Q-01 outcome.
- **Cancel UI requires a confirmation step** (modal: "Cancel job? Enter reason:") and captures the cancellation reason. Reason is shown to enrolled Actives on the job's detail view.
- **Roster visibility:** enrolled Actives + the posting Alumni + Moderator/Admin see names; non-enrolled Actives see only the count (R-05).
- **Date display:** work dates are stored UTC, rendered in the chapter's configured timezone (currently `America/New_York` for Sigma Phi Omicron — see Q-04 + ADR-010 settings storage).

## 7. Scope boundaries

### 7.1 Non-goals

- Auto-locking based on time-to-job-date or sign-up count — explicitly Alumni-initiated only (PRD-001 §7).
- Per-Active hold / waitlist / queue — open enrollment, no caps.
- Reschedule-with-new-date as a single transactional UI — MVP allows revert-to-enrollment then re-lock with new date.
- **Per-Active scheduling poll / availability collection** before lock (DDD-002 H-01). Alumni picks the date based on the roster + off-app coordination; the app does not run a "doodle"-style availability collection.
- **Admin-initiated cancellation.** Only the posting Alumni can cancel a job in MVP. Admin can intervene only via the dispute path (PRD-006) once the job is post-payment, or via direct DB access for true emergencies.
- **Limit on reschedule count.** A job can be locked → reverted → locked any number of times in MVP. If thrash becomes a problem, add a limit later.
- **Notifications on reschedule / cancel** (email or in-app push to enrolled Actives). MVP shows the new state on the job's detail page; Active sees it on next view. Push/email notifications are post-MVP (Q-03).

### 7.2 DO NOT CHANGE

| Concern | Owned by | Reason |
|---------|----------|--------|
| The `posted → awaiting-moderation → approved` transitions | PRD-002 | Upstream. |
| The `locked → completed → payment-sent → closed/disputed` transitions | PRD-005, PRD-006 | Downstream. |
| Audit log persistence and surfacing | PRD-007 | This PRD records, doesn't surface. |
| Role enforcement (who can enroll, who can lock) | PRD-003 + PRD-008 | Identity / role plumbing. |

## 8. Assumptions & dependencies

- **Assumption:** "Confirmed work date" is a single date+time field, not a date range. — *if false:* expand R-NN.
- **Assumption:** Active can self-unenroll up until the lock; Alumni cannot remove an Active from the roster pre-lock (only un-lock). — *if false:* add Alumni-side enrollment-management R-NN.
- **Assumption:** A single chapter timezone is sufficient for MVP (Sigma Phi Omicron = `America/New_York`). Stored as `timestamptz` in UTC, rendered in chapter-local. — *if false:* introduce per-chapter timezone setting (likely via ADR-010's `chapter_settings` table); not currently a problem since MVP has one chapter (Q-04).
- **Assumption:** Display names exist on user profiles for the roster (R-05) — e.g., "Bob T." If only emails are available, the roster will show emails. Display-name capture is owned by PRD-003.
- **Depends on:** PRD-002 (an approved job exists; PRD-002 R-07 sets state to `approved`, this PRD's R-01 transitions onward).
- **Depends on:** PRD-003 (authenticated session + Active/Alumni role + display name).
- **Depends on:** ADR-008 (FSM definition includes the transitions this PRD adds), ADR-009 (audit log table this PRD writes to), ADR-010 (chapter settings table for the timezone).

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | ~~When an Alumni reverts a lock to enrollment, do existing enrollments stay attached or get cleared (forcing re-enroll)?~~ **Resolved 2026-05-14: enrollments persist (R-10).** Reschedule is a *scheduling* concern, not a *roster* concern. Actives can self-unenroll (R-03) if the new date doesn't work. Considered-and-rejected: clear-the-roster (high social friction; multiplies re-confirm cost on every reschedule) and notify-with-confirm (UI complexity for an MVP edge case; deferred to post-MVP notifications work — see Q-03). | Product | ✅ Resolved 2026-05-14 |
| Q-02 | ~~Should Active see the current enrollment list (everyone signed up so far) or only their own enrollment status?~~ **Resolved 2026-05-14: enrolled Actives see the full roster (R-05); non-enrolled Actives see count only.** Chapter-trust culture; supports coordination (carpool, "is this overstaffed?"). Considered-and-rejected: count-only-for-everyone (loses coordination), per-job visibility toggle (over-engineering for MVP). | Product / Design | ✅ Resolved 2026-05-14 |
| Q-03 | Notifications (email or push) to enrolled Actives on reschedule and cancel — should MVP fire any, or rely on Active checking the job page? Lean: **no notifications in MVP**, defer to a future Notifications PRD if Active dropouts on stale information become a real signal. | Product / Design | Post-MVP |
| Q-04 | Per-chapter timezone configuration. Lean: **single chapter for MVP = `America/New_York` hardcoded as a chapter setting (ADR-010)**, configurable when a second chapter onboards. Storage is `timestamptz` in UTC; rendering uses the chapter setting. | Product | When 2nd chapter onboards |
| Q-05 | Reschedule thrash — should the system limit how many times a single job can be locked → reverted? Lean: **no limit in MVP**, add a soft warning UI ("this job has been rescheduled 3 times") if it becomes a real signal. | Product | Post-MVP |
| Q-06 | DDD-002 H-01 — what info supports the lock-decision UI? **Resolved 2026-05-14 inline:** roster + count + recommended-count comparison + date picker. No availability poll. Reflected in §6 UX rules. | Design | ✅ Resolved 2026-05-14 |

## 10. Release plan

- **Walking skeleton:** Active enrolls → Alumni locks → confirm `locked` state.
- **MVP:** full P0 set including unenroll, reschedule (revert-to-enrollment), display of confirmed roster post-lock.
- **Post-MVP:** auto-reminders to Alumni when a lock is approaching the work date.
- **Reversibility:** pure DB writes.

## 11. Glossary changes

No new terms. Uses Enrollment (T-09), Lock (T-10), Reschedule (T-11) from `docs/domain-driven-design/003-ubiquitous-language.md`.

## 12. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial scaffold. §5 requirements deferred to Phase 5. |
| 2026-05-14 | Tom Haynes | **Q-01 resolved: reschedule preserves enrollments.** **Q-02 resolved: enrolled Actives see full roster, non-enrolled see count only.** **DDD-002 H-01 resolved: simple lock UI with roster + count + recommended comparison + date picker; no availability poll** (added as Q-06 in §9 for traceability). |
| 2026-05-14 | Tom Haynes | **§5 drafted: 12 R-NN (EARS), 15 ACs (Given/When/Then), §5.2 examples for R-08 date validation + R-10 reschedule audit-log row shape.** §4.2 user stories US-01..US-08 added covering Active enroll/unenroll/list-mine/see-roster and Alumni lock/reschedule/cancel/see-roster-on-lock-UI. §6 UX rules expanded with 6 MVP-specific rules (one-click enroll/unenroll, lock-UI shape, reschedule-preserves messaging, cancel-confirmation, roster visibility tiers, timezone display). §7.1 non-goals expanded (no Admin cancel, no reschedule limit, no availability poll, no MVP notifications). §8 assumptions added single-timezone + display-name dependency. §9 added Q-03 (notifications), Q-04 (timezone config), Q-05 (reschedule limit), Q-06 (lock-UI design). Cited ADR-008 + ADR-009 + ADR-010 throughout. |
