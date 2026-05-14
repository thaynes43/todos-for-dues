---
id: PRD-005
title: Completion & payment-sent
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
size: S
related:
  parent_prd: PRD-001
  parent_requirements: [R-07, R-08, R-14]      # R-07 partial: locked → completed → payment-sent; R-14 (b) treasurer email
  adrs: [ADR-001, ADR-003, ADR-004, ADR-005]
  flows: []
  designs: []
  bounded_contexts: []
  prds: [PRD-001, PRD-004]
  supersedes: null
---

## 1. Objective

> **Problem:** A locked job needs to transition through "work happened" and "Alumni paid the chapter treasurer" without inventing per-Active payment tracking. The Alumni's confirmation of who actually attended is the source of truth for dues credit; the chapter treasurer needs an emailed breakdown to credit balances off-app.
> **Audience:** Alumni (confirms attendees + marks payment-sent). The chapter treasurer is an *email recipient* — not an app user.
> **Why now:** Third feature on the walking-skeleton critical path. Without completion + payment-sent, the loop can't close.
> **One-sentence definition of success:** An Alumni can mark a locked job complete, confirm the subset of enrollees who actually did the work, and trigger a single payment-sent transition that fires the treasurer breakdown email.

## 2. Background & context

- **Decomposes:** PRD-001 R-07 partial (`locked → completed → payment-sent` slice), R-08 (single Venmo to chapter treasurer; the dues split is informational), R-14 (b) (treasurer payment-sent notification email).
- **State machine slice owned here:** `locked → completed → payment-sent`. Receipt confirmation and dispute paths live in PRD-006.
- **Tech stack:** ADR-001/003/004; ADR-005 for the treasurer email via Resend.
- **Audit log:** transitions recorded per PRD-007.

## 3. Success metrics *(deferred to PRD-001)*

## 4. Personas & user scenarios

### 4.1 Personas

Inherited from PRD-001 §4.1.

### 4.2 Scenarios / user stories

*(TBD Phase 5; traces to PRD-001 US-07.)*

## 5. Requirements

*(TBD Phase 5. Decomposes R-07 subset, R-08, R-14 b.)*

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| *(TBD)* | | | | | |

### 5.1 Acceptance criteria

*(TBD)*

### 5.2 Examples

*(TBD — concrete example of the dues split breakdown email content.)*

## 6. User experience

- Mocks: pending
- UX rules: Alumni confirms attendees as a checkbox list of the locked roster; computed per-Active dues credit is displayed as a verification step before payment-sent is fired; treasurer recipient address is shown so Alumni knows where the email is going.
- *(MVP-specific UX rules drafted Phase 5.)*

## 7. Scope boundaries

### 7.1 Non-goals

- The app does not record or process the actual Venmo (PRD-001 §7 non-goal).
- The app does not track per-Active payment receipt — that's the chapter treasurer's books, off-app (PRD-001 §7 non-goal).
- The app does not allow tip recording (Q-06 resolved).

### 7.2 DO NOT CHANGE

| Concern | Owned by | Reason |
|---------|----------|--------|
| The `enrollment-open ↔ locked` transitions | PRD-004 | Upstream. |
| The `payment-sent → closed | disputed` transitions | PRD-006 | Downstream — loop closure + dispute. |
| Audit log persistence | PRD-007 | This PRD records. |
| Treasurer recipient address provisioning (env var vs. Admin-editable setting) | PRD-007 (Admin view → advanced settings) + design | This PRD *uses* the configured address; doesn't decide where it lives. |

## 8. Assumptions & dependencies

- **Assumption:** Alumni confirms attendees in a single step (no "I confirmed Active A but I'm still deciding on Active B"). — *if false:* introduce per-attendee draft state.
- **Assumption:** Treasurer email goes out reliably enough that we don't need an in-app treasurer dashboard for delivery confirmation. — *if false:* add a "treasurer email sent" timestamp + retry queue.
- **Depends on:** PRD-004 (a locked job exists with a known roster).
- **Depends on:** PRD-007 for treasurer recipient configuration.

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | Can an Alumni go back from `completed` to `locked` (mistake on attendees)? | Product | Phase 5 |
| Q-02 | What's the treasurer email's content shape — plain text, table, branded HTML? | Design | Phase 5 |

## 10. Release plan

- **Walking skeleton:** Alumni marks complete → confirms one attendee → marks payment-sent → email fires (locally or to a sink).
- **MVP:** full P0 set including the live treasurer email through Resend.
- **Post-MVP:** treasurer email retries, dashboard for treasurer delivery health.

## 11. Glossary changes

No new terms. Uses Treasurer recipient (T-12), Dues contribution (T-07).

## 12. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial scaffold. §5 deferred to Phase 5. |
