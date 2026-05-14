---
id: PRD-007
title: Admin view & audit log
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
size: M
related:
  parent_prd: PRD-001
  parent_requirements: [R-13, R-14, R-15]
  adrs: [ADR-001, ADR-003, ADR-004, ADR-005]
  flows: []
  designs: []
  bounded_contexts: []
  prds: [PRD-001, PRD-002, PRD-004, PRD-005, PRD-006]
  supersedes: null
---

## 1. Objective

> **Problem:** Admins need a single place to monitor chapter health, drill into disputes, configure instance-level settings, and trace why a job ended up in any particular state — without scrolling through Alumni/Active views.
> **Audience:** Admins (sole readers).
> **Why now:** This PRD owns the audit-log capability that every other PRD's state transitions depend on for observability. It cannot be deferred.
> **One-sentence definition of success:** An Admin can open one screen and see job-state aggregates, the full list of disputed jobs with drill-in to per-job audit history, and a section for advanced instance settings (treasurer/admin recipient addresses, etc.).

## 2. Background & context

- **Decomposes:** PRD-001 R-13 (Admin view: aggregates + dispute drill-in + advanced settings + audit-log surfacing), R-14 (admin distro + treasurer email recipient configuration), R-15 (per-job state-transition audit log).
- **Cross-cutting role:** every other PRD's state-transition R-NN *records* into the audit log defined here. This PRD owns the audit-log capability itself.
- **Tech stack:** ADR-001/003/004; ADR-005 for the email recipient configuration.
- **Admin-only.** Any non-Admin trying to access the Admin view gets a 403.

## 3. Success metrics *(deferred to PRD-001)*

## 4. Personas & user scenarios

### 4.1 Personas

Inherited from PRD-001 §4.1.

### 4.2 Scenarios / user stories

*(TBD Phase 5; traces to PRD-001 US-12, US-13.)*

## 5. Requirements

*(TBD Phase 5. Decomposes R-13, R-14, R-15.)*

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| *(TBD)* | | | | | |

### 5.1 Acceptance criteria

*(TBD)*

### 5.2 Examples

*(TBD — example aggregate-counts payload, example audit-log entry.)*

## 6. User experience

- Mocks: pending
- UX rules: Admin view is a separate route (e.g., `/admin`), not a panel inside Active/Alumni views; aggregate counts are clickable into filtered job lists; per-job audit log is a chronological table.
- *(MVP-specific UX rules drafted Phase 5.)*

## 7. Scope boundaries

### 7.1 Non-goals

- Per-Admin notification preferences (PRD-001 R-14 notes this as out of MVP).
- Audit-log search/query DSL — chronological view only for MVP.
- Admin view for Moderators (Moderator queue is owned by PRD-002, not here).
- Cross-chapter Admin view (single-tenant per PRD-001 R-11).

### 7.2 DO NOT CHANGE

| Concern | Owned by | Reason |
|---------|----------|--------|
| State-machine transition logic itself | PRD-002, PRD-004, PRD-005, PRD-006 | This PRD *displays* state — it doesn't drive transitions. |
| Role partition and grant mechanics | PRD-003 + PRD-008 | Admin role definition and grant. |
| Communication channel between Active/Alumni | PRD-009 (when defined) | Separate UI surface. |

## 8. Assumptions & dependencies

- **Assumption:** Aggregate counts can be computed from a live SQL query — no pre-computed materialised view needed for MVP scale (one chapter, low job volume). — *if false:* introduce caching layer; out of MVP.
- **Assumption:** Treasurer + Admin recipient addresses are editable via the Admin view (rather than env-var only). Lean: yes for MVP, settable in advanced settings. — *if false:* env-var only and the "advanced settings" section is empty for MVP.
- **Depends on:** PRD-002, PRD-004, PRD-005, PRD-006 (the state machines whose transitions are surfaced here).

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | What goes in "advanced settings" for MVP beyond the two recipient addresses? | Product | Phase 5 |
| Q-02 | Should audit log retention have a cap (e.g., 12 months) or be append-forever? | Product | Phase 5 |
| Q-03 | Aggregate counts as live SQL vs. cached count — pick lean live for MVP, confirm? | Design | Phase 5 |

## 10. Release plan

- **Walking skeleton:** the audit-log table exists and is being written to by every state transition; Admin view shows the latest 50 rows for one job. No aggregates, no settings UI yet.
- **MVP:** full P0 set including aggregates, dispute drill-in, advanced settings, per-job audit timeline.
- **Post-MVP:** audit-log search, retention policy, admin notification preferences.

## 11. Glossary changes

No new terms. Uses Audit log (T-14), Admin recipient (T-13), Treasurer recipient (T-12).

## 12. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial scaffold. §5 deferred to Phase 5. |
