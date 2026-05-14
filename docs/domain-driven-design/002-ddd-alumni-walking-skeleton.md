---
id: DDD-002
title: Alumni walking skeleton — happy-path event timeline
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
related:
  prds: [PRD-001, PRD-002, PRD-003, PRD-004, PRD-005, PRD-006, PRD-007, PRD-008]
  adrs: [ADR-007]                       # Workspace OIDC for the SSO signup branch
  bounded_contexts: []
  supersedes: null
---

<!--
Persona walking skeleton — past-tense event timeline for an Alumni.

The thinnest end-to-end happy-path flow the Alumni experiences, from "creates
an account" (via either invite-link signup OR Workspace OIDC SSO) to "the job
they posted closes." Pairs with DDD-001 (Active walking skeleton) — the two
docs tell the same job loop from opposite sides.
-->

## 1. Scope

> **Scope:** the simplest happy-path flow an Alumni goes through, end-to-end: signs up (invite link OR Workspace SSO), posts a job, sees it moderated, sees Actives enroll, locks the job with a confirmed date, does the work (off-app), confirms attendees, sends one Venmo to the chapter treasurer (off-app), marks payment-sent in-app, sees the loop close.
> **Variant:** *Persona walking skeleton.*
> **Trigger:** kickoff DDD modelling for the MVP (REL-001), 2026-05-14.
> **Out of scope:** dispute flow, role changes, posting-edit / re-submit, reschedule, multiple jobs in flight, Admin actions.

## 2. Actors and systems

| ID | Type | Name | Notes |
|----|------|------|-------|
| A-01 | Actor | Alumni | the persona this skeleton is scoped to |
| A-02 | Actor | Active | enrolls in and does the job |
| A-03 | Actor | Moderator | approves the Alumni's posting before Actives see it |
| A-04 | Actor | Admin | generates the invite link OR pre-configures the Workspace OIDC integration |
| S-01 | System | Email provider (Resend) | sends moderator-queue notification, treasurer breakdown email |
| S-02 | System | Chapter treasurer (off-app) | receives Venmo, credits Actives' dues balances in chapter books |
| S-03 | System | Better Auth | account creation, session, role context |
| S-04 | System | Google Workspace OIDC | SSO identity provider for `@<chapter-domain>` Alumni (per ADR-007) |
| S-05 | System | Venmo (off-app) | the Alumni initiates a single transfer to S-02 |

## 3. Domain event timeline

Past tense, ordered. Two starting branches converge at E-04 (logged-in Alumni).

### 3.1 Signup branches (pick one)

| ID | Event (past tense) | Trigger | Actor / System | Notes |
|----|--------------------|---------|----------------|-------|
| E-01a | Alumni invite link was generated | Admin action | A-04 | Out-of-band: shared in chapter alumni newsletter or email blast (PRD-001 R-01). |
| E-02a | Alumni opened invite link | Alumni clicked link | A-01 | Browser arrives at signup with role pre-selected = Alumni. |
| E-03a | Alumni signed up | Form submitted (email + password) | A-01 / S-03 | Account created with role = Alumni. (Skip if E-01b path was used.) |
| E-01b | Workspace OIDC was configured for the chapter | Admin pre-configured `OIDC_CLIENT_ID/SECRET/HOSTED_DOMAIN` env vars | A-04 / S-04 | One-time per-instance setup (ADR-007). |
| E-02b | Alumni signed in via Workspace SSO | Alumni clicked "Sign in with Google" on a `@<chapter-domain>` account | A-01 / S-04 / S-03 | HD-restricted at OAuth callback. Account auto-created on first SSO login (PRD-003 R-01b). No invite token required. |

### 3.2 Main flow (post-signup)

| ID | Event (past tense) | Trigger | Actor / System | Notes |
|----|--------------------|---------|----------------|-------|
| E-04 | Alumni logged in | Subsequent visits OR end of either signup branch | A-01 / S-03 | Session established with role = Alumni. |
| E-05 | Alumni opened the post-job form | Alumni navigated to "post a job" | A-01 | UI surface from PRD-002. |
| E-06 | Alumni filled in the job posting | Description, dues amount, recommended people count (no tip field) | A-01 | PRD-001 R-03 fields per Q-06 resolution. |
| E-07 | Alumni submitted the posting | Form submit | A-01 | Job state `posted → awaiting moderation`. |
| E-08 | Moderator was notified of new posting | system, on E-07 | S-01 → A-03 | Email via Resend (PRD-002 §1). |
| E-09 | Moderator reviewed the posting | Moderator opened the queue | A-03 | (PRD-002 R-04.) |
| E-10 | Moderator approved the posting | Moderator-initiated approve | A-03 | Job state `awaiting moderation → approved`. |
| E-11 | Approved job became visible to Actives | system, on E-10 | (system) | The trigger event for DDD-001 E-05. Job state `approved → enrollment-open`. |
| E-12 | Actives enrolled in the job | one or more Actives clicked "enroll" | A-02 (multiple) | Open enrollment, no seat cap (PRD-001 R-05, PRD-004). |
| E-13 | Alumni decided the date and roster were set | Alumni judgment, optionally after coordination off-app | A-01 | The trigger for E-14 — *not* an in-app event. |
| E-14 | Alumni locked the job | Alumni-initiated lock with confirmed work date | A-01 | Job state `enrollment-open → locked`. (PRD-001 R-07 + US-14, PRD-004.) |
| E-15 | The work was performed | Off-app, real world | A-01 + A-02 (Actives) | Outside the system. |
| E-16 | Alumni confirmed the attendees | Alumni-initiated, at completion | A-01 | Selected the subset of enrollees who actually showed up. Job state `locked → completed`. (PRD-001 R-05 + R-07, PRD-005.) |
| E-17 | System computed the per-Active dues split | system, on E-16 | (system) | Total dues ÷ confirmed attendee count. Informational; the chapter treasurer uses it to credit balances off-app (PRD-001 R-08). |
| E-18 | Alumni sent the Venmo to the chapter treasurer | Off-app | A-01 → S-05 → S-02 | One transfer for the full dues amount. App is not in this loop. |
| E-19 | Alumni marked payment-sent in the app | Alumni-initiated | A-01 | Job state `completed → payment-sent`. |
| E-20 | Treasurer was notified with the breakdown | system, on E-19 | S-01 → S-02 | Email via Resend with the per-Active split (PRD-001 R-14 b, PRD-005). |
| E-21 | Active or Admin confirmed receipt | Active-initiated OR Admin-initiated | A-02 / A-04 | DDD-001 E-12 is the Active variant. Job state `payment-sent → closed`. (PRD-001 R-08, PRD-006.) |
| E-22 | Loop closed | system, on E-21 | (system) | Terminal state `closed`. Audit log records every transition. |

### 3.3 Sequence diagram

The diagram below visualises the §3 event timeline as a sequence of messages between actors and systems. **Use it to trace where each event lands** when implementing or debugging — every E-NN annotation matches a row above.

Conventions:

- **Solid arrow `->>`**: a command, query, or out-of-band action initiated by the source.
- **Dashed arrow `-->>`**: a response or returned value.
- **`alt` / `else` blocks**: alternative branches (signup path A vs B; loop closure by Active vs Admin).
- **`Note`**: contextual annotation; pure-system events, off-app activity, or events sourced from DDD-001.
- **Coloured `rect` blocks**: phase grouping (Signup → Login + Post → Moderation + visibility → Lock + work → Completion + payment-sent → Loop closure).

```mermaid
sequenceDiagram
    participant Admin
    participant Alumni
    participant App as App<br/>(Next.js + tRPC)
    participant DB as Postgres
    participant Workspace as Google Workspace<br/>(OIDC)
    participant Auth as Better Auth
    participant Email as Email<br/>(Resend)
    participant Moderator
    participant Active
    participant Venmo
    participant Treasurer as Chapter Treasurer<br/>(off-app)

    rect rgb(240, 248, 255)
        Note over Admin,Treasurer: Phase 1 — Signup (pick one branch)
        alt Branch A — Invite link [E-01a..E-03a]
            Admin->>App: Generate Alumni invite link [E-01a]
            App->>DB: INSERT invite_token
            DB-->>App: token
            App-->>Admin: Invite URL
            Note over Admin,Alumni: Admin shares URL out-of-band (alumni newsletter)
            Alumni->>App: Open invite link [E-02a]
            Alumni->>App: Submit signup (email, password) [E-03a]
            App->>Auth: Create account (role = Alumni)
            Auth->>DB: INSERT user
            DB-->>Auth: user
            Auth-->>App: session
        else Branch B — Workspace SSO [E-01b..E-02b]
            Admin->>App: Configure OIDC env vars [E-01b]
            Note over App,Workspace: One-time per-instance setup (ADR-007)
            Alumni->>App: Click "Sign in with Google" (@chapter-domain) [E-02b]
            App->>Workspace: OAuth redirect
            Workspace-->>App: code
            App->>Workspace: Exchange code (HD-restriction at callback)
            Workspace-->>App: user claims
            App->>Auth: Create or link account (role = Alumni)
            Auth->>DB: INSERT or UPDATE user
            DB-->>Auth: user
            Auth-->>App: session
        end
    end

    rect rgb(240, 255, 240)
        Note over Alumni,Moderator: Phase 2 — Login + Post job
        Alumni->>App: Login (or session resume after SSO) [E-04]
        Alumni->>App: GET /jobs/new [E-05]
        App-->>Alumni: Posting form
        Alumni->>App: Fill description, dues, recommended count [E-06]
        Alumni->>App: Submit posting [E-07]
        App->>DB: INSERT job (state='awaiting moderation') + audit_log
        DB-->>App: ok
        App->>Email: Notify Moderators of new posting [E-08]
        Email->>Moderator: Email arrives
    end

    rect rgb(255, 250, 240)
        Note over Alumni,Active: Phase 3 — Moderation + visibility
        Moderator->>App: Open moderation queue, view job [E-09]
        Moderator->>App: Approve [E-10]
        App->>DB: UPDATE state='approved' + audit_log (PRD-002 R-07)
        App->>DB: UPDATE state='enrollment-open' + audit_log (PRD-004 R-01) [E-11]
        Note over App,DB: Two audit-log rows for one Mod approval —<br/>user-actor for E-10, system-actor for E-11
        Active->>App: Browse + enroll (DDD-001 E-05..E-06) [E-12]
        App->>DB: INSERT enrollment(s) + audit_log
    end

    rect rgb(255, 245, 250)
        Note over Alumni,Active: Phase 4 — Lock + work
        Alumni->>App: View job (roster + count + recommended comparison) [E-13]
        Note right of Alumni: Judgment moment — not an in-app event;<br/>Alumni decides date is set
        Alumni->>App: Lock with confirmed date [E-14]
        App->>DB: UPDATE state='locked' + persist date + audit_log
        Note over Alumni,Active: Off-app: work performed [E-15]
    end

    rect rgb(248, 240, 255)
        Note over Alumni,Treasurer: Phase 5 — Completion + payment-sent
        Alumni->>App: Mark complete + confirm attendees subset [E-16]
        App->>DB: UPDATE state='completed', persist attendees + audit_log
        Note over App: System computes per-Active dues split<br/>(total ÷ confirmed-attendees) [E-17]
        Alumni->>Venmo: Send single transfer for full dues amount [E-18]
        Venmo-->>Treasurer: Funds arrive (off-app)
        Alumni->>App: Mark payment-sent [E-19]
        App->>DB: UPDATE state='payment-sent' + audit_log
        App->>Email: Treasurer breakdown (job, total, per-Active split) [E-20]
        Email->>Treasurer: Breakdown email arrives
    end

    rect rgb(240, 255, 255)
        Note over Alumni,Treasurer: Phase 6 — Loop closure
        alt Closed by Active
            Active->>App: POST /jobs/:id/confirm-received [E-21] (DDD-001 E-12)
        else Closed by Admin
            Admin->>App: POST /jobs/:id/confirm-received [E-21]
        end
        App->>DB: UPDATE state='closed' + audit_log (first-write-wins per PRD-006 R-04)
        DB-->>App: ok
        Note over Alumni,Treasurer: Loop closed [E-22] — terminal
    end
```

## 4. Hotspots / open questions

| ID | Hotspot | Why it's hot | Owner | Needed by |
|----|---------|--------------|-------|-----------|
| H-01 | E-13 ("Alumni decided the date and roster were set") is a *judgment* event, not an in-app one. The Alumni may want to see "is the recommended people count met?" or "does any enrollee have a scheduling conflict?" before clicking lock. The skeleton does not model how that decision is supported in-UI. | UX gap. PRD-004 §4.2 user stories need to consider what info the Alumni sees before E-14. | Product / Design | Phase 5 PRD-004 decomposition |
| H-02 | E-18 (Venmo) and E-20 (treasurer breakdown email) are racy — the Alumni could send the Venmo *before* clicking payment-sent in E-19, in which case the treasurer gets the money and *then* the email arrives. Or vice versa. The treasurer needs to handle both orderings. | Out-of-app coordination concern. Lean: email content makes the orderings safe (treasurer emails are idempotent — receiving "you got $200 for Job J" twice is unambiguous). Worth flagging in PRD-005. | Product | Phase 5 PRD-005 decomposition |
| H-03 | E-21 — either an Active *or* an Admin can confirm receipt. The skeleton doesn't say which is *expected* in the happy path. If both can act and we want a single confirmation event, what happens if both click within the same minute? | Concurrency edge case. Lean: idempotent — first-write-wins, second click is a no-op. Worth a sentence in PRD-006 §5. | Product / Design | Phase 5 PRD-006 |
| H-04 | The two signup branches (E-01a..E-03a vs. E-01b..E-02b) feel like they should converge cleanly at E-04, but the role-assignment moment is different — invite link pre-selects, SSO auto-assigns Alumni based on Workspace membership. Are the downstream events truly identical regardless of branch? | Identity-context concern. PRD-003 owns this; the skeleton's claim that "logged in" is a single state needs PRD-003 to back it up. | Product | Phase 5 PRD-003 (existing) |

## 5. Pivotal events (candidate context boundaries)

- **E-03a / E-02b — Alumni account exists.** Boundary between Identity & Access (account, session, role) and downstream contexts. Same boundary identified in DDD-001 E-03.
- **E-07 — Posting submitted.** Boundary between Posting & Moderation (job state machine pre-approval) and Job-Lifecycle (post-approval). PRD-002 owns the upstream; PRD-004+ own the downstream.
- **E-11 — Job approved → visible to Actives.** Cross-context handoff: Posting & Moderation publishes; Job-Lifecycle subscribes. Likely a Published Language event.
- **E-16 — Attendee confirmation.** Same as DDD-001 E-09 — boundary between Job-Lifecycle and Dues-Attribution.
- **E-19 — Payment-sent transition.** Boundary between Job-Lifecycle (state change) and Notifications (treasurer email). Notifications is a delivery context, not a state-owning one.

## 6. Outputs / what feeds where

- **Glossary terms:** all terms in this skeleton are already in T-01..T-17. No new terms surfaced.
- **Candidate bounded contexts** (overlapping with DDD-001's; reconcile in `004-bounded-contexts.md`):
  - **Identity & Access (Generic)** — E-01..E-04. Two signup paths, single login surface. Owned by PRD-003.
  - **Posting & Moderation (Supporting)** — E-05..E-11. Owned by PRD-002.
  - **Job Lifecycle (Core)** — E-11..E-22 job-state transitions. Owned across PRD-004, PRD-005, PRD-006.
  - **Dues-Attribution (Core)** — E-16..E-21 the per-attendee split decision and receipt confirmation. Owned across PRD-005, PRD-006.
  - **Notifications (Generic)** — E-08, E-20 outbound email. Delivery boundary, not state-owning.
  - **Audit / observability (cross-cutting)** — every state transition. Owned by PRD-007.
- **Hotspots that should become PRD open questions:**
  - H-01 → PRD-004 §9 ("what info supports the lock-decision UI?")
  - H-02 → PRD-005 §9 ("treasurer email idempotency / out-of-order tolerance")
  - H-03 → PRD-006 §9 ("Active+Admin concurrent close-the-loop click race")
  - H-04 → PRD-003 §9 (likely already covered, but worth a verification pass)

## 7. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. 22 events (with two signup branches) covering the happy-path Alumni flow from signup (invite-link or Workspace SSO) to closing a paid job. 4 hotspots, 5 candidate bounded-context boundaries. Pairs with DDD-001 (Active walking skeleton). |
| 2026-05-14 | Tom Haynes | Added §3.3 Mermaid sequence diagram visualising the 22-event timeline as messages between Admin, Alumni, App, DB, Workspace OIDC, Better Auth, Email, Moderator, Active, Venmo, Treasurer. Phase-grouped via `rect` blocks; signup branches A/B and closure-by-Active-vs-Admin via `alt`/`else`; each E-NN annotated for traceability. |
