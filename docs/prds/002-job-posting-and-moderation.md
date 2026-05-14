---
id: PRD-002
title: Job posting & moderation
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
size: M
related:
  parent_prd: PRD-001
  parent_requirements: [R-03, R-04]
  adrs: [ADR-001, ADR-003, ADR-004, ADR-005]   # web framework, API contract, DB+ORM, email (rejection notifications)
  flows: []                                     # docs/flows/walking-skeleton.md pending
  designs: []
  bounded_contexts: []                          # to be assigned during DDD modelling
  prds: [PRD-001]
  supersedes: null
---

## 1. Objective

> **Problem:** Alumni currently have no structured way to post a job for the chapter that's reviewed before it reaches Actives. Without moderation, postings can be unclear (no scope, no pay), unsafe, or underpaid — and Actives lose trust in the marketplace. Without a structured posting form, the *cost* of posting (cognitive overhead) is high enough to suppress the volume of jobs that would actually be useful.
> **Audience:** Alumni (the posters), Moderators (Alumni with elevated review privileges), Actives (the eventual readers — but not direct users of this PRD's flows).
> **Why now:** This is the first feature on the walking-skeleton critical path. Without a posted, approved job, no other capability (enrollment, completion, payment) can be exercised end-to-end.
> **One-sentence definition of success:** An Alumni can post a structured job; a Moderator can approve or reject it with a reason; an approved job becomes visible to Actives in a deterministic state ready for enrollment (PRD-004).

## 2. Background & context

- **Decomposes:** PRD-001 R-03 (Alumni create job postings with description + dues amount + recommended people count, **no tip field** — Q-06 resolved 2026-05-14) and R-04 (Moderator approval before Actives see the job; rejection captures a reason visible to the posting Alumni).
- **State machine slice owned here:** `posted → awaiting moderation → approved | rejected`. All other transitions (`approved → enrollment-open …` etc.) are owned by downstream PRDs (PRD-004 onward). See §7.2.
- **Tech stack assumed accepted:** ADR-001 (Next.js + tRPC for forms/queries), ADR-003 (tRPC procedures for the domain API; Server Actions only for the posting form if it ships before tRPC wiring), ADR-004 (Postgres + Drizzle for persistence and `drizzle-zod` for the posting-form Zod schema), ADR-005 (Resend for moderator notification + Alumni rejection-reason email).
- **Audit log:** every transition recorded per PRD-001 R-15 (audit log artifact owned by PRD-007).
- **Roles assumed in place:** Alumni, Moderator, Admin partitioned per PRD-001 R-02. Self-service signup and role grants are owned by PRD-003 + PRD-008. This PRD assumes a logged-in user with a known role exists.

## 3. Success metrics *(optional — deferred to PRD-001 §3 + release manifest)*

Posting-volume and time-to-moderation are leading indicators for overall product health, tracked at the PRD-001 level. PRD-002 does not define its own metrics.

## 4. Personas & user scenarios

### 4.1 Personas

Inherited from PRD-001 §4.1 — no new personas introduced.

### 4.2 Scenarios / user stories

PRD-002 owns its own US-NN namespace. Stories trace back to PRD-001 US-03 (Alumni post) and US-04 (Moderator approve/reject).

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As an **Alumni**, I want to post a job with a description, dues amount, and recommended people count, so it can be reviewed and become available to Actives. | P0 |
| US-02 | As an **Alumni**, I want to see all my postings (current and historical) with their states, so I know where each one stands. | P0 |
| US-03 | As an **Alumni**, I want to see the rejection reason on a rejected posting, so I understand what to fix in my next attempt. | P0 |
| US-04 | As a **Moderator**, I want to see all postings currently `awaiting moderation` in a single queue, so I can review them efficiently. | P0 |
| US-05 | As a **Moderator**, I want to approve a posting, so it becomes visible to Actives. | P0 |
| US-06 | As a **Moderator**, I want to reject a posting with a free-text reason, so the Alumni knows what was wrong without having to ask off-app. | P0 |
| US-07 | As a **Moderator**, I want to be notified by email when a new posting is submitted, so I can act promptly without polling the queue. | P0 |

## 5. Requirements

Style: EARS (per `docs/prds/000-template.md` §5 house style). Each R-NN cites the PRD-001 R-NN it decomposes.

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| R-01 | PRD-001 R-03 | The system shall provide a posting form for users with the Alumni role, capturing: description (text, required), dues contribution amount (numeric, required), recommended people count (integer, required). | P0 | US-01 | No tip field per PRD-001 Q-06. Other fields are explicitly out of scope (PRD-001 §7); add via a future PRD if needed. |
| R-02 | PRD-001 R-03 | If the dues contribution amount is not a positive number, the system shall reject the posting submission with a validation error citing the dues field. | P0 | US-01 | Q-02 resolved 2026-05-14. No upper bound. See AC-02, AC-03 + §5.2. |
| R-03 | PRD-001 R-03 | If the description field is empty or contains only whitespace, the system shall reject the posting submission with a validation error citing the description field. | P0 | US-01 | Min length: ≥ 1 non-whitespace character for MVP. Tightening to a more meaningful min (e.g., ≥ 20 chars) deferred to design unless evidence demands. |
| R-04 | PRD-001 R-03 | If the recommended people count is not a positive integer, the system shall reject the posting submission with a validation error citing the count field. | P0 | US-01 | The count is non-binding (PRD-001 R-03 / R-05); recommending zero people is meaningless. |
| R-05 | PRD-001 R-03, R-07, R-15 | When an Alumni submits a valid posting, the system shall create the job record in state `awaiting moderation` and write an audit-log row (per ADR-009) recording the inception transition with the Alumni as actor. | P0 | US-01 | The intermediate `posted` state in PRD-001 R-07 is treated as the transient act of submission — the persisted post-submit state is `awaiting moderation`. The inception audit-log row uses `from_state: null`. |
| R-06 | PRD-001 R-04 | The system shall provide users with the Moderator role a queue view listing all jobs in state `awaiting moderation`, ordered by creation timestamp ascending (oldest-first). | P0 | US-04 | No per-Moderator assignment; no claim-locking on the queue (see §8 assumption). Non-Moderator access returns 403. |
| R-07 | PRD-001 R-04, R-15 | When a Moderator approves a job in state `awaiting moderation`, the system shall transition the job to `approved` via the FSM defined in ADR-008 and record the transition in the audit log with the Moderator as actor. The Moderator may approve a posting they themselves submitted. | P0 | US-05 | Q-03 resolved 2026-05-14: self-approval permitted; the audit log captures actor on every transition, making the pattern inspectable in PRD-007's Admin view. |
| R-08 | PRD-001 R-04, R-15 | When a Moderator rejects a job in state `awaiting moderation`, the system shall require a free-text rejection reason of at least 1 non-whitespace character, transition the job to `rejected` via the FSM, and record the transition in the audit log with the Moderator as actor and the rejection reason captured in the audit-log `note` field. | P0 | US-06 | The rejection reason is the same string surfaced on the rejected-posting view per R-09. |
| R-09 | PRD-001 R-04 | The system shall display the rejection reason to the posting Alumni on the rejected job's detail view. | P0 | US-03 | Read-only. The Alumni cannot edit the reason or any of the posting fields (R-10). |
| R-10 | PRD-001 R-07 | The `rejected` state shall be terminal — the system shall NOT permit any FSM transition out of `rejected` for any actor (Alumni, Moderator, Admin). | P0 | US-03, US-06 | Q-01 resolved 2026-05-14. ADR-008's transitions map MUST NOT contain a `rejected → *` arrow. To retry, the Alumni creates a fresh posting per US-01. |
| R-11 | PRD-001 R-03 | The system shall provide users with the Alumni role a list view of all jobs they posted, in any state, ordered by most-recent-first. | P0 | US-02 | Includes rejected jobs so the Alumni can revisit the rejection reason at any time. |
| R-12 | PRD-001 R-04, R-14 | When an Alumni submits a valid posting (R-05 transition to `awaiting moderation`), the system shall send an email via the platform email provider (ADR-005 — Resend) to the chapter's configured moderators-recipient address (per ADR-010 `chapter_settings.moderators_recipient_email`) notifying that a new posting awaits review. | P0 | US-04, US-07 | Same delivery pattern as PRD-006 R-07 admin-dispute notification. Recipient is a single per-instance distribution address (e.g., `mods@sigoalumni.org`); per-Moderator preferences out of MVP. Surfaced by DESIGN-005 Q-DSG-02 + PLAN-007 Q-PLN-01. |

### 5.1 Acceptance criteria

- **AC-01** — covers R-01, R-05
  - **Given** an Alumni is logged in and on the post-job form
  - **When** they submit with description "Help me move a couch", dues 50, recommended count 2
  - **Then** the system creates the job in state `awaiting moderation` AND writes an audit-log row with `from_state: null, to_state: awaiting moderation, actor_id: <Alumni>, actor_kind: user`.

- **AC-02** — covers R-02
  - **Given** an Alumni is on the post-job form
  - **When** they submit with dues 0
  - **Then** the system rejects the submission with a validation error citing the dues field, AND no job record is created.

- **AC-03** — covers R-02 (negative case)
  - **Given** an Alumni is on the post-job form
  - **When** they submit with dues -5
  - **Then** the system rejects the submission with a validation error citing the dues field.

- **AC-04** — covers R-03
  - **Given** an Alumni is on the post-job form
  - **When** they submit with description "" (empty)
  - **Then** the system rejects the submission with a validation error citing the description field.

- **AC-05** — covers R-04
  - **Given** an Alumni is on the post-job form
  - **When** they submit with recommended people count 0
  - **Then** the system rejects the submission with a validation error citing the count field.

- **AC-06** — covers R-06 (ordering)
  - **Given** there are 3 jobs in state `awaiting moderation`, created at T1 < T2 < T3
  - **When** a Moderator opens the queue view
  - **Then** the queue lists them in order [T1, T2, T3] (oldest-first).

- **AC-07** — covers R-06 (access control)
  - **Given** an Active user (no Moderator role) is logged in
  - **When** they navigate to the moderation queue URL
  - **Then** the system returns 403 Forbidden.

- **AC-08** — covers R-07
  - **Given** a job in state `awaiting moderation` posted by Alumni A
  - **When** Moderator M approves it
  - **Then** the job is in state `approved` AND an audit-log row exists with `from_state: awaiting moderation, to_state: approved, actor_id: M, actor_kind: user`.

- **AC-09** — covers R-07 (self-approval, Q-03)
  - **Given** Moderator M (also having Alumni capability) posts a job, putting it in state `awaiting moderation`
  - **When** M approves their own posting
  - **Then** the system permits the approval; the job is in state `approved`; the audit log shows `actor_id: M`; the job's `posted_by` is also M.

- **AC-10** — covers R-08
  - **Given** a job in state `awaiting moderation`
  - **When** Moderator M rejects it with reason "Dues too low for the scope"
  - **Then** the job is in state `rejected` AND an audit-log row exists with `from_state: awaiting moderation, to_state: rejected, actor_id: M, note: "Dues too low for the scope"`.

- **AC-11** — covers R-08 (validation)
  - **Given** a job in state `awaiting moderation`
  - **When** a Moderator attempts to reject it with an empty reason
  - **Then** the system rejects the moderation action with a validation error AND the job remains in `awaiting moderation`.

- **AC-12** — covers R-09
  - **Given** a job in state `rejected` posted by Alumni A with rejection reason R
  - **When** Alumni A views the job's detail page
  - **Then** the page displays R prominently in a read-only format.

- **AC-13** — covers R-10 (terminal state)
  - **Given** a job in state `rejected`
  - **When** any actor (Alumni A, another Moderator, an Admin) attempts any state transition on the job (approve, edit, repost-as-edit, etc.)
  - **Then** the system rejects the attempt with an FSM-violation error AND the job remains in `rejected`.

- **AC-14** — covers R-11
  - **Given** Alumni A has posted 3 jobs (in states `approved`, `awaiting moderation`, `rejected`)
  - **When** Alumni A views their own postings list
  - **Then** all 3 are shown, in most-recent-first order, with their current state visible.

### 5.2 Examples

**R-02 (dues validation):**

| Input dues | Expected behaviour |
|------------|---------------------|
| 0 | REJECTED (validation error: "Dues amount must be positive.") |
| -10 | REJECTED (validation error: "Dues amount must be positive.") |
| 0.01 | ACCEPTED |
| 50 | ACCEPTED |
| 9999.99 | ACCEPTED (no upper bound enforced) |

**R-04 (recommended count validation):**

| Input count | Expected behaviour |
|-------------|---------------------|
| 0 | REJECTED (validation error: "Recommended people count must be at least 1.") |
| 1 | ACCEPTED |
| 2.5 | REJECTED (validation error: "Recommended people count must be a positive integer.") |
| 50 | ACCEPTED |

**R-05 / R-08 audit-log row shape** (per ADR-009 schema):

```json
{
  "job_id": "9f1a3c8e-...",
  "from_state": "awaiting moderation",
  "to_state": "rejected",
  "actor_id": "5d2b1f4a-...",
  "actor_kind": "user",
  "note": "Description doesn't say where the work would happen.",
  "created_at": "2026-05-14T18:23:11.392Z"
}
```

## 6. User experience

- Mocks: pending
- Flow spec: `docs/flows/walking-skeleton.md` (pending) — owns the happy-path job-loop narrative; this PRD owns the post → approve slice within it.
- UX rules inherited from PRD-001 §6:
  - Mobile-friendly for Alumni (they may post from a phone), desktop-OK for Moderators (queue review is easier on a larger screen).
  - Posting form shows the dues amount and the recommended people count explicitly — no hidden math, no tip field.
  - Static cultural nudge encouraging tipping appears on the job-details view (Q-06 outcome).
  - All transitions are recorded in the audit log (PRD-007 R-NN, pending).
- **Self-approval is permitted** (Q-03). When a Moderator views their own posting in the moderation queue, the approve and reject controls are present without restriction. The audit log records the actor on every transition, so self-approvals are inspectable in PRD-007's Admin view.
- **Rejected-posting view shows the rejection reason prominently** and offers a "Post a new job" CTA that opens a *blank* form (Q-01). No edit-in-place affordance, no clone-and-pre-fill — the new posting starts from scratch, with its own ID and audit trail.
- **Posting-form validation runs client-side as the user types** (e.g., "must be positive" on the dues field), to avoid confusing post-submit errors. Server-side validation (the EARS unwanted-behaviour rules R-02..R-04) is the source of truth; client-side is a UX courtesy only.
- **Moderation queue ordering: oldest-first.** Postings that have waited longest get reviewed first, reducing the worst-case wait. (Reversible if Moderators ask for newest-first or "by Alumni" later.)

## 7. Scope boundaries

### 7.1 Non-goals

- This PRD does **not** cover anything past `approved` in the job state machine (enrollment, locking, completion, payment, dispute, closure). Those belong to PRD-004 through PRD-006.
- This PRD does **not** define the moderation queue's Admin-view aggregate counts — that's PRD-007.
- This PRD does **not** introduce a tip field, tip percentage, or any tip-related UI element (Q-06 resolved 2026-05-14 in PRD-001).
- This PRD does **not** support job templates, drafts that span sessions, or scheduled-publish — out of MVP scope unless evidence demands.
- This PRD does **not** allow volunteer / $0-dues postings. Every posting requires a positive dues contribution amount (Q-02 resolved 2026-05-14). The product's value proposition is routing dues to the chapter; help-without-dues belongs in the chapter's group chat, not here. Reversible — relaxing this later is a single-requirement change.
- This PRD does **not** allow editing or resubmitting a rejected posting. `rejected` is terminal; the Alumni reads the rejection reason and creates a fresh posting from scratch (Q-01 resolved 2026-05-14). No `rejected → posted` state transition; no edit affordance on the rejected view; no clone-and-edit. The fresh posting carries its own ID and starts a new audit trail.

### 7.2 DO NOT CHANGE *(scope-locks owned by other PRDs/ADRs)*

| Concern | Owned by | Reason it's locked |
|---------|----------|---------------------|
| Auth, session, role enforcement | PRD-003 + ADR-002, ADR-007 | Identity is its own bounded context. This PRD's procedures *consume* the current-user/role context. |
| Role partition (privileged vs non-privileged) and role-change capability | PRD-008 (Role management) | Role transitions are not this PRD's concern. |
| Job state machine transitions outside `posted → awaiting moderation → approved \| rejected` | PRD-004, PRD-005, PRD-006 | Cross-PRD state-machine drift is the main risk of decomposition. |
| Audit-log persistence and Admin-view surfacing | PRD-007 | This PRD *records* transitions per PRD-001 R-15; it does not implement the log itself. |
| Email provider configuration, suppression, webhook handling | ADR-005 | This PRD *uses* Resend for two emails (moderator-queue and rejection-reason); it doesn't own provider plumbing. |

## 8. Assumptions & dependencies

- **Assumption:** The set of fields settled in PRD-001 R-03 (description, dues amount, recommended people count) is sufficient for MVP postings. — *if false:* expand R-NN coverage in Phase 5; revisit PRD-001 R-03 if the new field is product-shape, not just decomposition.
- **Assumption:** A single Moderator queue (chapter-wide) is sufficient — no per-Moderator assignment, no claim-locking on the queue. — *if false:* introduce queue-claim semantics; impacts §5 requirement set.
- **Assumption:** The chapter has at least one Moderator at all times. — *if false:* postings sit in `awaiting moderation` indefinitely; surfaced to Admin via PRD-007 dashboard. No SLA in MVP.
- **Depends on:** PRD-003 (Identity & Access) for authenticated session + role context.
- **Depends on:** PRD-008 (Role management) for the Moderator role's existence and assignment mechanics.
- **Depends on:** PRD-007 (Admin view) for surfacing of jobs stuck in `awaiting moderation`.
- **Depends on:** Domain model (`docs/domain-driven-design/`) — bounded-context placement of "Job posting" pending DDD modelling.

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | ~~Should rejected jobs be re-postable as edits (preserves discussion + history) or only as new postings (simpler, no edit-vs-resubmit ambiguity)?~~ **Resolved 2026-05-14: new posting only.** `rejected` is a terminal state alongside `closed` / `cancelled` — no revival transition. Alumni reads the rejection reason on the rejected posting's view, then creates a fresh posting (no pre-fill). Considered-and-rejected: edit-and-resubmit (state-machine + audit-log churn for an MVP edge case) and clone-and-edit (real complexity for a use case we have no evidence will be common). | Product | ✅ Resolved 2026-05-14 |
| Q-02 | ~~What's the floor for the dues-amount field? $0 allowed (volunteer postings) or > $0 enforced?~~ **Resolved 2026-05-14: > $0 enforced.** Posting requires a positive dues amount. Volunteer / $0 postings are explicitly out of scope (§7.1) — chapter group chats serve that need. Reflected as a forthcoming EARS unwanted-behaviour R-NN in §5 during Phase 5 drafting. | Product | ✅ Resolved 2026-05-14 |
| Q-03 | ~~When a Moderator approves their own posting (Moderators are Alumni), is that allowed, gated, or auto-approved?~~ **Resolved 2026-05-14: allowed without restriction.** Moderators may approve their own postings. The audit log per ADR-009 captures actor on every transition, making "self-approval" computable as `actor_id == job.posted_by` and surfaceable in PRD-007's Admin view if a pattern emerges. Considered-and-rejected: 4-eyes gating (creates a bootstrap problem when a chapter has only 1 Moderator — no min-Mod invariant in PRD-001 R-16) and auto-approve (overshoots — removes the Mod's optional self-review step). | Product | ✅ Resolved 2026-05-14 |

## 10. Release plan

- **Walking skeleton:** the bare ability to POST a job → see it in a Moderator queue → APPROVE it → confirm it's queryable as `approved`. Single happy path; no rejection flow, no email notifications.
- **MVP:** full P0 set including rejection-with-reason, email notifications to Moderators on new posting and to Alumni on rejection, posting-form validation per Q-02, edit-vs-new policy per Q-01.
- **Post-MVP:** templates, drafts, scheduled-publish (currently §7.1 non-goals).
- **Rollout:** ships as part of the MVP release manifest at `docs/releases/001-mvp.md`. No feature flag.
- **Reversibility:** posting and moderation are pure DB writes; revertible by deleting rows or rolling back migrations. No external integrations to unwind beyond Resend email sends (idempotent and cheap to suppress).

## 11. Glossary changes

No new terms anticipated for this PRD. The terms it uses (Alumni, Moderator, Job/TODO, Dues contribution, Recommended people count) are seeded in `docs/domain-driven-design/003-ubiquitous-language.md` as T-02, T-03, T-05, T-07, T-08.

## 12. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial scaffold. Repurposed file (was the abandoned PRD-002 "MVP scope" mega-doc). Frontmatter, §1 objective, §2 background, §7.2 scope-locks, §10 release-plan skeleton. §5 requirements + ACs + examples + §4.2 stories deferred to Phase 5 decomposition. Three open questions (Q-01..Q-03) seeded for Phase 5 discussion. |
| 2026-05-14 | Tom Haynes | **Q-02 resolved: > $0 dues amount enforced** at posting time. Added §7.1 non-goal banning volunteer / $0 postings. EARS unwanted-behaviour requirement to be drafted in §5 during full Phase 5 decomposition (will read approximately: *"If the dues contribution amount is not a positive number, the system shall reject the posting submission with a validation error citing the field."*) |
| 2026-05-14 | Tom Haynes | **Q-01 resolved: rejection is terminal; new posting required to retry.** Added §7.1 non-goal banning edit-and-resubmit and clone-and-edit. Confirms ADR-008's transitions map does NOT include a `rejected → posted` (or `→ awaiting moderation`) revival arrow. ACs in §5.1 will verify rejected postings have no edit / resubmit affordance. |
| 2026-05-14 | Tom Haynes | **Q-03 resolved: Moderator self-approval permitted without restriction.** Audit log per ADR-009 captures actor on every transition; self-approval inspectable in PRD-007's Admin view. Considered-and-rejected: 4-eyes gating (bootstrap problem with 1-Mod chapters) and auto-approve (overshoots). Added a §6 UX rule for the self-approval UI and reflected in R-07. |
| 2026-05-14 | Tom Haynes | **§5 drafted: 11 R-NN (EARS), 14 ACs (Given/When/Then), §5.2 examples for R-02/R-04 validation + R-05/R-08 audit-log row shape.** §4.2 user stories US-01..US-06 added. §6 UX rules expanded with 4 MVP-specific rules covering self-approval, rejected-view CTA, client-side validation, and queue ordering. §5 still subject to PRD-002-level review pass before promotion to Proposed. |
