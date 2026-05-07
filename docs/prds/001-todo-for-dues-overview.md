---
id: PRD-001
title: TODO for Dues — product overview
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-06
last_updated: 2026-05-06
related:
  adrs: [ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006]   # web framework, auth, API contract, DB, email, hosting — all Proposed
  flows: []             # docs/flows/walking-skeleton.md pending
  designs: []
  supersedes: null
---

## 1. Objective

> **Problem:** Fraternity and sorority Actives often struggle to pay chapter dues, while Alumni frequently have small jobs they're willing to pay someone to handle. Today these two needs are coordinated ad-hoc (group chats, word-of-mouth) with no structure around fair pay, dues delivery, or proof of completion.
> **Audience:** Greek-letter fraternal organizations and their Active members, Alumni members, Moderators, and Admins.
> **Why now:** Rising dues plus an alumni network already willing to help — a structured marketplace converts latent willingness into reliable dues payments.
> **One-sentence definition of success:** An Active completes an Alumni-posted job and a dues payment lands at their chapter through the app, end-to-end, with both sides acknowledging the loop is closed.

## 2. Background & context

- The product name "TODO for Dues" reads as: the *TODO* is the job an Alumni needs done; *for Dues* means the Active does it to fund their chapter dues.
- Dues are paid directly from the Alumni to the chapter (Venmo for the launch chapter). The app does **not** custody money or process payments — it coordinates work and tracks state.
- The product targets a niche where social trust is high (members of the same fraternal organization), reducing the need for heavy escrow/dispute machinery in the MVP.
- One instance of the SaaS is hosted per fraternal organization (chapter scope vs. national-org scope is open — see Q-01).
- Tech stack is captured across ADR-001 through ADR-006 — web framework, auth, API contract, DB + ORM, email, hosting — all Proposed. This PRD makes no implementation choices.

## 3. Success metrics

Targets are directional for this overview PRD; the MVP-scope PRD will commit to specific numbers and measurement plans.

| Metric | Type | Baseline | Target | How measured |
|--------|------|----------|--------|--------------|
| Chapters onboarded | lagging | 0 | 1 (MVP), 5 (next quarter) | Manual count of deployed instances |
| Jobs posted per active month / chapter | leading | 0 | ≥ 5 | DB query |
| Job completion rate (claimed → paid + acknowledged) | leading | n/a | ≥ 70% | DB query |
| Dollars routed toward dues per chapter / month | lagging | $0 | ≥ $500 | Sum of marked-paid jobs |
| Time from job posted → Active claimed | leading | n/a | ≤ 48h median | Event timestamps |

## 4. Personas & user scenarios

### 4.1 Personas

- **Active** — current undergraduate member of a chapter who pays dues. Wants to reduce out-of-pocket cost. Phone-first; limited time between class and work.
- **Alumni** — past member who posts jobs. Wants chapter support and help with small tasks. May live anywhere. (Used as a role label; refers to one or more past members regardless of grammatical singular/plural — see glossary.)
- **Moderator** — Alumni with elevated privileges to review and approve job postings.
- **Admin** — chapter staff with elevated privileges to escalate roles and manage the instance.
- **(Indirect) Chapter / National Organization** — the recipient of dues payments. Not a system user in the MVP; relevant for compliance and scope.

### 4.2 Scenarios / user stories

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As an **Admin**, I want to invite members via a shareable link, so that signup is gated to my chapter without per-user emails. | P0 |
| US-02 | As a new user, I want to claim my role (Active or Alumni) at signup, so that I see the right view of the app. | P0 |
| US-03 | As an **Alumni**, I want to post a job with a dues contribution amount and minimum tip percentage, so that an Active understands the pay before claiming. | P0 |
| US-04 | As a **Moderator**, I want to review and approve or reject job postings, so that unclear, unsafe, or underpaid postings don't reach Actives. | P0 |
| US-05 | As an **Active**, I want to browse approved jobs and claim one, so that I can start work and earn toward my dues. | P0 |
| US-06 | As an **Active** and **Alumni** matched on a job, I want to contact each other through the app, so that we can work out details (location, timing). | P0 |
| US-07 | As an **Alumni**, I want to mark the job complete and indicate the dues payment has been sent, so that the Active knows to expect it. | P0 |
| US-08 | As an **Active**, I want to confirm that the dues payment has been received, so that the loop is closed and recorded. | P0 |
| US-09 | As an **Admin**, I want to change any user's role across {Active, Alumni, Moderator, Admin}, so that the org can self-govern and accommodate role transitions (graduations, escalations, departures). | P0 |
| US-10 | As any user, I want to authenticate via my organization's SSO when present, so that I don't manage another password. | P1 |

## 5. Requirements

This is the overview PRD: requirements are stated at capability level. Subsequent PRDs (e.g., MVP scope, individual features) decompose them into testable feature requirements with acceptance criteria.

| ID | Requirement | Priority | Linked stories | Notes |
|----|-------------|----------|----------------|-------|
| R-01 | The system shall provide invite-link-based signup gated to a single fraternal-organization instance. | P0 | US-01, US-02 | Discord-style: link is sufficient credential to begin signup; per-instance scope. |
| R-02 | The system shall support roles {Active, Alumni, Moderator, Admin}, with self-selected primary role and Admin-escalated privileged roles. | P0 | US-02, US-09 | Moderator and Admin require existing-Admin escalation. No self-escalation. |
| R-03 | The system shall let Alumni create job postings with description, dues contribution amount, and minimum tip percentage. | P0 | US-03 | Other fields TBD in MVP PRD. |
| R-04 | The system shall require Moderator approval before a job is visible to Actives. | P0 | US-04 | Rejection captures a reason that's visible to the posting Alumni. |
| R-05 | The system shall let Actives browse approved jobs and claim one. | P0 | US-05 | Single-Active-per-job in MVP; multi-claim deferred. |
| R-06 | The system shall provide an in-app communication channel between the matched Alumni and Active for a given job. | P0 | US-06 | Mechanism (DM, comments, contact reveal) decided in design. |
| R-07 | The system shall track per-job state across {posted, awaiting moderation, approved, claimed, completed, payment-sent, payment-received, closed} including rejection and cancellation paths. | P0 | US-03 – US-08 | Single state machine, source of truth for the loop. |
| R-08 | The system shall record the dues payment as sent (by Alumni) and received (by Active) without itself processing the payment. | P0 | US-07, US-08 | Payment medium is external (Venmo for MVP). |
| R-09 | The system shall allow Admins to change any user's role across {Active, Alumni, Moderator, Admin}. | P0 | US-09 | Role-change history is auditable. Self-service transitions are out of scope (Admin-only). See Q-08 for Admin self-protection edge cases. |
| R-10 | The system shall support OIDC SSO as an alternative to app-managed accounts. | P1 | US-10 | App-managed accounts ship first. |
| R-11 | The system shall be deployable as a single-tenant instance per fraternal organization. | P0 | — | One instance == one organization (chapter or national — see Q-01). |

### 5.1 Acceptance criteria

This overview PRD does not enumerate ACs — they belong in scoped PRDs (MVP, individual features). The walking-skeleton flow spec (`docs/flows/walking-skeleton.md`, pending) will own the first round of testable ACs.

## 6. User experience

- Mocks: pending
- Flow spec: `docs/flows/walking-skeleton.md` (pending — will cover the happy-path job loop end-to-end)
- States to cover (per job): unposted, awaiting moderation, approved/listed, claimed, in-progress, completed (Alumni-marked), payment-sent, payment-received/closed, rejected, cancelled.
- UX rules:
  - Mobile-first for Actives; desktop-OK for Alumni and Moderators.
  - Job pricing must always show *dues contribution + minimum tip %* explicitly — no hidden math.
  - Loop closure is two-sided: neither party can unilaterally mark the job "closed."

## 7. Non-goals (explicitly not doing)

- The app **does not** custody, escrow, or process payments. Money flows externally (Venmo for MVP) directly between Alumni and the chapter.
- The app **does not** verify identity of Alumni beyond chapter-controlled invitation.
- The app **does not** mediate disputes in MVP — disputes are surfaced to Admins out-of-band.
- The app **does not** support cross-chapter or cross-organization marketplaces. Each instance is single-org.
- The app **does not** offer 1099/tax reporting in MVP.
- The app **does not** provide a generic CRM/HR feature set for chapter management.

## 8. Assumptions & dependencies

- **Assumption:** Trust within a fraternal organization is high enough that lightweight Alumni-Moderator review is sufficient for MVP. — *if false:* introduce stronger verification or dispute flows.
- **Assumption:** Venmo is an acceptable dues channel for the launch chapter. — *if false:* ADR for payment channel; potentially add Zelle, ACH, or a processor like Stripe.
- **Assumption:** One SaaS instance per fraternal organization is the right tenancy model. — *if false:* re-architect for multi-tenant; affects auth, data model, and deployment.
- **Assumption:** Alumni reliably mark payments as sent and Actives reliably confirm receipt. — *if false:* introduce reconciliation, reminders, or third-party payment confirmation.
- **Depends on:** ADR-001 through ADR-006 (web framework, auth, API contract, DB + ORM, email, hosting) — all Proposed.
- **Depends on:** Domain model (`docs/domain/`) — pending.

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | Is "one instance per organization" at the chapter level (a single chapter at a single university) or the national-org level? Affects branding, billing, tenancy, and moderation scope. | Product | Before MVP PRD |
| Q-02 | What's the legal/regulatory posture of facilitating money flow we don't custody? Especially around members under 18 and transfers labeled as dues. | Product / Legal | Before launch |
| Q-03 | How are Alumni initially seeded into a new instance? Admin imports a roster, self-claim via verified email, or invite-link only? | Product | Before MVP PRD |
| Q-04 | What happens if an Alumni marks a job paid but the Active never receives funds? Dispute path? | Product | Before MVP PRD |
| Q-05 | Should jobs support multiple Actives (a team task with split dues)? Defer or include in MVP? | Product | Before MVP PRD |
| Q-06 | Tip handling: is the tip paid to the Active personally (separate from dues), or does it also flow to the chapter? Tax/clarity implications. | Product | Before MVP PRD |
| Q-07 | Communication channel: in-app DM vs. revealing phone numbers vs. linking out to existing platforms (e.g., GroupMe). | Product / Design | Before MVP design |
| Q-08 | What constraints prevent an Admin from accidentally or maliciously demoting all other Admins, leaving the instance without one? Options: enforce a "minimum one Admin" invariant; require N≥2-Admin confirmation for Admin demotions; out of scope for MVP (operator restores via env-var bootstrap). | Product | Before MVP PRD |

## 10. Release plan

- **Phasing:**
  1. Walking skeleton — single chapter, app-managed accounts, manual moderation, full job loop end-to-end.
  2. MVP — same scope plus polish, role-escalation UX, and in-app notifications.
  3. Post-MVP — OIDC SSO, multi-instance deployment automation, Docker packaging.
- **Rollout:** First instance deployed for the launch chapter privately; expand chapter-by-chapter on request.
- **Reversibility:** No external integrations to unwind in MVP (no payment-processor lock-in). Per-instance deploys can be torn down independently.

## 11. Glossary alignment

These terms are introduced by this PRD and need to land in `docs/domain/glossary.md`:

- **Active** — current undergraduate member of a chapter who pays dues.
- **Alumni** — past member of a chapter who may post jobs. Used as a role label in this product; refers to one or more past members regardless of grammatical number, deliberately gender-neutral (preferred over Alumnus / Alumna / Alumnae).
- **Moderator** — Alumni with elevated privileges to review and approve job postings.
- **Admin** — chapter staff with elevated privileges to escalate roles and manage the instance.
- **Job (TODO)** — a unit of work an Alumni posts; the central domain entity.
- **Dues** — periodic payment owed by an Active to the chapter / national organization.
- **Dues contribution** — the portion of a job's pay an Alumni directs toward the Active's dues.
- **Tip** — additional pay above the dues contribution; minimum percentage set by the Alumni at posting.
- **Chapter** — a single local instance of a Greek-letter organization (e.g., one university's chapter).
- **Fraternal organization** — generic term covering both fraternities and sororities.
- **Loop closure** — the two-sided acknowledgement that a job is complete and dues have been received.

## 12. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-06 | Tom Haynes | Initial draft from product overview discussion. |
| 2026-05-06 | Tom Haynes | Linked ADR-001 (web framework, Proposed); noted ADRs 002–006 pending for the rest of the stack. |
| 2026-05-06 | Tom Haynes | Broadened R-09 / US-09 from "escalate roles" to "change any user's role"; added Q-08 on Admin self-protection. Captured during ADR-002 (auth) discovery. |
| 2026-05-06 | Tom Haynes | Linked ADR-002 (auth, Proposed). |
| 2026-05-06 | Tom Haynes | Linked ADR-003 (API contract, Proposed). |
| 2026-05-06 | Tom Haynes | Linked ADR-004 (DB + ORM, Proposed). |
| 2026-05-06 | Tom Haynes | Linked ADR-005 (email, Proposed). |
| 2026-05-07 | Tom Haynes | Linked ADR-006 (hosting, Proposed). All six tech-stack ADRs now Proposed. |
