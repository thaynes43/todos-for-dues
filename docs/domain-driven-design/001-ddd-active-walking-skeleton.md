---
id: DDD-001
title: Active walking skeleton — happy-path event timeline
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
related:
  prds: [PRD-001, PRD-002, PRD-003, PRD-004, PRD-005, PRD-006, PRD-008]
  adrs: []
  bounded_contexts: []     # to be surfaced from this storm
  supersedes: null
---

<!--
Persona walking skeleton — past-tense event timeline for an Active.

This is the thinnest end-to-end happy-path flow the Active experiences, from
"creates an account" to "closes a paid job." It is intentionally:
  - Single-flow only — no error branches, no dispute flow, no rejection.
  - Persona-scoped — Alumni and Moderator events appear only as system/external
    inputs that move the Active's state forward.
  - Past-tense events — the format the eventstorming output convention requires.

Use this to surface bounded-context candidates and ubiquitous-language terms.
Pair with the Alumni walking skeleton (DDD-002) for the other side of the same
job loop.
-->

## 1. Scope

> **Scope:** the simplest happy-path flow an Active goes through, end-to-end: receives an invite link, signs up, browses approved jobs, enrolls, sees the job lock, does the work (off-app), confirms attendance was recorded by the Alumni, sees their dues balance credited (off-app, in chapter books), confirms receipt in-app to close the loop.
> **Variant:** *Persona walking skeleton* — narrower than Big-Picture EventStorming.
> **Trigger:** kickoff DDD modelling for the MVP (REL-001), 2026-05-14.
> **Out of scope:** dispute flow, role changes (e.g., Active → Alumni on graduation), unenrollment, reschedule, moderator rejection, multi-role users.

## 2. Actors and systems

| ID | Type | Name | Notes |
|----|------|------|-------|
| A-01 | Actor | Active | the persona this skeleton is scoped to |
| A-02 | Actor | Alumni | poster of the job; appears as external state-changer |
| A-03 | Actor | Moderator | approves the job before Active sees it |
| A-04 | Actor | Admin | generates the invite link the Active uses to join |
| S-01 | System | Email provider (Resend) | sends invite link, treasurer breakdown email |
| S-02 | System | Chapter treasurer (off-app) | receives Venmo, credits Active's dues balance in the chapter's books |
| S-03 | System | Better Auth | account creation, session, role context |

## 3. Domain event timeline

Past tense, ordered. Each row is one event in the Active's experience of the job loop.

| ID | Event (past tense) | Trigger | Actor / System | Notes |
|----|--------------------|---------|----------------|-------|
| E-01 | Active invite link was generated | Admin action | A-04 | Out-of-band: shared in chapter group chat or email blast (PRD-001 R-01). |
| E-02 | Active opened invite link | Active clicked link | A-01 | Browser arrives at the per-chapter signup page with role pre-selected (R-01 notes). |
| E-03 | Active signed up | Form submitted (email + password) | A-01 / S-03 | Account created with role = Active per the link's pre-selection (PRD-008 boundary). |
| E-04 | Active logged in | Subsequent visits | A-01 / S-03 | Session established. |
| E-05 | Approved job became visible to Active | Job state `approved` reached | (system) | Alumni posted + Moderator approved upstream — see DDD-002 E-09..E-11. |
| E-06 | Active enrolled in a job | Active clicked "enroll" | A-01 | Job state moves `approved → enrollment-open` if not already; Active's enrollment recorded. Open enrollment, no seat cap (PRD-001 R-05, PRD-004). |
| E-07 | Job was locked by Alumni | Alumni-initiated lock | A-02 | Active sees the confirmed work date; enrollment changes are stopped. (PRD-001 R-07, PRD-004, US-14.) |
| E-08 | Active arrived for the work and the work was completed | Off-app, real world | A-01 + A-02 | Outside the system; the system learns about it via E-09. |
| E-09 | Alumni confirmed Active was an attendee | Alumni-initiated, at completion | A-02 | Active sees their attendance was confirmed; job state `locked → completed`. (PRD-001 R-05 + R-07, PRD-005.) |
| E-10 | Alumni marked payment-sent | Alumni-initiated | A-02 | Job state `completed → payment-sent`. Treasurer breakdown email fires to S-02 with Active in the split list (PRD-001 R-08 + R-14 b, PRD-005). |
| E-11 | Active's dues balance was credited | Off-app, in chapter books | S-02 | The treasurer received the Venmo and applied the per-Active split to the chapter's books. **The app does not see this.** Active learns about it from the chapter's books, not the app. |
| E-12 | Active confirmed payment received in-app | Active-initiated | A-01 | Active checks the chapter books, sees their balance is paid down, returns to the app and clicks "received." Job state `payment-sent → closed`. (PRD-001 R-08, PRD-006.) |
| E-13 | Loop closed | system, on E-12 | (system) | Job is in terminal state `closed`; audit log records all transitions. |

## 4. Hotspots / open questions

| ID | Hotspot | Why it's hot | Owner | Needed by |
|----|---------|--------------|-------|-----------|
| H-01 | E-11 is fundamentally off-app — the Active has to remember to check the chapter books *before* clicking confirm in E-12. Without a prompt, this loop may stall indefinitely in `payment-sent`. | UX gap; risks dead loops. May want an in-app reminder N days after `payment-sent` ("did you see your dues credited? confirm or dispute"). Out of MVP per PRD-001 §10 post-MVP, but flagged. | Product / Design | Phase 5 PRD-006 decomposition |
| H-02 | E-03 happens via an app-managed (email + password) account creation. Workspace SSO Alumni bypass this path entirely (PRD-003). For Actives, is invite-link → app-managed signup the *only* path, or are there Workspace-Active scenarios for chapters where undergrads also have `@<chapter-domain>` accounts? | Could affect PRD-003 / ADR-007 scope. Lean: Actives are app-managed only for MVP; revisit if a chapter's Active population is on Workspace. | Product | Phase 5 |
| H-03 | E-05 ("approved job became visible") is a query-side event, not a state-changing one. Pure event-storming purists would leave it out. We include it because it's the moment the Active perceives a new job exists — semantically meaningful even if technically passive. | Notational; doesn't block work. | — | n/a |

## 5. Pivotal events (candidate context boundaries)

Events that mark a meaningful transition in business state — they tend to fall on bounded-context seams.

- **E-03 — Active signed up.** Boundary between Identity & Access (account, session, role) and everything downstream (Membership / Job / Payment). Identity owns through E-03; downstream contexts assume an authenticated, role-known user.
- **E-06 — Active enrolled in a job.** Boundary between Job-Lifecycle (the job aggregate's state) and Membership-Participation (the Active's relationship to a specific job).
- **E-09 — Alumni confirmed Active was an attendee.** Boundary between Job-Lifecycle (`locked → completed` is a job state change) and Dues-Attribution (the per-attendee split decision that the off-app treasurer credits against). The system records the split, but the *recipient of money* is off-app.
- **E-11 — Active's dues balance was credited.** Sits *outside* any of our contexts — it's the chapter's existing accounting system's event. Important to surface because it's the bridge our app deliberately does not cross (PRD-001 §7 non-goal: no per-Active payment tracking).

## 6. Outputs / what feeds where

- **Glossary terms to add to `003-ubiquitous-language.md`:** all terms used here are already seeded T-01..T-17 from PRD-001 §11. No new terms surfaced by this skeleton.
- **Candidate bounded contexts for `004-bounded-contexts.md`** (to be created):
  - Identity & Access (Generic) — E-01..E-04. Owned by PRD-003.
  - Job Lifecycle (Core) — E-05..E-13 job-state transitions.
  - Membership-Participation (Supporting) — E-06 enrollment as a relationship.
  - Dues-Attribution (Core) — E-09..E-12 the split decision and confirmation flow.
  - Notifications (Generic) — E-10 treasurer email; not a context that owns state, but a delivery boundary.
  - **Off-app:** chapter treasurer accounting (S-02). Not a context we model.
- **Hotspots that should become PRD open questions:**
  - H-01 → propose adding to PRD-006 §9 as a new Q ("should there be an N-day in-app reminder before any auto-close prompt?").
  - H-02 → propose adding to PRD-003 §9 as a new Q ("should Actives have a Workspace-SSO path?").

## 7. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. 13 events covering the happy-path Active flow from invite-link signup to closing a paid job. 3 hotspots, 4 candidate bounded-context boundaries surfaced for `004-bounded-contexts.md`. Pairs with DDD-002 (Alumni walking skeleton). |
