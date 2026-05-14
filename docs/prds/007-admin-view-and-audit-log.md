---
id: PRD-007
title: Admin view & audit log
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
size: M
related:
  parent_prd: PRD-001
  parent_requirements: [R-13, R-14, R-15]
  adrs: [ADR-001, ADR-003, ADR-004, ADR-005, ADR-008, ADR-009, ADR-010]
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

PRD-007 owns its own US-NN namespace. Stories trace back to PRD-001 US-12 (Admin dashboard) and US-13 (Admin dispute notification — the email side is owned by PRD-006 R-07; the in-app drill-in is owned here).

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As an **Admin**, I want to open one screen and see job-state aggregates for the whole chapter at a glance, so I can spot health issues without scrolling through Active/Alumni views. | P0 |
| US-02 | As an **Admin**, I want to drill into the list of currently-disputed jobs and resolve each one in-place (closed / cancelled / payment-sent), so I can act on dispute emails without navigating across the app. | P0 |
| US-03 | As an **Admin**, I want to edit chapter-level instance settings (admin recipient email, treasurer recipient email, chapter timezone, chapter display name), so I can update operational details without a redeploy. | P0 |
| US-04 | As an **Admin**, I want to view the full state-transition history for any job in the chapter, so I can answer "why is this job here?" or "when did this dispute open?" without spelunking through logs. | P0 |
| US-05 | As an **Admin**, I want a "Users" section in the Admin view (rendered from PRD-008's role-management UI), so all chapter administration lives in one route. | P0 |

## 5. Requirements

Style: EARS. Each R-NN cites the PRD-001 R-NN it decomposes. Audit-log table shape per ADR-009; settings storage per ADR-010.

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| R-01 | PRD-001 R-13 | The system shall provide an Admin-view route (e.g., `/admin`) accessible only to users with the Admin role. Non-Admin requests shall return 403 Forbidden. | P0 | US-01..US-05 | Single route, four named sections (Dashboard, Disputes, Settings, Audit log) plus a Users section rendered from PRD-008. |
| R-02 | PRD-001 R-13 (a) | The system shall display, on the Admin view's Dashboard section, aggregate counts of jobs in each FSM state (e.g., `awaiting moderation: 2, enrollment-open: 5, locked: 1, completed: 0, payment-sent: 3, closed: 47, disputed: 1, rejected: 4, cancelled: 2`), computed live from a SQL aggregate query against the jobs table. | P0 | US-01 | Q-03 resolved 2026-05-14: live SQL is sufficient for MVP scale (one chapter, low row counts). No materialised view, no cache. |
| R-03 | PRD-001 R-13 (a) | When an Admin clicks an aggregate-count row, the system shall navigate to a filtered list view of jobs in that state, ordered by most recent transition first. | P0 | US-01 | Drill-in for any state, not just disputed. |
| R-04 | PRD-001 R-13 (b) | The system shall display, on the Admin view's Disputes section, the list of jobs currently in state `disputed`, each row showing: job description (truncated), disputer's display name + role, dispute reason (truncated), age in `disputed` state, and a link to the per-job drill-in. | P0 | US-02 | Mirror of the count from R-02 but expanded with dispute-specific data. |
| R-05 | PRD-001 R-13 (b) | The Disputes section shall expose, for each disputed job, three Admin-only actions: "Mark closed," "Mark cancelled," "Mark false-alarm (revert to payment-sent)" — each opening a modal that calls into PRD-006 R-08, R-09, R-10 respectively (resolution-note required by those R-NN). | P0 | US-02 | Wires the PRD-006 transition R-NN into the Admin view. PRD-007 doesn't own the transition logic — only the UI surface. |
| R-06 | PRD-001 R-15, R-13 (d) | The system shall display, on the Admin view's Audit log section (and from any job's detail view), the full per-job state-transition history retrieved from the `job_state_transitions` table (per ADR-009), ordered by `created_at` ascending, showing: timestamp (chapter-local), from_state → to_state, actor display name + role (or "system"), and the `note` field. | P0 | US-04 | Admin-only visibility. Alumni/Active see job state on the job's detail view but not the audit log per PRD-001 R-13 (d) note. |
| R-07 | PRD-001 R-13 (c) | The system shall provide, on the Admin view's Settings section, an editable form for the chapter's instance settings backed by the `chapter_settings` table (per ADR-010): `admin_recipient_email`, `treasurer_recipient_email`, `moderators_recipient_email`, `chapter_timezone` (IANA tz string, default `America/New_York`), `chapter_display_name` (string, used in email subjects). | P0 | US-03 | Initial five settings (added `moderators_recipient_email` to support PRD-002 R-12 moderator notifications). The table is open-ended (jsonb value) so future settings land here without schema changes. |
| R-08 | PRD-001 R-13 (c) | The Settings UI shall validate each field on save (e.g., email format for the two recipient fields, IANA tz regex for the timezone), reject invalid input with a clear error, and persist valid input to the `chapter_settings` table with the current Admin as `updated_by`. | P0 | US-03 | Per-field save (no batch save / no "Save changes" button). Each field has its own confirm-on-blur or save-button affordance. |
| R-09 | PRD-001 R-15 | The system shall write every per-job FSM transition (across PRDs 002, 004, 005, 006) to the `job_state_transitions` table atomically with the state mutation (per ADR-008 + ADR-009). | P0 | US-04 | This R-NN owns the audit-log capability that other PRDs depend on. The implementation is the single `transitionJob()` helper from ADR-008. |
| R-10 | PRD-001 R-13 | The Admin view shall include a "Users" section that renders PRD-008's role-management UI (user list, role-grant actions, self-service controls). | P0 | US-05 | PRD-007 hosts the route; PRD-008 owns the components and procedures. PRD-007 doesn't define the UI. |

### 5.1 Acceptance criteria

- **AC-01** — covers R-01
  - **Given** Admin M is logged in
  - **When** M navigates to `/admin`
  - **Then** the page renders successfully showing four named sections (Dashboard, Disputes, Settings, Audit log) plus a Users sub-route.

- **AC-02** — covers R-01 (access control)
  - **Given** an Active or Alumni user (no Admin role) is logged in
  - **When** they navigate to `/admin`
  - **Then** the system returns 403 Forbidden.

- **AC-03** — covers R-02
  - **Given** the chapter has 2 jobs in `awaiting moderation`, 5 in `enrollment-open`, 1 in `locked`, 0 in `completed`, 3 in `payment-sent`, 47 in `closed`, 1 in `disputed`, 4 in `rejected`, 2 in `cancelled`
  - **When** Admin M opens the Dashboard
  - **Then** the page shows each state with its exact count from a live SQL query.

- **AC-04** — covers R-03
  - **Given** the Dashboard is showing aggregate counts
  - **When** Admin M clicks the row for `payment-sent`
  - **Then** the page navigates to a filtered list of all `payment-sent` jobs, ordered by most-recent transition first.

- **AC-05** — covers R-04
  - **Given** there is 1 job J in state `disputed`, disputed by Active A with reason "treasurer didn't credit me," now 2 days old
  - **When** Admin M opens the Disputes section
  - **Then** the row shows J's description (truncated), "Alice Adams (Active)," the truncated reason, "2d," and a drill-in link to J's detail.

- **AC-06** — covers R-05
  - **Given** the Disputes section shows a disputed job J
  - **When** Admin M clicks "Mark closed" on J's row
  - **Then** a modal opens prompting for a resolution note; on submit (with valid note), PRD-006 R-08 fires; J is in `closed`; an audit-log row is written; the Disputes list refreshes excluding J.

- **AC-07** — covers R-06
  - **Given** a job J has been through transitions [`null → awaiting moderation`, `awaiting moderation → approved`, `approved → enrollment-open`, `enrollment-open → locked`, `locked → completed`, `completed → payment-sent`, `payment-sent → disputed`]
  - **When** Admin M views the Audit log section for J
  - **Then** all 7 rows are shown in chronological order with timestamps in chapter-local time (`America/New_York`), actors labelled with display name + role (or "system"), and any captured `note` text.

- **AC-08** — covers R-07
  - **Given** Admin M is on the Settings section
  - **When** M edits `treasurer_recipient_email` to `treasurer@sigoboard.org` and saves
  - **Then** the `chapter_settings` table contains the new value with `updated_by: M, updated_at: <now>`; subsequent calls to `getSetting('treasurer_recipient_email')` return the new value.

- **AC-09** — covers R-08 (validation)
  - **Given** Admin M is on the Settings section
  - **When** M enters `not-an-email` in `admin_recipient_email` and submits
  - **Then** the system rejects with a validation error citing email format; the existing value is unchanged.

- **AC-10** — covers R-09 (atomicity)
  - **Given** any tRPC procedure that performs an FSM transition (across PRDs 002, 004, 005, 006)
  - **When** the transition is attempted and fails (e.g., illegal transition, validation error)
  - **Then** no partial write is observable: the state column AND the audit-log row are both unchanged (Drizzle transaction rollback).

- **AC-11** — covers R-10
  - **Given** Admin M is on `/admin/users`
  - **When** the page renders
  - **Then** the page shows the user list and role-grant controls as defined by PRD-008's components, with no PRD-007-specific UI overlay.

### 5.2 Examples

**R-02 aggregate-counts payload** (response from the Dashboard's tRPC query):

```json
{
  "awaiting_moderation": 2,
  "enrollment_open": 5,
  "locked": 1,
  "completed": 0,
  "payment_sent": 3,
  "closed": 47,
  "disputed": 1,
  "rejected": 4,
  "cancelled": 2
}
```

**R-06 audit-log entry** (response row from `getJobHistory(jobId)`):

```json
{
  "id": "...",
  "job_id": "9f1a3c8e-...",
  "from_state": "payment-sent",
  "to_state": "disputed",
  "actor_id": "5d2b1f4a-...",
  "actor_display_name": "Alice Adams",
  "actor_role": "Active",
  "actor_kind": "user",
  "note": "I checked the chapter dues book and my balance wasn't updated.",
  "created_at": "2026-06-02T14:22:11.392Z",
  "created_at_local": "2026-06-02 10:22:11 EDT"
}
```

**R-07 chapter_settings table content** (example):

| key | value | updated_by | updated_at |
|-----|-------|-----------|-----------|
| `admin_recipient_email` | `"admins@sigoalumni.org"` | `<admin uuid>` | 2026-05-14 18:00 |
| `treasurer_recipient_email` | `"treasurer@sigoboard.org"` | `<admin uuid>` | 2026-05-14 18:01 |
| `chapter_timezone` | `"America/New_York"` | `<admin uuid>` | 2026-05-14 18:02 |
| `chapter_display_name` | `"Sigma Phi Omicron — UMass Lowell"` | `<admin uuid>` | 2026-05-14 18:03 |

## 6. User experience

- Mocks: pending
- UX rules: Admin view is a separate route (e.g., `/admin`), not a panel inside Active/Alumni views; aggregate counts are clickable into filtered job lists; per-job audit log is a chronological table.
- **Layout: left-nav with four sections** (Dashboard, Disputes, Settings, Audit log) + a Users sub-route rendered from PRD-008. No Active/Alumni nav elements anywhere in `/admin/*`.
- **Dashboard is the landing page.** First thing an Admin sees on opening the view.
- **Aggregate counts use a simple table or chip list** — no charts in MVP. The number is the information.
- **Disputes section badges the count** in the left-nav (e.g., "Disputes (1)") so Admins notice without opening the section.
- **Settings save per-field on blur** with a toast confirming "Saved." No "Save changes" button. Reduces the chance of an Admin editing one field and forgetting to save before navigating away.
- **Per-job audit log timestamps render in chapter-local time** (`chapter_settings.chapter_timezone`), not UTC. The raw UTC is on hover/title attribute for forensic precision.
- **Audit log section's entry point is a "find by job ID" search** + drill-in from any job's detail page. No "all transitions across all jobs" view in MVP — overwhelming and not useful at MVP volume.

## 7. Scope boundaries

### 7.1 Non-goals

- Per-Admin notification preferences (PRD-001 R-14 notes this as out of MVP).
- Audit-log search/query DSL — chronological view only for MVP, find-by-job-ID is the only filter.
- Admin view for Moderators (Moderator queue is owned by PRD-002, not here).
- Cross-chapter Admin view (single-tenant per PRD-001 R-11).
- **Charts or visualisations** on the Dashboard. Numeric aggregate counts only for MVP.
- **Audit log retention cap.** Audit log is forever-retention per ADR-009; no MVP UI for archival or pruning.
- **Materialised views or caching** for aggregate counts. Live SQL per Q-03; revisit if the table grows past a few hundred thousand rows (years away at MVP volume).
- **Bulk-edit settings.** Per-field save only; no "import settings JSON" or similar.
- **Audit-log export** (CSV, PDF, etc.). Read-in-app only for MVP.

### 7.2 DO NOT CHANGE

| Concern | Owned by | Reason |
|---------|----------|--------|
| State-machine transition logic itself | PRD-002, PRD-004, PRD-005, PRD-006 | This PRD *displays* state — it doesn't drive transitions. |
| Role partition and grant mechanics | PRD-003 + PRD-008 | Admin role definition and grant. |
| Communication channel between Active/Alumni | PRD-009 (when defined) | Separate UI surface. |

## 8. Assumptions & dependencies

- **Assumption:** Aggregate counts can be computed from a live SQL query — no pre-computed materialised view needed for MVP scale (one chapter, low job volume). — *if false:* introduce caching layer; out of MVP.
- **Assumption:** Treasurer + Admin recipient addresses + chapter timezone + chapter display name are editable via the Admin view (rather than env-var only). Confirmed for MVP (R-07).
- **Assumption:** PRD-008's role-management UI is renderable as a sub-route under `/admin/users`. — *if false:* PRD-007 needs to provide a navigation shell + iframe-equivalent; or PRD-008 grows its own top-level route. Coordinate with PRD-008 design.
- **Depends on:** PRD-002, PRD-004, PRD-005, PRD-006 (the state machines whose transitions are surfaced here).
- **Depends on:** PRD-008 (renders inside Users sub-route).
- **Depends on:** ADR-008 (FSM helper writes to audit log atomically), ADR-009 (audit log table shape), ADR-010 (`chapter_settings` table for the editable settings).

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | ~~What goes in "advanced settings" for MVP beyond the two recipient addresses?~~ **Resolved 2026-05-14: four MVP settings — `admin_recipient_email`, `treasurer_recipient_email`, `chapter_timezone` (default `America/New_York`), `chapter_display_name`** (used in email subjects). The `chapter_settings` jsonb-value table (ADR-010) is open-ended, so future settings land without schema changes. | Product | ✅ Resolved 2026-05-14 |
| Q-02 | ~~Should audit log retention have a cap or be append-forever?~~ **Resolved 2026-05-14: append-forever per ADR-009.** No retention UI in MVP; revisit if the table grows past a few hundred thousand rows (years away). | Product | ✅ Resolved 2026-05-14 |
| Q-03 | ~~Aggregate counts as live SQL vs. cached count?~~ **Resolved 2026-05-14: live SQL** (R-02). MVP scale doesn't warrant caching. | Design | ✅ Resolved 2026-05-14 |
| Q-04 | Should the per-job audit-log entry-point support search by `actor_id` or `note` text? Lean: **no for MVP** — find-by-job-ID + drill-in from job detail covers the realistic use case. | Design | Post-MVP |
| Q-05 | Should the Dashboard show "longest-stalled job" (e.g., the oldest `payment-sent` job) as a single-cell stat, alongside the aggregate counts? Lean: **yes, low-cost** — answers "what should I look at first?" in one glance. | Product / Design | Phase 5 / design |

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
| 2026-05-14 | Tom Haynes | **Q-01 resolved: 4 MVP settings (admin email, treasurer email, chapter timezone, chapter display name).** **Q-02 resolved: append-forever per ADR-009.** **Q-03 resolved: live SQL aggregate counts.** Added Q-04 (audit-log search by actor/note — defer post-MVP) and Q-05 (Dashboard "longest-stalled" stat — lean yes, design call). |
| 2026-05-14 | Tom Haynes | **§5 drafted: 10 R-NN (EARS), 11 ACs, §5.2 examples for aggregate payload + audit-log entry + chapter_settings rows.** §4.2 stories US-01..US-05 covering Dashboard, Disputes drill-in + resolution, Settings edit, Audit log timeline, Users sub-route. §6 UX rules expanded with 7 (left-nav layout, dashboard landing, simple count tables, dispute count badge, per-field save on blur, chapter-local timestamps with UTC tooltip, find-by-job-ID audit-log search). §7.1 non-goals expanded with 5 (no charts, no retention cap, no caching, no bulk-edit, no export). §8 assumption added for PRD-008 sub-route renderability. Cited ADR-008 + ADR-009 + ADR-010 throughout. |
