---
id: PRD-006
title: Loop closure & dispute
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
size: S
related:
  parent_prd: PRD-001
  parent_requirements: [R-08, R-12, R-14]      # R-08 receipt confirmation; R-12 dispute; R-14 (a) admin distro email
  adrs: [ADR-001, ADR-003, ADR-004, ADR-005]
  flows: []
  designs: []
  bounded_contexts: []
  prds: [PRD-001, PRD-005]
  supersedes: null
---

## 1. Objective

> **Problem:** A `payment-sent` job needs to either close (the chapter received the dues) or surface a dispute (something went wrong) — and the closure-confirming role must be permissive enough to fit a trust-based culture without overcomplicating the model.
> **Audience:** Actives (close or dispute), Admins (close, dispute, or resolve). Treasurer is a notification recipient only.
> **Why now:** Final feature on the walking-skeleton critical path. Without closure, the job loop never terminates.
> **One-sentence definition of success:** Either an enrolled Active or any Admin can transition a `payment-sent` job to `closed` (loop closure) or `disputed` (with a free-text reason); the dispute path emails the Admin recipient and is resolvable by an Admin.

## 2. Background & context

- **Decomposes:** PRD-001 R-08 (receipt confirmation by Active or Admin), R-12 (Active or Admin dispute with reason), R-14 (a) (Admin-recipient email on dispute).
- **State machine slice owned here:** `payment-sent → closed | disputed → closed | cancelled | payment-sent`. The Admin-resolution path back out of `disputed` is part of this PRD.
- **Tech stack:** ADR-001/003/004; ADR-005 for dispute email via Resend.
- **Trust model:** Q-04 resolved 2026-05-14 — out-of-band escalation with in-app signal. No in-app dispute conversation, no two-sided escrow ceremony.

## 3. Success metrics *(deferred to PRD-001)*

## 4. Personas & user scenarios

### 4.1 Personas

Inherited from PRD-001 §4.1.

### 4.2 Scenarios / user stories

*(TBD Phase 5; traces to PRD-001 US-08, US-11, US-13.)*

## 5. Requirements

*(TBD Phase 5. Decomposes R-08 receipt subset, R-12, R-14 a.)*

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| *(TBD)* | | | | | |

### 5.1 Acceptance criteria

*(TBD)*

### 5.2 Examples

*(TBD — dispute reason captured as free text; example of Admin resolution note.)*

## 6. User experience

- Mocks: pending
- UX rules: closure is a single click for Active or Admin; dispute requires a reason; Admin sees disputed jobs in the Admin view (PRD-007) and can transition them out via in-line action.
- *(MVP-specific UX rules drafted Phase 5.)*

## 7. Scope boundaries

### 7.1 Non-goals

- No in-app dispute conversation, structured rebuttal flow, or auto-refund (PRD-001 §7).
- No per-Active payment-receipt tracking — confirmation is single-shot for the job (PRD-001 §7).

### 7.2 DO NOT CHANGE

| Concern | Owned by | Reason |
|---------|----------|--------|
| The `locked → completed → payment-sent` transitions | PRD-005 | Upstream. |
| Admin-recipient address provisioning | PRD-007 + design | This PRD uses the configured address. |
| Audit log persistence | PRD-007 | Records here, surfaces there. |
| Role grants and partition (who counts as Admin) | PRD-003 + PRD-008 | Identity / role plumbing. |

## 8. Assumptions & dependencies

- **Assumption:** A single `disputed` state is enough — no "disputed-pending-info" or "disputed-resolved-but-not-closed" sub-states. — *if false:* expand state machine here.
- **Assumption:** Active doesn't need to be the *enrolled-and-attended* Active to dispute — any *enrolled* Active can dispute. — *if false:* tighten to Alumni-confirmed-attendee only.
- **Depends on:** PRD-005 (a `payment-sent` job exists).
- **Depends on:** PRD-007 for Admin-recipient address + dispute drill-in UI.

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | When an Admin transitions a `disputed` job back to `payment-sent`, should it require a resolution note (audit-log captured)? Lean: yes. | Product | Phase 5 |
| Q-02 | Should the dispute notification email batch (one email per N disputes) or fire one per dispute? Lean: one per dispute, MVP-scale. | Product / Design | Phase 5 |

## 10. Release plan

- **Walking skeleton:** Active confirms received → job closes. (No dispute flow.)
- **MVP:** full P0 set including dispute, admin email, admin in-app resolution.
- **Post-MVP:** automatic reminders before auto-close (if we ever introduce one).

## 11. Glossary changes

No new terms. Uses Loop closure (T-17), Admin recipient (T-13), Audit log (T-14).

## 12. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial scaffold. §5 deferred to Phase 5. |
