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
  adrs: [ADR-001, ADR-003, ADR-004]
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

*(TBD Phase 5; will trace back to PRD-001 US-05 + US-14.)*

## 5. Requirements

*(TBD Phase 5. Decomposes parent_requirements: R-05, R-07 subset.)*

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| *(TBD)* | | | | | |

### 5.1 Acceptance criteria

*(TBD)*

### 5.2 Examples

*(TBD)*

## 6. User experience

- Mocks: pending
- UX rules inherited from PRD-001 §6: Alumni-initiated lock/reschedule (never automatic); enrollment is open with no seat cap; the "recommended people count" is informational only.
- *(MVP-specific UX rules drafted Phase 5.)*

## 7. Scope boundaries

### 7.1 Non-goals

- Auto-locking based on time-to-job-date or sign-up count — explicitly Alumni-initiated only (PRD-001 §7).
- Per-Active hold / waitlist / queue — open enrollment, no caps.
- Reschedule-with-new-date as a single transactional UI — MVP allows revert-to-enrollment then re-lock with new date.

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
- **Depends on:** PRD-002 (an approved job exists).
- **Depends on:** PRD-003 (authenticated session + Active/Alumni role).

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | When an Alumni reverts a lock to enrollment, do existing enrollments stay attached or get cleared (forcing re-enroll)? | Product | Phase 5 |
| Q-02 | Should Active see the current enrollment list (everyone signed up so far) or only their own enrollment status? | Product / Design | Phase 5 |

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
