---
id: PRD-001
title: TODOs for Dues — product overview
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-06
last_updated: 2026-05-14
related:
  adrs: [ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007]   # web framework, auth, API contract, DB, email, hosting — all Proposed; ADR-007 Google Workspace OIDC
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

- The product name "TODOs for Dues" reads as: a *TODO* is a job an Alumni posts; *for Dues* means an Active completes TODOs to fund their chapter dues.
- Dues are paid directly from the Alumni to the chapter (Venmo for the launch chapter). The app does **not** custody money or process payments — it coordinates work and tracks state.
- The product targets a niche where social trust is high (members of the same fraternal organization), reducing the need for heavy escrow/dispute machinery in the MVP.
- One instance of the SaaS is hosted per **chapter** (resolved 2026-05-14, Q-01). Launch chapter: Sigma Phi Omicron at UMass Lowell. National-org-level aggregation, if ever needed, is a separate higher-level system that integrates with chapter instances — not a tenancy mode of this product.
- Tech stack is captured across ADR-001 through ADR-006 — web framework, auth, API contract, DB + ORM, email, hosting — all Proposed. This PRD makes no implementation choices.

## 3. Success metrics

Targets are directional for this overview PRD; the MVP-scope PRD will commit to specific numbers and measurement plans.

| Metric | Type | Baseline | Target | How measured |
|--------|------|----------|--------|--------------|
| Chapters onboarded | lagging | 0 | 1 (MVP), 5 (next quarter) | Manual count of deployed instances |
| Jobs posted per active month / chapter | leading | 0 | ≥ 5 | DB query |
| Job completion rate (locked → paid + acknowledged) | leading | n/a | ≥ 70% | DB query |
| Dollars routed toward dues per chapter / month | lagging | $0 | ≥ $500 | Sum of marked-paid jobs |
| Time from job posted → first Active enrolled | leading | n/a | ≤ 48h median | Event timestamps |

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
| US-01 | As an **Admin**, I want to generate a shareable invite link for each non-privileged role (Active link, Alumni link) so I can share the right one in each context (e.g., the Active link in the chapter group chat; the Alumni link in the alumni newsletter) without per-user emails. | P0 |
| US-02 | As a new user, I want to claim or confirm my role at signup — defaulting to whatever the invite link suggests, with the option to change it before completing signup — so that I land in the right view of the app. | P0 |
| US-15 | As any user, I want to change my own role between non-privileged roles (e.g., Active → Alumni on graduation) and to step down from Moderator or Admin to a non-privileged role, without needing an Admin to do it for me. | P0 |
| US-03 | As an **Alumni**, I want to post a job with a description, a single dues contribution amount, and a recommended (non-binding) number of people, so that Actives understand the pay and rough scale before enrolling. | P0 |
| US-04 | As a **Moderator**, I want to review and approve or reject job postings, so that unclear, unsafe, or underpaid postings don't reach Actives. | P0 |
| US-05 | As an **Active**, I want to browse approved jobs and enroll in one, so that I can plan to do the work and earn toward my dues. Enrollment is open — no seat cap — until the Alumni locks the job. | P0 |
| US-06 | As an **Active** and **Alumni** matched on a job, I want to contact each other through the app, so that we can work out details (location, timing). | P0 |
| US-07 | As an **Alumni**, I want to lock a job (confirm the work date and stop further sign-up changes) and later mark it complete with the list of Actives who actually showed up and did the work, so that dues credit goes to the right people. | P0 |
| US-08 | As an **Active** or **Admin**, I want to confirm that the dues payment has been received by the chapter treasurer, so that the loop is closed and recorded. | P0 |
| US-09 | As an **Admin**, I want to change any user's role across {Active, Alumni, Moderator, Admin}, so that the org can self-govern and accommodate role transitions (graduations, escalations, departures). | P0 |
| US-10 | As any user, I want to authenticate via my organization's SSO when present, so that I don't manage another password. | P0 |
| US-11 | As an **Active** or **Admin**, when the Alumni has marked a job paid but the dues never showed up at the chapter treasurer (or never got credited to the Active's dues balance in the chapter's books), I want to dispute the payment, so that an Admin is alerted and the job isn't silently closed against the Active's interest. | P0 |
| US-12 | As an **Admin**, I want a dedicated Admin view of the app with an aggregate count of jobs in each state, the ability to drill into disputed jobs, the per-job state-transition history, and a place for advanced instance settings, so that I can monitor health and intervene when needed without scrolling the Active/Alumni views. | P0 |
| US-13 | As an **Admin**, I want an email notification when a job enters the `disputed` state, so that I find out about payment problems without having to poll the Admin view. | P0 |
| US-14 | As an **Alumni**, I want to lock a job once I have a confirmed date and roster, and to be able to revert to enrollment if I need to reschedule or someone has to drop, so that I can give the Actives a definitive plan without freezing the job permanently. | P0 |

## 5. Requirements

This is the overview PRD: requirements are stated at capability level. Subsequent PRDs (e.g., MVP scope, individual features) decompose them into testable feature requirements with acceptance criteria.

| ID | Requirement | Priority | Linked stories | Notes |
|----|-------------|----------|----------------|-------|
| R-01 | The system shall provide invite-link-based signup gated to a single chapter instance. Multiple invite links per chapter, one per non-privileged role (Active, Alumni), are supported; the link a new user follows pre-selects their starting role at signup. The new user may swap to the other non-privileged role before completing signup. | P0 | US-01, US-02 | Discord-style: link is sufficient credential to begin signup; per-instance scope. Workspace SSO signups bypass invite tokens (PRD-003); the multi-link mechanism is for the app-managed signup path. Privileged roles (Moderator, Admin) cannot be claimed at signup — only granted by an existing Admin (R-09). |
| R-02 | The system shall support roles {Active, Alumni, Moderator, Admin}, partitioned into **non-privileged** {Active, Alumni} and **privileged** {Moderator, Admin}. Non-privileged roles are user-selectable; privileged roles require Admin grant. | P0 | US-02, US-09, US-15 | Moderator and Admin require existing-Admin escalation; no self-escalation to privileged roles. Privilege *demotion* is self-service (R-09). |
| R-03 | The system shall let Alumni create job postings with a description, a single dues contribution amount, and a recommended (non-binding) number of people. | P0 | US-03 | No tip field at posting time (Q-06 resolved 2026-05-14 — see §6 cultural nudge). The recommended people count is informational only — it does not cap enrollment. Other fields TBD in MVP PRD. |
| R-04 | The system shall require Moderator approval before a job is visible to Actives. | P0 | US-04 | Rejection captures a reason that's visible to the posting Alumni. |
| R-05 | The system shall let Actives browse approved jobs and enroll in them. Enrollment is open (no seat cap) until the Alumni locks the job. The dues contribution is split evenly across the Actives the Alumni confirms actually did the work at completion time, not across the full set of enrollees. | P0 | US-05, US-07, US-14 | Q-05 resolved 2026-05-14: multi-Active included via open enrollment + Alumni-confirmed attendance, deliberately avoiding a per-seat data model. Handles the "signed up early, didn't show" case without anyone needing to formally drop. |
| R-06 | The system shall provide an in-app communication channel between the matched Alumni and Active for a given job. | P0 | US-06 | Mechanism (DM, comments, contact reveal) decided in design. |
| R-07 | The system shall track per-job state across {posted, awaiting moderation, approved, enrollment-open, locked, completed, payment-sent, closed, disputed, rejected, cancelled}. Transitions of note: `enrollment-open ↔ locked` is bidirectional (Alumni reschedule/roster change reverts a lock to enrollment); `payment-sent → closed` on receipt confirmation; `payment-sent → disputed` on dispute; `disputed → closed | cancelled | payment-sent` on Admin resolution. | P0 | US-03 – US-08, US-11, US-14 | Single state machine, source of truth for the loop. Per-Active payment state is not tracked — payment is one Venmo to the chapter treasurer (R-08). All transitions are recorded with timestamp + actor (R-15). |
| R-08 | The system shall record the dues payment as a single transfer from the Alumni to the chapter's configured treasurer recipient (e.g., `@sigoboard.org` for the launch chapter), and record receipt confirmation by either an Active enrolled in the job or any Admin. The system does not process the payment itself and does not track per-Active disbursements. | P0 | US-07, US-08 | Payment medium is external (Venmo for MVP). The dues split (total ÷ confirmed-attendees) is informational — the chapter treasurer credits each Active's dues balance off-app in the chapter's books. Either an Active or an Admin closing the loop reflects the trust-based culture; no separate Treasurer role. |
| R-09 | The system shall support role changes as follows, with all transitions subject to the minimum-Admin invariant in R-16: (a) any user may self-change their role to any non-privileged role (Active, Alumni) at any time — this covers graduation transitions and voluntary step-downs from Moderator/Admin; (b) elevation to a privileged role (Moderator, Admin) requires an existing Admin to perform the change; (c) Admin-initiated demotions of other users are also allowed. Role-change events are recorded with timestamp + actor + source/destination roles (audit log analog of R-15 for users). | P0 | US-09, US-15 | Q-03 follow-up resolved 2026-05-14: self-service role changes are the default to minimize Admin burden. The user, not the Admin, knows when they've graduated or want to step down from a privileged role; only privilege *grants* still need Admin oversight. R-16 still applies — an Admin cannot self-demote if they are the last Admin. |
| R-10 | The system shall support OIDC SSO via Google Workspace as a required login path for instances with a configured hosted-domain IdP. | P0 | US-10 | Workspace membership is sufficient authorization; no invite token required for SSO users. App-managed accounts ship first (walking skeleton); OIDC SSO required by MVP. Full model in PRD-003. |
| R-11 | The system shall be deployable as a single-tenant instance per chapter. | P0 | — | One instance == one chapter (Q-01 resolved 2026-05-14). National-org rollups, if ever needed, are a separate higher-level system that integrates with chapter instances — out of scope here. |
| R-12 | The system shall let either an enrolled Active or any Admin dispute a payment when a job is in `payment-sent` state, transitioning the job to `disputed` and capturing a free-text reason. | P0 | US-11 | Dispute is the alternative to confirming receipt. Once `disputed`, only an Admin can transition the job out (to `closed`, `cancelled`, or back to `payment-sent` after off-app resolution), with a one-line note. No in-app dispute conversation in MVP — resolution happens out-of-band (Q-04 resolved 2026-05-14). |
| R-13 | The system shall provide an Admin view, accessible only to users with the Admin role, that shows: (a) aggregate counts of jobs by state across the chapter, (b) a drill-in to the list of `disputed` jobs with their reasons, (c) a section for advanced instance settings, and (d) a per-job state-transition history (the audit log from R-15). | P0 | US-12 | Specific dashboard fields, drill-in details, and the enumeration of advanced settings are owned by PRD-002 (MVP) and subsequent design docs. The Admin view is the canonical home for instance-level controls. The transition history is Admin-only — Alumni and Actives see job state but not the full historical log. |
| R-14 | The system shall send email notifications via the platform email provider (ADR-005): (a) to the chapter's configured Admin recipient when a job transitions into `disputed`, and (b) to the chapter's configured treasurer recipient when a job transitions into `payment-sent`, including the dues breakdown (total amount + list of Alumni-confirmed Actives the credit should be split among). | P0 | US-13 | Recipients are single per-instance addresses (Admin: `admins@sigoalumni.org`-style distro; treasurer: `@sigoboard.org`-style for the launch chapter). The treasurer email is informational — the treasurer is not an app user and confirms receipt off-app via either an Active or an Admin closing the loop in the app (R-08, R-12). Per-Admin notification preferences are out of scope for MVP; whether recipient addresses live in env var or in an Admin-editable setting is decided in PRD-002 / design. |
| R-15 | The system shall record every per-job state transition with: (a) the source state, (b) the destination state, (c) a UTC timestamp, (d) the acting user (or `system` for automated transitions), and (e) any free-text note captured at the transition (e.g., dispute reason, Admin resolution note). The full transition history per job is exposed in the Admin view (R-13 d). | P0 | US-12 | Provides the observability layer for the job state machine — used to answer "why did this job get rescheduled three times" or "when did this dispute open" without spelunking through logs. Specific table shape and retention are design concerns. |
| R-16 | The system shall enforce a minimum-Admin invariant: any operation that would leave a chapter instance with fewer than one user holding the Admin role (role demotion, account deletion, account deactivation) shall be rejected at the database level, with a clear error surfaced in the UI. | P0 | US-09 | Q-08 resolved 2026-05-14. Implemented as a CHECK constraint or trigger so the system literally cannot enter a zero-Admin state. Recovery if the invariant somehow fails: (1) the `BOOTSTRAP_ADMIN_EMAIL` env-var path from ADR-002 re-promotes a designated user on next login; (2) operator-level direct DB access (out-of-band) as a final lever. UI error wording: e.g., "Cannot demote — this is the chapter's only Admin. Promote someone else to Admin first." |

### 5.1 Acceptance criteria

This overview PRD does not enumerate ACs — they belong in scoped PRDs (MVP, individual features). The walking-skeleton flow spec (`docs/flows/walking-skeleton.md`, pending) will own the first round of testable ACs.

## 6. User experience

- Mocks: pending
- Flow spec: `docs/flows/walking-skeleton.md` (pending — will cover the happy-path job loop end-to-end)
- States to cover (per job): posted, awaiting moderation, approved, enrollment-open, locked (date + roster confirmed), completed (Alumni-marked + attendees confirmed), payment-sent, closed, disputed, rejected, cancelled. `enrollment-open ↔ locked` is bidirectional (reschedule path).
- UX rules:
  - Mobile-first for Actives; desktop-OK for Alumni and Moderators.
  - Job pricing must always show the dues contribution amount and the recommended people count explicitly — no hidden math. The actual per-Active dues credit (total ÷ confirmed attendees) is shown after the Alumni confirms attendees at completion.
  - The job UI shall include a static, non-numeric note encouraging tipping for above-and-beyond work — without inviting the Alumni to advertise a tip percentage at posting time. The app does not collect or track tips (Q-06 resolved 2026-05-14).
  - Lock and reschedule must be Alumni-initiated, never automatic. The Alumni's lock action is what gives the enrolled Actives a definitive plan; they must also be the one to undo it.
  - Loop closure happens when either an enrolled Active or any Admin confirms receipt — reflecting the trust-based culture; no two-sided escrow ceremony.

## 7. Non-goals (explicitly not doing)

- The app **does not** custody, escrow, or process payments. Money flows externally (Venmo for MVP) directly between Alumni and the chapter.
- The app **does not** verify identity of Alumni beyond chapter-controlled invitation.
- The app **does not** mediate disputes in MVP — Actives flag a job as `disputed`, the Admin gets an email and sees it in the Admin view, and resolution happens off-app (R-12, R-13, R-14). No in-app dispute conversation, structured rebuttal, or auto-refund.
- The app **does not** support cross-chapter or cross-organization marketplaces. Each instance is single-org.
- The app **does not** offer 1099/tax reporting in MVP.
- The app **does not** provide a generic CRM/HR feature set for chapter management.
- The app **does not** track tips. A static cultural nudge appears in the UI; no tip field at posting, no tip amount stored, no tip analytics. Tips happen socially, off-app (Q-06 resolved 2026-05-14).
- The app **does not** track per-Active payments. Payment is one Venmo from the Alumni to the chapter treasurer; the chapter credits each Active's dues balance off-app in their own books. The dues split shown in-app is informational only.
- The app **does not** auto-lock or auto-reschedule jobs. Lock and revert are Alumni-initiated explicit actions.

## 8. Assumptions & dependencies

- **Assumption:** Trust within a fraternal organization is high enough that lightweight Alumni-Moderator review is sufficient for MVP. — *if false:* introduce stronger verification or dispute flows.
- **Assumption:** Venmo is an acceptable dues channel for the launch chapter. — *if false:* ADR for payment channel; potentially add Zelle, ACH, or a processor like Stripe.
- **Assumption:** One SaaS instance per fraternal organization is the right tenancy model. — *if false:* re-architect for multi-tenant; affects auth, data model, and deployment.
- **Assumption:** Alumni reliably mark payments as sent, and either an Active or Admin reliably confirms receipt. — *if false:* introduce reconciliation, reminders, or third-party payment confirmation.
- **Assumption:** The chapter treasurer credits each Active's dues balance off-app, in the chapter's existing books, based on the per-job email breakdown. — *if false:* the app would need to model per-Active dues balances, which is a significant scope expansion (a chapter accounting system).
- **Assumption:** Sign-up "thrash" is a real failure mode worth solving with an Alumni-initiated lock + reschedule rather than a softer mechanism. — *if false:* simplify the state machine by removing `locked` as a distinct state and treating enrollment as open until completion.
- **Depends on:** ADR-001 through ADR-006 (web framework, auth, API contract, DB + ORM, email, hosting) — all Proposed.
- **Depends on:** Domain model (`docs/domain/`) — pending.

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | ~~Is "one instance per organization" at the chapter level or the national-org level?~~ **Resolved 2026-05-14: chapter-level.** One instance = one chapter (PoC: Sigma Phi Omicron, UMass Lowell). National-org-level aggregation, if ever needed, is a separate higher-level system that integrates with chapter instances — not a tenancy mode of this product. Reflected in §2, R-11. | Product | ✅ Resolved 2026-05-14 |
| Q-02 | What's the legal/regulatory posture of facilitating money flow we don't custody? Especially around members under 18 and transfers labeled as dues. | Product / Legal | Before launch |
| Q-03 | ~~How are Alumni initially seeded into a new instance?~~ **Resolved 2026-05-14: invite-link only, one link per non-privileged role.** Admin generates separate Active and Alumni invite links; the link pre-selects role at signup; user can swap before completing signup (R-01, US-01, US-02). Workspace Alumni use SSO (PRD-003) and bypass the invite-token path. Considered-and-rejected: Admin-imported CSV roster (too much scope for MVP — no evidence link-distribution friction is real); self-claim via verified-email allowlist (still requires a maintained roster + verification flow). Follow-up resolved same day: post-signup role changes are self-service for non-privileged transitions (R-02, R-09, US-15), reflecting "we cannot put that much on Admins." | Product | ✅ Resolved 2026-05-14 |
| Q-04 | ~~What happens if an Alumni marks a job paid but the Active never receives funds? Dispute path?~~ **Resolved 2026-05-14: out-of-band escalation with in-app signal.** Active disputes from `payment-sent` → job enters `disputed` state with a free-text reason (R-12). Admin gets an email at the chapter's configured Admin recipient (R-14, e.g., `admins@sigoalumni.org` distro for the launch chapter). Admin handles resolution off-app and closes/cancels/reverts the job in the Admin view (R-13). No in-app dispute conversation in MVP. | Product | ✅ Resolved 2026-05-14 |
| Q-05 | ~~Should jobs support multiple Actives (a team task with split dues)? Defer or include in MVP?~~ **Resolved 2026-05-14: include via open enrollment + Alumni-confirmed attendance.** No per-seat data model; no seat cap. Alumni posts a single dues amount and a recommended (non-binding) people count. Actives enroll freely. Alumni locks the job once roster + date are settled (`enrollment-open ↔ locked`, R-07). At completion, Alumni confirms which enrollees actually did the work; dues split evenly across that confirmed set. Reflected in R-03, R-05, R-07, R-08, US-03, US-05, US-07, US-14. | Product | ✅ Resolved 2026-05-14 |
| Q-06 | ~~Tip handling: is the tip paid to the Active personally (separate from dues), or does it also flow to the chapter?~~ **Resolved 2026-05-14: tips out of the app entirely.** No tip field at posting, no tip tracking, no tip analytics. The job UI carries a static cultural nudge encouraging tipping for above-and-beyond work without inviting the Alumni to advertise a percentage at posting (which would anchor expectations downward). Tips happen off-app via direct Venmo, Alumni → Active. Reflected in R-03, §6 UX rules, §7 non-goals, glossary (Tip removed). | Product | ✅ Resolved 2026-05-14 |
| Q-07 | Communication channel: in-app DM vs. revealing phone numbers vs. linking out to existing platforms (e.g., GroupMe). | Product / Design | Before MVP design |
| Q-08 | ~~What constraints prevent an Admin from accidentally or maliciously demoting all other Admins, leaving the instance without one?~~ **Resolved 2026-05-14: DB-level minimum-Admin invariant (R-16).** Any role-change, deletion, or deactivation that would result in zero Admins is rejected at the database layer with a clean UI error. Two recovery paths kept as safety nets: `BOOTSTRAP_ADMIN_EMAIL` env-var promotion (ADR-002), and operator-level direct DB access (out-of-band). Considered and rejected: N≥2-Admin confirmation (too much friction for an edge case), no-guard (relies on operator availability for what is now a one-line constraint). | Product | ✅ Resolved 2026-05-14 |

## 10. Release plan

- **Phasing:**
  1. Walking skeleton — single chapter, app-managed accounts, manual moderation, full job loop end-to-end.
  2. MVP — same scope plus polish, role-escalation UX, in-app notifications, and Google Workspace OIDC SSO for the launch chapter.
  3. Post-MVP — multi-instance deployment automation, SCIM sync for automated Workspace offboarding, Docker packaging.
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
- **Dues contribution** — the total dollar amount an Alumni commits to pay toward dues for a job. Split evenly across the Actives the Alumni confirms actually did the work; the chapter treasurer credits each Active's dues balance off-app.
- **Recommended people count** — non-binding number on a job posting indicating the rough scale of the work. Does not cap enrollment.
- **Enrollment** — the open sign-up phase for an approved job. Any Active can enroll until the Alumni locks the job. Enrollment is not a binding claim — the Alumni's attendee confirmation at completion is what determines dues credit.
- **Lock** — Alumni-initiated transition from `enrollment-open` to `locked`, fixing the work date and stopping further enrollment changes. Reversible (back to `enrollment-open`) for reschedule or roster changes — see Reschedule.
- **Reschedule** — the path back from `locked` to `enrollment-open` when the date or roster needs to change before the job is performed. Alumni-initiated only; never automatic.
- **Treasurer recipient** — the configured per-instance address (e.g., `@sigoboard.org` for the launch chapter) that receives the Alumni's single Venmo for a job's dues, plus the in-app email notification with the dues split breakdown. Not an app role — no login, no UI.
- **Admin recipient** — the configured per-instance distribution address (e.g., `admins@sigoalumni.org`) that receives dispute-notification emails. Not necessarily the same as the treasurer recipient.
- **Audit log** — the per-job, append-only record of every state transition with timestamp + actor + optional note. Visible to Admins (R-13 d), powering observability of the job state machine.
- **Chapter** — a single local instance of a Greek-letter organization (e.g., one university's chapter).
- **Fraternal organization** — generic term covering both fraternities and sororities.
- **Loop closure** — the moment a job moves to `closed`, recorded by either an enrolled Active or any Admin confirming the chapter treasurer received the Venmo.

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
| 2026-05-07 | Tom Haynes | Pluralized product name "TODO for Dues" → "TODOs for Dues" throughout. PRD filename slug renamed `001-todo-for-dues-overview.md` → `001-todos-for-dues-overview.md`. PRD-001 ID unchanged. |
| 2026-05-14 | Tom Haynes | Promoted R-10 / US-10 from P1 → P0. OIDC SSO via Google Workspace is a hard MVP requirement (not post-MVP) for the launch chapter. Phasing §10 updated accordingly. ADR-007 and PRD-003 added to related. |
| 2026-05-14 | Tom Haynes | **Q-01 resolved: chapter-level tenancy.** One instance = one chapter. Launch chapter recorded as Sigma Phi Omicron, UMass Lowell. National-org rollups deferred to a hypothetical higher-level system; not a tenancy mode of this product. §2 background, R-11 wording, and Q-01 entry updated. |
| 2026-05-14 | Tom Haynes | **Q-04 resolved: out-of-band dispute escalation with in-app signal.** Added `disputed` job state to R-07 and §6. New requirements: R-12 (Active dispute action), R-13 (Admin view with state aggregates, dispute drill-in, and advanced settings section), R-14 (email notification to chapter's Admin recipient on dispute). New stories US-11, US-12, US-13. Non-goal §7 dispute bullet updated to reference the new flow. |
| 2026-05-14 | Tom Haynes | **Q-05 resolved: multi-Active via open enrollment + Alumni-confirmed attendance** (no per-seat data model, no seat cap). **Q-06 resolved: tips out of the app entirely** (static cultural nudge only; no field, no tracking). Restructured the job state machine in R-07 to {posted, awaiting moderation, approved, enrollment-open ↔ locked, completed, payment-sent, closed, disputed, rejected, cancelled} with the bidirectional reschedule path. Rewrote R-03 (no tip field; recommended people count), R-05 (open enrollment + confirmed-attendee dues split), R-08 (single Venmo to chapter treasurer; receipt confirmable by Active or Admin), R-12 (Active or Admin disputes). Added R-15 (per-job audit log of state transitions, Admin-visible) and extended R-13 (d) to surface it. R-14 split into Admin dispute notification + Treasurer payment-sent notification. New US-14 (Alumni lock/reschedule). §3 metrics renamed (claimed→locked, claimed→enrolled). §6 UX rules rewritten — dropped tip pricing rule, added lock/reschedule + tipping-nudge rules. §7 non-goals expanded — no tip tracking, no per-Active payment tracking, no auto-lock. Glossary: removed Tip; added Recommended people count, Enrollment, Lock, Reschedule, Treasurer recipient, Admin recipient, Audit log; reworded Dues contribution and Loop closure. §8 added two new assumptions (off-app treasurer credit; sign-up thrash worth a lock state). |
| 2026-05-14 | Tom Haynes | **Q-08 resolved: DB-level minimum-Admin invariant.** Added R-16 (any operation that would leave the chapter with zero Admins is rejected at the database layer; UI surfaces a clean error). Updated R-09 to reference R-16. Recovery paths retained: `BOOTSTRAP_ADMIN_EMAIL` env-var promotion (ADR-002) and operator-level direct DB access. Considered-and-rejected: N≥2-Admin confirmation (too much friction for an edge case). |
| 2026-05-14 | Tom Haynes | **Q-03 resolved: invite-link only, one link per non-privileged role.** R-01 expanded to support multiple per-chapter invite links (Active link, Alumni link); link pre-selects role at signup with swap allowed before completing. US-01 / US-02 updated to match. **Follow-up resolved same day: self-service role changes for non-privileged transitions** (Active ↔ Alumni; voluntary step-down from Moderator/Admin). R-02 reshaped around a privileged/non-privileged role partition. R-09 rewritten to specify the self-service vs. Admin-grant boundary, with R-16 invariant still applying. New US-15 covers self-service role change. |
| 2026-05-14 | Tom Haynes | **Status: Draft → Proposed.** All MVP-blocking open questions (Q-01, Q-03, Q-04, Q-05, Q-06, Q-08) resolved this session. Remaining open Q-02 (legal posture, "Before launch") and Q-07 (communication channel, "Before MVP design") do not block PRD-002. Doc is settled enough to anchor PRD-002 against. |
