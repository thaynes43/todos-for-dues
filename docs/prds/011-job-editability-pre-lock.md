---
id: PRD-011
title: Job editability before lock
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-20
last_updated: 2026-05-20
size: S
related:
  parent_prd: PRD-001
  parent_requirements: [R-03, R-07]
  adrs: [ADR-003, ADR-004, ADR-008, ADR-009]
  flows: []
  designs: [designs/002-fsm-module.md, designs/006-ui-components.md]
  bounded_contexts: []
  prds: [PRD-002, PRD-004, PRD-010]
  supersedes: null
---

## 1. Objective

> **Problem:** A posted job is currently immutable — once submitted, the only way an Alumni can change the description, dues amount, recommended count, contact, location, or duration is to **cancel** and **re-post**. That throws away the audit trail, breaks any in-flight enrollments, and forces moderators to re-evaluate from scratch even for a typo fix.
> **Audience:** Alumni (the poster — wants to edit), Moderator (needs to re-evaluate material changes), Active (deserves to know if a job changes between when they enrolled and when it's locked).
> **Why now:** Post-deploy click-through (2026-05-20) surfaced this. With PRD-010 adding more fields (contact, location, duration, notes), the cost of "can't edit, only cancel" gets worse — more places for a typo to require a full re-post.
> **One-sentence definition of success:** An Alumni who notices a typo or needs to update job details after posting can fix it in place — without cancelling — as long as the job hasn't been locked yet.

## 2. Background & context

- **Decomposes:** PRD-001 R-03 (Alumni create job postings) — extends with editability. Touches PRD-001 R-07 (state machine) to add the `EditJob` command without changing the state graph.
- **Tech stack assumed accepted:** ADR-003 (tRPC procedure for the edit mutation), ADR-004 (Postgres + Drizzle — no schema change; UPDATE on existing columns), ADR-008 (job FSM; this PRD adds a self-loop `EditJob` command, NOT a new state transition), ADR-009 (audit log; edits write rows of a NEW kind, `job_content_changes`, alongside the existing `job_state_transitions`).
- **Re-moderation rule** (the contested decision; see Q-01): when an Alumni edits a job that is in `approved` or `enrollment_open`, **does the edit demote the job back to `awaiting_moderation`?** Lean: **yes, for any material edit** (description, dues, count, contact, location, duration). For cosmetic edits (additional_notes only), no re-moderation. This preserves moderator trust without making every typo a re-review burden.
- **Out of scope:** edits AFTER `locked`. Once a job is locked, content changes require a reschedule or cancel cycle (existing PRD-004 mechanisms).
- **Audit log:** the new `job_content_changes` row records the diff (before/after JSON snapshot of mutable fields). ADR-009 §X (snapshot pattern) supports this without schema change to existing tables — a new table is the cleanest pattern, per PRD-007's audit-log read patterns.

## 3. Personas & user scenarios

### 3.1 Personas

Inherited from PRD-001 §4.1.

### 3.2 Scenarios / user stories

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As an **Alumni** who notices a typo in my just-posted job, I want to fix it in place without cancelling and re-posting, so that the audit trail and any in-flight moderation context survive. | P0 |
| US-02 | As an **Alumni** who underestimated the duration when I posted, I want to update it before the job locks, so that enrollees have accurate expectations. | P0 |
| US-03 | As a **Moderator** reviewing the queue, I want to see when a previously-approved job has been materially edited and is back for re-review, so that I can re-evaluate vs. rubber-stamping. | P0 |
| US-04 | As an **Active** enrolled in a job whose content was edited after I enrolled, I want to be notified of the change, so that I can re-decide whether to stay enrolled. | P1 |
| US-05 | As an **Alumni**, when I try to edit a job that's already locked, I want a clear "you can't edit a locked job" message, so that I don't fight the UI. | P0 |

## 4. Requirements

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| R-01 | PRD-001 R-03 | The system shall provide an "Edit job" affordance on the job detail view for users with the Alumni role who are the original poster, but ONLY while the job is in one of: `awaiting_moderation`, `approved`, `enrollment_open`. | P0 | US-01, US-02 | RBAC: `viewerRelationship === 'poster'` AND `currentRole === 'Alumni'` (or Admin). FSM state gate is enforced server-side (R-04); client gate is a UX courtesy. |
| R-02 | PRD-001 R-03 | The system shall NOT render the "Edit job" affordance for any job in state `locked`, `completed`, `payment_sent`, `confirmed_received`, `disputed`, `cancelled`, or `rejected`. | P0 | US-05 | Same client-side hiding as R-01; server-side enforcement in R-04. |
| R-03 | PRD-001 R-03 | The editable fields are: `description`, `dues_cents`, `recommended_people_count`, and (per PRD-010) `poster_contact_kind`, `poster_contact_value`, `location`, `estimated_duration_hours`, `additional_notes`. The system shall NOT permit editing of any other field via this mutation (specifically NOT `posterId`, `chapterId`, `state`, `lockDate`, or any audit timestamp). | P0 | US-01, US-02 | Whitelist input shape — Zod `pick()` from the posting schema with the same per-field validations as PRD-002 R-02..R-04 + PRD-010 R-02. |
| R-04 | PRD-001 R-03, R-07 | When an Alumni submits an edit for a job not in `awaiting_moderation` \| `approved` \| `enrollment_open`, the system shall reject the mutation with a typed domain error `JOB_NOT_EDITABLE_IN_STATE`. | P0 | US-05 | Server-side enforcement (the tRPC procedure refuses; even if the client gate is bypassed, the server holds the line). The UI surfaces this as a user-friendly message. |
| R-05 | PRD-001 R-07 | When an Alumni edits a job currently in `approved` or `enrollment_open` and the edit changes ANY of (`description`, `dues_cents`, `recommended_people_count`, `location`, `estimated_duration_hours`), the system shall demote the job back to `awaiting_moderation`. | P0 | US-03 | This is the "material edit" re-moderation rule. Q-01 lean: include `location` and `duration` because they materially affect "can I do this job?"; do NOT include `additional_notes` or contact fields. |
| R-06 | PRD-001 R-07 | When the edit only changes `additional_notes` and/or contact fields (`poster_contact_kind`, `poster_contact_value`), the system shall NOT change the job's state. | P0 | US-01 | Cosmetic-only edits stay in the same state — no re-moderation churn for a typo in the notes. |
| R-07 | PRD-001 R-15 | Every successful edit shall write a `job_content_changes` audit row capturing: actor ID, timestamp, the field-by-field before/after diff (as JSON), and a reference to the job's then-current state. | P0 | US-01, US-03 | New audit-log row kind. ADR-009's snapshot pattern (per existing per-table audit rows like `job_state_transitions`); table name `job_content_changes`, column shape per DESIGN-001 amendment in PLAN-017. |
| R-08 | PRD-001 R-04 | When an edit triggers re-moderation (R-05), the system shall send the moderator-queue email (PRD-002 R-12 mechanism) with subject prefix `[Re-review]` so moderators can distinguish re-review from new postings in their inbox. | P1 | US-03 | Reuses the existing notification path; only the subject changes. |
| R-09 | PRD-001 R-04 | When an edit triggers re-moderation (R-05), the system shall surface the diff (which fields changed) in the moderation-queue listing for that job, so moderators can re-evaluate the changed fields specifically without re-reading the whole posting. | P1 | US-03 | New UI element on the moderation queue — collapsible "Recent edits" section per job row. Powered by the latest N rows from `job_content_changes` (typical N = 5). |
| R-10 | PRD-001 R-08 | Where Actives are currently enrolled (in `approved` or `enrollment_open`) on a job whose content changes via R-05, the system shall send each enrolled Active a notification email summarizing the change. | P1 | US-04 | Reuses Resend (ADR-005). Cosmetic edits (R-06 path) do NOT send notification — too noisy. |

### 4.1 Acceptance criteria

- **AC-01** — covers R-01, R-03, R-04, R-07
  - **Given** an Alumni poster viewing their job in `awaiting_moderation`
  - **When** they click "Edit job", change `description`, and submit
  - **Then** the job row's `description` updates; a `job_content_changes` audit row is written with the diff; the job stays in `awaiting_moderation`; the UI re-renders the new description (no manual refresh).
- **AC-02** — covers R-02, R-04
  - **Given** an Alumni poster viewing their job in `locked`
  - **When** the page renders
  - **Then** no "Edit job" affordance is visible; AND if the tRPC mutation is invoked directly (e.g., via an out-of-date client), the server returns `JOB_NOT_EDITABLE_IN_STATE` with a 4xx.
- **AC-03** — covers R-05
  - **Given** a job in `enrollment_open` with 2 Actives enrolled
  - **When** the Alumni poster edits the `description` from "Clean garage" to "Clean garage and shed"
  - **Then** the job demotes to `awaiting_moderation`; the audit log shows both the content-change row AND the state-transition row in sequence; the enrolled Actives stay enrolled (their `job_relationships` rows are unchanged).
- **AC-04** — covers R-06
  - **Given** a job in `enrollment_open`
  - **When** the Alumni edits only `additional_notes`
  - **Then** the job stays in `enrollment_open`; a `job_content_changes` audit row is written; NO state-transition row is written.
- **AC-05** — covers R-08
  - **Given** a job demoted to `awaiting_moderation` by an edit (R-05)
  - **When** the demote triggers the moderator-queue email
  - **Then** the email subject begins with `[Re-review]`; the email body references the same job and includes the diff (or a link to the moderation queue where the diff is visible).
- **AC-06** — covers R-10
  - **Given** a job in `enrollment_open` with 2 Actives enrolled
  - **When** the Alumni edits a material field (R-05 trigger)
  - **Then** each enrolled Active receives an email summarizing the change (which fields changed; the new values).
- **AC-07** — covers R-03 (negative — non-whitelisted field)
  - **Given** an Alumni poster viewing their job
  - **When** they invoke the edit mutation with `posterId = '<other-user-id>'` in the payload
  - **Then** the server rejects with a Zod schema error (`posterId` is not in the input shape).

## 5. User experience

- "Edit job" button appears next to "Cancel" on the job detail view, visible only to the poster, in eligible states (R-01).
- Clicking opens an edit form pre-populated with the current values of editable fields (R-03).
- On submit:
  - Success path: form closes, server-component re-renders (via `router.refresh()` per the MVP-FIX-A pattern), new values visible immediately.
  - Re-moderation triggered: a toast / banner explains "Your edit will be re-reviewed by a moderator before being visible to others again." The job's state visibly transitions back to `awaiting_moderation` on the detail page.
  - Validation error: surfaces inline next to the offending field (same pattern as PRD-010 R-02 / PRD-002 form errors).
- Moderation queue: each job row gets a "Recent edits" collapsible. When expanded, shows the latest 5 `job_content_changes` rows in reverse-chronological order, with the diff per row.
- **STALE-PAGE INVARIANT:** the edit mutation MUST call `router.refresh()` in `onSuccess` (per the MVP-FIX-A reference pattern). Both the editor's view AND any concurrent viewer's view (post-PRD-012 real-time updates) reflect the change without manual refresh.

## 6. Scope boundaries

### 6.1 Non-goals

- **Editing after lock.** Out of scope. PRD-004's reschedule + cancel are the lifecycle paths post-lock.
- **Editing a job posted by another Alumni.** Strictly the original poster (Admin can edit anyone's via the existing Admin-acts-as-poster pattern, per PRD-007).
- **Field-level visibility** (e.g., "edits to `dues` require re-moderation but edits to `count` don't"). R-05 takes a coarser pragmatic line: material fields require re-moderation; cosmetic fields don't. We may refine after live use, but not for the MVP fix wave.
- **Diff visualization beyond key-value before/after.** No semantic diff (e.g., "you changed dues from $50 to $75 — a 50% increase"); just `before` vs. `after` per field.
- **Edit history surfaced to Actives.** Actives see only the current state of the job; they receive an email (R-10) for material changes but the job detail view doesn't show "Edited 2 times" or similar history widget.

### 6.2 DO NOT CHANGE

| Concern | Owned by | Reason it's locked |
|---------|----------|---------------------|
| FSM state graph (the set of states + transitions) | ADR-008 | This PRD adds a self-loop `EditJob` *command* in `awaiting_moderation` / `approved` / `enrollment_open`; it does NOT change the state-to-state arrows. R-05's demote is a NEW transition arrow `approved → awaiting_moderation` and `enrollment_open → awaiting_moderation`, which IS an ADR-008 change — see Q-02. |
| Enrollment / lock semantics | PRD-004 | Edits don't change enrollment behavior; in-flight enrollees stay enrolled. |
| Audit log row shape | ADR-009 | New `job_content_changes` table follows the same column patterns as existing audit tables but is its own table — it's an addition, not a modification of existing rows. |
| Notification mechanism | ADR-005, PRD-002 R-12, PRD-007 | Re-uses existing Resend send path; only subject + recipient list changes. |
| Stale-UI router.refresh() pattern | MVP-FIX-A | Mandatory for the edit mutation. |

## 7. Assumptions & dependencies

- **Assumption:** Re-moderation on material edits is the right trade-off for MVP. *If false:* tighten Q-01 with field-level granularity (some material fields require re-moderation; others don't).
- **Assumption:** Enrolled Actives staying enrolled across an edit is the right default. *If false:* edits invalidate enrollments (more conservative; rare; would force a fresh enroll round).
- **Assumption:** Per-Active email per material edit is acceptable noise. *If false:* batch / digest the changes; defer R-10 to post-MVP.
- **Depends on:** PRD-010 (PRD-011's R-03 lists PRD-010 fields among editable ones — PRD-010 must land first or be co-shipped). ADR-008 may need an addendum for the `approved → awaiting_moderation` + `enrollment_open → awaiting_moderation` transitions per Q-02.

## 8. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | Re-moderation policy: all material edits demote (current lean) vs. only-dues-and-count demote (narrower) vs. nothing demotes (most permissive)? | Tom | 2026-05-22 |
| Q-02 | Does R-05's demote-on-edit require an ADR-008 addendum (new transitions `approved → awaiting_moderation`, `enrollment_open → awaiting_moderation`)? Lean: **yes** — those arrows don't exist today. ADR-008's authority must approve new transitions. | Tom | 2026-05-22 |
| Q-03 | Enrolled Actives on an edited job: stay enrolled (current lean) vs. auto-unenroll on material edit (force re-decision)? | Tom | 2026-05-25 |
| Q-04 | "Cancel" + "Edit" buttons side-by-side — do we worry about misclicks? Lean: no; clear labels + button styles handle it. | Tom | 2026-05-22 |
| Q-05 | Should there be a per-instance moderator setting "skip re-moderation on edits within N minutes of posting"? Lean: **no, MVP** — simple > flexible. | Tom | 2026-05-25 |

## 9. Release plan

- **Walking skeleton:** R-01..R-04, R-07 (edit affordance, eligibility gates, audit row). No re-moderation, no notifications.
- **MVP:** R-05, R-06, R-08 (re-moderation rules + moderator email re-review subject prefix).
- **Post-MVP:** R-09, R-10 (diff in moderation queue UI; per-Active notification emails).
- **Rollout:** ship as part of v0.8.x or v0.9.x (post PRD-010). Migration adds the new `job_content_changes` table (additive — no risk).
- **Reversibility:** drop the new edit mutation + leave the audit table (read-only artifact); rolling back is one route deletion, no schema un-migration needed in an emergency.

## 10. Glossary changes

- **`EditJob`** — domain command issued by the poster that updates one or more mutable fields on a job; triggers an audit row and may trigger re-moderation per R-05; CMD-NN to be assigned.
- **`job_content_changes`** — audit-log table capturing field-by-field before/after diffs for job edits; T-NN to be assigned.

## 11. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-20 | Tom Haynes | Initial Draft. Created post-click-through to capture user-reported gap #2 (job creators cannot edit; only cancel). |
