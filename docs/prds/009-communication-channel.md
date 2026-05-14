---
id: PRD-009
title: Communication channel
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
size: S
related:
  parent_prd: PRD-001
  parent_requirements: [R-06]
  adrs: [ADR-001, ADR-003, ADR-004]
  flows: []
  designs: []
  bounded_contexts: []
  prds: [PRD-001]
  supersedes: null
---

## 1. Objective

> **Problem:** Once an Active is enrolled in a job, the Active and Alumni need to coordinate practical details (location, timing, materials) without falling back to whatever ad-hoc channel they happen to share — or worse, having no shared channel at all.
> **Audience:** Active (matched on a job), Alumni (poster of the job).
> **Why now:** **This PRD is intentionally Draft and blocked.** PRD-001 Q-07 (in-app DM vs. phone reveal vs. linking out to an existing platform like GroupMe) is unresolved. PRD-009 will not progress beyond scaffold until Q-07 lands.
> **One-sentence definition of success:** Once Q-07 is resolved, an Active and Alumni matched on a job can reach each other through a coordination channel the chapter trusts, without leaving the app's context entirely.

## 2. Background & context

- **Decomposes:** PRD-001 R-06 (in-app communication channel between matched Alumni and Active).
- **Blocked by:** PRD-001 Q-07. The mechanism choice is contested and has product, design, and privacy implications.
- **Tech stack assumed accepted** *(provisional — depends on Q-07 outcome)*: ADR-001/003/004. New ADR may be required if a third-party channel (GroupMe link, SMS) is chosen.

## 3. Success metrics *(deferred)*

## 4. Personas & user scenarios

### 4.1 Personas

Inherited from PRD-001 §4.1.

### 4.2 Scenarios / user stories

*(TBD post Q-07.)*

## 5. Requirements

*(TBD post Q-07. Decomposes R-06.)*

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| *(TBD)* | | | | | |

### 5.1 Acceptance criteria

*(TBD)*

## 6. User experience

- Mocks: pending Q-07
- UX rules: TBD post Q-07.

## 7. Scope boundaries

### 7.1 Non-goals

- Cross-job persistent DM (Active ↔ Alumni outside the context of a specific job) — never in scope.
- Group chat across all enrolled Actives + Alumni for a job — defer until Q-07 outcome justifies.

### 7.2 DO NOT CHANGE

| Concern | Owned by | Reason |
|---------|----------|--------|
| Identity & contact info | PRD-003 | Phone/email reveal mechanics depend on identity. |
| Job state machine | PRD-002, PRD-004, PRD-005, PRD-006 | Communication doesn't drive state. |

## 8. Assumptions & dependencies

- **Hard dependency:** PRD-001 Q-07 must land before PRD-009 can move past scaffold.
- **Assumption:** Whatever mechanism is chosen, it must work for an enrolled Active to reach the Alumni at any time between enrollment and closure. — *if false:* the mechanism choice is wrong.

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | All inherited from PRD-001 Q-07 — see parent. | Product | Before MVP design |

## 10. Release plan

- **MVP:** TBD post Q-07. May not ship in MVP at all if the mechanism chosen is "link out to existing chapter platform."
- **Post-MVP:** likely the more complex options (in-app DM with notifications) if MVP picks the simpler one.

## 11. Glossary changes

No new terms anticipated until Q-07 lands.

## 12. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial scaffold; intentionally minimal. PRD-009 cannot progress past this until PRD-001 Q-07 (communication channel mechanism) is resolved. |
