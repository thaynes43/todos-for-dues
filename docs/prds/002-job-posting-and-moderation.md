---
id: PRD-002
title: Job posting & moderation
status: Draft
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

*(To be drafted during Phase 5 decomposition. Will trace back to PRD-001 US-03, US-04 with this PRD's own US-NN namespace.)*

| ID | Story | Priority |
|----|-------|----------|
| *(TBD)* | | |

## 5. Requirements

*(To be drafted during Phase 5 decomposition. Each R-NN cites a PRD-001 R-NN in the `Decomposes` column. Targets: ~6–10 R-NN total for this PRD; if growing beyond ~15, that's a signal to split.)*

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| *(TBD)* | | | | | |

### 5.1 Acceptance criteria

*(TBD — Given/When/Then, drafted alongside each requirement.)*

### 5.2 Examples

*(TBD — concrete inputs/outputs for the posting form's validation rules and the rejection-reason flow.)*

## 6. User experience

- Mocks: pending
- Flow spec: `docs/flows/walking-skeleton.md` (pending) — owns the happy-path job-loop narrative; this PRD owns the post → approve slice within it.
- UX rules inherited from PRD-001 §6:
  - Mobile-friendly for Alumni (they may post from a phone), desktop-OK for Moderators (queue review is easier on a larger screen).
  - Posting form shows the dues amount and the recommended people count explicitly — no hidden math, no tip field.
  - Static cultural nudge encouraging tipping appears on the job-details view (Q-06 outcome).
  - All transitions are recorded in the audit log (PRD-007 R-NN, pending).
- *(MVP-specific UX rules to be drafted in Phase 5.)*

## 7. Scope boundaries

### 7.1 Non-goals

- This PRD does **not** cover anything past `approved` in the job state machine (enrollment, locking, completion, payment, dispute, closure). Those belong to PRD-004 through PRD-006.
- This PRD does **not** define the moderation queue's Admin-view aggregate counts — that's PRD-007.
- This PRD does **not** introduce a tip field, tip percentage, or any tip-related UI element (Q-06 resolved 2026-05-14 in PRD-001).
- This PRD does **not** support job templates, drafts that span sessions, or scheduled-publish — out of MVP scope unless evidence demands.

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
| Q-01 | Should rejected jobs be re-postable as edits (preserves discussion + history) or only as new postings (simpler, no edit-vs-resubmit ambiguity)? | Product | Phase 5 |
| Q-02 | What's the floor for the dues-amount field? $0 allowed (volunteer postings) or > $0 enforced? | Product | Phase 5 |
| Q-03 | When a Moderator approves their own posting (Moderators are Alumni), is that allowed, gated, or auto-approved? | Product | Phase 5 |

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
