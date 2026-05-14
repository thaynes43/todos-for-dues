---
id: PRD-005
title: Completion & payment-sent
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
size: S
related:
  parent_prd: PRD-001
  parent_requirements: [R-07, R-08, R-14]      # R-07 partial: locked → completed → payment-sent; R-14 (b) treasurer email
  adrs: [ADR-001, ADR-003, ADR-004, ADR-005, ADR-008, ADR-009, ADR-010]
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

PRD-005 owns its own US-NN namespace. Stories trace back to PRD-001 US-07 (Alumni completion) and PRD-001 R-08 / R-14 b.

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As an **Alumni**, I want to mark my locked job as completed and confirm which enrolled Actives actually showed up, so dues credit goes to the right people. | P0 |
| US-02 | As an **Alumni**, I want to see the computed per-Active dues split before I send the Venmo, so I can verify the math and the recipient list match my reality. | P0 |
| US-03 | As an **Alumni**, I want to revert a completed-but-not-yet-paid job back to locked if I got the attendee list wrong, so I can fix mistakes before the treasurer is notified. | P0 |
| US-04 | As an **Alumni**, I want to mark the job as payment-sent in one click after I've Venmoed the chapter treasurer, so the treasurer gets the breakdown email. | P0 |
| US-05 | As an **Active**, I want to see that I was confirmed as an attendee with my expected dues credit amount, so I know what to look for in the chapter's dues books. | P0 |
| US-06 | As the **chapter treasurer** (email recipient, not an app user), I want a clear emailed breakdown listing the job, the total received, and which Actives to credit + how much each, so I can apply the dues credits in the chapter's books with no ambiguity. | P0 |

## 5. Requirements

Style: EARS. Each R-NN cites the PRD-001 R-NN it decomposes; transitions defer to ADR-008 (FSM) and ADR-009 (audit log).

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| R-01 | PRD-001 R-07, R-15 | When the Alumni who posted a job marks it as completed from state `locked`, providing the list of confirmed attendees (a subset of currently-enrolled Actives), the system shall transition the job to `completed` via the FSM (ADR-008), persist the confirmed-attendee list on the job record, and write an audit-log row capturing the Alumni as actor with the attendee count in the `note` field. | P0 | US-01 | Confirmed attendees are a *subset of enrolled* — Alumni can't add a non-enrolled person at completion. If a non-enrolled person showed up and helped, they had to enroll (PRD-004 R-02) at some point. |
| R-02 | PRD-001 R-05 | If the confirmed-attendees list is empty, the system shall reject the completion with a clear error. | P0 | US-01 | Zero attendees = no dues credit recipients. Either someone did the work (then they should be in the list) or the job didn't happen (then cancel via PRD-004 R-11). |
| R-03 | PRD-001 R-05 | If any item in the confirmed-attendees list is not currently enrolled in the job, the system shall reject the completion with a clear error citing which item failed. | P0 | US-01 | Defence against UI bug or stale state. |
| R-04 | PRD-001 R-08 | When a job transitions to `completed`, the system shall compute the per-Active dues credit as `dues_contribution / count(confirmed_attendees)` and persist this on the job record (or compute on read — design choice). | P0 | US-02, US-05 | Even split. Computed once at completion; persisted for audit. Decimal handling: round to 2 decimal places (cents); rounding error from uneven divisions accumulates on one designated Active (e.g., the first alphabetically) for total preservation. |
| R-05 | PRD-001 R-07, R-15 | While a job is in state `completed`, the system shall let the posting Alumni revert it to `locked`, preserving the original work date and roster but **clearing the confirmed-attendees list**, and write an audit-log row capturing the Alumni as actor with the cleared attendee count in the `note` field. | P0 | US-03 | Q-01 resolved 2026-05-14: revert allowed from `completed` only. Once payment-sent fires, no revert (R-08). The cleared attendee list forces Alumni to re-confirm on next completion attempt — prevents stale-list confusion. |
| R-06 | PRD-001 R-07, R-08, R-15 | When the posting Alumni marks a `completed` job as payment-sent, the system shall transition the job to `payment-sent` via the FSM, fire the treasurer-recipient breakdown email (R-07), and write an audit-log row capturing the Alumni as actor. | P0 | US-04 | Single click; no second confirmation. The Alumni has already verified the split in `completed` (R-04) so an additional gate would just be friction. |
| R-07 | PRD-001 R-14 | When a job transitions to `payment-sent`, the system shall send an email via the platform email provider (ADR-005 — Resend) to the chapter's configured treasurer-recipient address (per ADR-010 chapter_settings), containing: (a) the job description (truncated at ~200 chars), (b) the total dues amount, (c) a per-Active line-item table listing display name + dues credit amount, (d) the job ID for traceability, (e) the timestamp of the payment-sent transition. | P0 | US-06 | Email content is idempotent on job ID — if the email is somehow re-sent, the treasurer can deduplicate by job ID. See §8 assumption on idempotency. |
| R-08 | PRD-001 R-07 | While a job is in state `payment-sent`, the system shall NOT permit a transition to `completed` (i.e., no revert from `payment-sent`). | P0 | US-04 | Once the treasurer has been emailed and (presumably) Venmoed, walking back is messy off-app. Disputes are handled by PRD-006 via `payment-sent → disputed → payment-sent` rather than a direct revert. |
| R-09 | PRD-001 R-04 | If a non-posting-Alumni user (other Alumni, Moderator, Admin, Active) attempts to mark complete, revert, or mark payment-sent on a job, the system shall return 403 Forbidden. | P0 | US-01, US-03, US-04 | Only the posting Alumni controls the completion + payment-sent path. |

### 5.1 Acceptance criteria

- **AC-01** — covers R-01
  - **Given** a job in state `locked` with enrolled Actives [A, B, C, D] and Alumni P (the poster)
  - **When** P marks complete with confirmed attendees [A, B, C]
  - **Then** the job is in state `completed` with `confirmed_attendees: [A, B, C]` AND an audit-log row records `from_state: locked, to_state: completed, actor_id: P, note: "3 attendees confirmed"`.

- **AC-02** — covers R-02
  - **Given** a job in state `locked` with enrolled Actives [A, B]
  - **When** the Alumni marks complete with confirmed attendees []
  - **Then** the system rejects with a validation error AND the job remains in `locked`.

- **AC-03** — covers R-03
  - **Given** a job in state `locked` with enrolled Actives [A, B] and X not enrolled
  - **When** the Alumni marks complete with confirmed attendees [A, X]
  - **Then** the system rejects with a validation error citing X AND the job remains in `locked`.

- **AC-04** — covers R-04 (even split)
  - **Given** a job with `dues_contribution: 100.00` and confirmed attendees [A, B, C, D]
  - **When** the job transitions to `completed`
  - **Then** the per-Active dues credit is computed as `25.00` for each of A, B, C, D.

- **AC-05** — covers R-04 (rounding)
  - **Given** a job with `dues_contribution: 100.00` and confirmed attendees [A, B, C]
  - **When** the job transitions to `completed`
  - **Then** the per-Active credits sum to exactly `100.00` (e.g., A: 33.34, B: 33.33, C: 33.33 — extra cent on the alphabetically-first attendee).

- **AC-06** — covers R-05
  - **Given** a job in state `completed` with confirmed attendees [A, B, C]
  - **When** the posting Alumni reverts to locked
  - **Then** the job is in state `locked` with `confirmed_attendees: NULL` (or empty) AND the work date and roster are preserved AND an audit-log row records the revert.

- **AC-07** — covers R-06
  - **Given** a job in state `completed` posted by Alumni P
  - **When** P marks payment-sent
  - **Then** the job is in state `payment-sent` AND the treasurer email is dispatched via Resend AND an audit-log row records `from_state: completed, to_state: payment-sent, actor_id: P`.

- **AC-08** — covers R-07 (email content)
  - **Given** a job J in state `completed` with `dues_contribution: 100`, attendees [A, B, C, D]
  - **When** the Alumni marks payment-sent
  - **Then** the email to the chapter's treasurer-recipient address (per chapter_settings.treasurer_recipient_email) contains: J's description, the total `$100.00`, a 4-row table mapping each attendee's display name to `$25.00`, J's job ID, and the payment-sent timestamp.

- **AC-09** — covers R-08
  - **Given** a job in state `payment-sent`
  - **When** any actor attempts to revert it to `completed`
  - **Then** the system rejects with an FSM-violation error AND the job remains in `payment-sent`.

- **AC-10** — covers R-09
  - **Given** a job posted by Alumni P
  - **When** another Alumni Q (or any non-P user) attempts to mark complete / revert / mark payment-sent
  - **Then** the system returns 403 Forbidden AND the job state is unchanged.

### 5.2 Examples

**R-04 (dues split rounding):**

| Total dues | Attendees | Per-Active credit (sums to total) |
|------------|-----------|------------------------------------|
| $100.00 | 4 | $25.00 × 4 |
| $100.00 | 3 | $33.34 (alphabetically-first), $33.33, $33.33 |
| $50.00 | 7 | $7.15, $7.14, $7.14, $7.14, $7.14, $7.14, $7.15 (rounding adjusts as needed; sum = $50.00) |

**R-07 (treasurer email content sketch):**

```
Subject: TODOs for Dues — payment-sent for "Help me move a couch"

Job: Help me move a couch
Job ID: 9f1a3c8e-...
Total dues received from Alumni: $100.00
Payment-sent timestamp: 2026-05-30T14:22:11.392Z

Please credit the chapter dues balance for each Active below by the amount listed:

| Active        | Dues credit |
|---------------|-------------|
| Alice Adams   | $25.00      |
| Bob Banner    | $25.00      |
| Carol Carter  | $25.00      |
| Dan Dawson    | $25.00      |
|               |     -----   |
| Total         | $100.00     |

— Sent by TODOs for Dues (no reply needed; for questions, contact the posting Alumni or your chapter Admin).
```

Branded HTML version per ADR-005 React Email template; plain-text fallback auto-generated.

## 6. User experience

- Mocks: pending
- UX rules: Alumni confirms attendees as a checkbox list of the locked roster; computed per-Active dues credit is displayed as a verification step before payment-sent is fired; treasurer recipient address is shown so Alumni knows where the email is going.
- **Two-step gesture: complete first (with attendee confirmation), then payment-sent.** Splits the "say what happened" step from the "I sent the money" step. Lets Alumni revert if they got attendees wrong (R-05) before notifying the treasurer.
- **Computed per-Active dues credit is shown on the completion confirmation screen** before the Alumni clicks "mark payment-sent" — final verification step. Alumni sees: "You're paying $100 to the treasurer; they'll credit Alice $25, Bob $25, Carol $25, Dan $25. Continue?"
- **Payment-sent is one click** (no extra confirmation modal) since the verification happened on the completion screen.
- **Treasurer recipient address is displayed** ("Email will go to: `<treasurer@…>`") so Alumni knows where the breakdown is going.
- **Once payment-sent, the job's state in the Alumni's view shows "Awaiting receipt confirmation"** — sets expectation that closure is now Active-driven (PRD-006).
- **Active-side view of a `completed` or `payment-sent` job** shows: their own confirmed-attendee status, their per-Active dues credit amount, and a note "Look for this credit in the chapter dues books."

## 7. Scope boundaries

### 7.1 Non-goals

- The app does not record or process the actual Venmo (PRD-001 §7 non-goal).
- The app does not track per-Active payment receipt — that's the chapter treasurer's books, off-app (PRD-001 §7 non-goal).
- The app does not allow tip recording (Q-06 resolved).
- **The app does not detect or prevent duplicate Venmo transfers.** If the Alumni accidentally Venmos twice, the treasurer reconciles manually. The treasurer email is idempotent in *content* (same job ID, same data on retry), but the app does not detect "this Alumni paid this job twice."
- **The app does not include Active Venmo handles** in the treasurer email. Treasurer credits the chapter's *internal* dues books, not pays each Active out. Per-Active payouts would be an entirely different product.
- **The app does not collect a treasurer-receipt confirmation event** — receipt-confirmation in PRD-006 is by Active (or Admin), not by treasurer. The treasurer is an email recipient, not an app user.
- **The app does not provide Alumni a "draft" of the completion** — confirming attendees is a single-step gesture (per §8 assumption). If Alumni isn't sure, they leave the job in `locked` until they are.

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
- **Assumption:** The treasurer email's idempotent-by-job-ID content is sufficient to handle the rare case of a re-send (e.g., Resend retry, manual re-trigger). The treasurer can deduplicate by job ID. — *if false:* add an explicit "send count" to the email or a server-side once-only guard.
- **Assumption:** Even split with cents-rounding-on-first-alphabetically is acceptable. — *if false:* introduce a per-attendee weighting (heterogeneous splits).
- **Assumption:** Display names are present on Active accounts (R-07 email lists names). Same dependency as PRD-004 R-05.
- **Depends on:** PRD-004 (a locked job exists with a known roster).
- **Depends on:** PRD-007 for treasurer recipient configuration (per ADR-010 `chapter_settings.treasurer_recipient_email`).
- **Depends on:** ADR-005 (Resend + React Email for the treasurer breakdown), ADR-008 (FSM transitions), ADR-009 (audit log table), ADR-010 (chapter settings).

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | ~~Can an Alumni go back from `completed` to `locked` (mistake on attendees)?~~ **Resolved 2026-05-14: yes, revert from `completed` allowed; from `payment-sent` no.** R-05 lets the Alumni undo a misclick before notifying the treasurer. Reverting clears the confirmed-attendee list, forcing re-confirmation on next completion attempt (no stale list confusion). Once `payment-sent` fires, the treasurer is notified and walking back becomes off-app messy — handled via the dispute path in PRD-006. | Product | ✅ Resolved 2026-05-14 |
| Q-02 | ~~What's the treasurer email's content shape — plain text, table, branded HTML?~~ **Resolved 2026-05-14: branded HTML via React Email template + auto-generated plain-text fallback (Resend default).** Content per R-07: job description, total, per-Active line items with display names + amounts, job ID for dedup, timestamp. See §5.2 for sketch. | Design | ✅ Resolved 2026-05-14 |
| Q-03 | DDD-002 H-02 — out-of-order Venmo + email coordination. **Resolved 2026-05-14 inline:** treasurer email is content-idempotent on job ID (R-07 + §8 assumption); treasurer reconciles duplicates by job ID; app does not detect duplicate Venmos (§7.1 non-goal). Acceptable given low MVP volume; revisit if duplicate-Venmo confusion becomes a real signal. | Product | ✅ Resolved 2026-05-14 |
| Q-04 | Should the per-Active dues credit display include the rounding-adjustment notation (e.g., "Alice gets +$0.01 to absorb rounding")? Lean: **no, just show the actual numbers**. The notation is bookkeeping, not human-relevant. Treasurer sees the final amounts in the email. | Design | Phase 5 / design |

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
| 2026-05-14 | Tom Haynes | **Q-01 resolved: revert allowed from `completed` (clears attendees); not from `payment-sent`.** **Q-02 resolved: branded HTML + plain-text via React Email + Resend.** **Q-03 (DDD-002 H-02) resolved: email content-idempotent on job ID; treasurer reconciles dupes; app does not detect duplicate Venmos.** Added Q-04 (rounding-notation display, lean no). |
| 2026-05-14 | Tom Haynes | **§5 drafted: 9 R-NN (EARS), 10 ACs, §5.2 examples for split-rounding + treasurer email sketch.** §4.2 stories US-01..US-06 added (5 Alumni-facing + 1 treasurer-recipient-facing). §6 UX rules expanded with 6 MVP-specific (two-step gesture, dues-credit verification screen, treasurer-recipient display, post-payment-sent state messaging, Active-side completed view). §7.1 non-goals expanded with 4 (no duplicate-Venmo detection, no Active Venmo handles in email, no treasurer receipt event in-app, no completion drafts). §8 assumptions added 3 (idempotency, even-split rounding rule, display-name dependency). Cited ADR-005 + ADR-008 + ADR-009 + ADR-010 throughout. |
