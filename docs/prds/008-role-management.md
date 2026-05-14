---
id: PRD-008
title: Role management
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
size: S
related:
  parent_prd: PRD-001
  parent_requirements: [R-02, R-09, R-16]
  adrs: [ADR-001, ADR-002, ADR-003, ADR-004, ADR-009, ADR-011]
  flows: []
  designs: []
  bounded_contexts: []
  prds: [PRD-001, PRD-003]
  supersedes: null
---

## 1. Objective

> **Problem:** Users need to change their own role (graduations, voluntary step-down from Moderator/Admin) without putting that burden on Admins; Admins need to grant privileged roles (Moderator, Admin); the system needs to prevent zero-Admin states.
> **Audience:** All authenticated users (self-service Active ↔ Alumni transitions, voluntary step-down from privileged roles); Admins (privilege grants).
> **Why now:** Plumbing PRD — no other capability fully ships without role transitions working. Lower priority than the job-loop PRDs only because the launch chapter can be bootstrapped with hand-set roles.
> **One-sentence definition of success:** A user can self-change their role to any non-privileged role; an Admin can grant Moderator or Admin to anyone; no operation can reduce the chapter's Admin count to zero.

## 2. Background & context

- **Decomposes:** PRD-001 R-02 (privileged/non-privileged role partition), R-09 (self-service for non-privileged transitions; Admin-grant for privileged), R-16 (DB-level minimum-Admin invariant).
- **Resolved 2026-05-14:** non-privileged transitions self-service; privileged grants Admin-only; min-Admin invariant DB-enforced; recovery via `BOOTSTRAP_ADMIN_EMAIL` env var (ADR-002) or operator-level direct DB access.
- **Tech stack:** ADR-002 (Better Auth — role storage + session-context source-of-truth), ADR-003 (tRPC procedure for role-change), ADR-004 (Postgres CHECK or trigger for the invariant).

## 3. Success metrics *(deferred to PRD-001)*

## 4. Personas & user scenarios

### 4.1 Personas

Inherited from PRD-001 §4.1.

### 4.2 Scenarios / user stories

PRD-008 owns its own US-NN namespace. Stories trace back to PRD-001 US-09 (Admin role grants) and US-15 (self-service role change).

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As an **Active**, I want to change my own role to Alumni when I graduate, so the chapter sees me as an Alumni without an Admin needing to do it for me. | P0 |
| US-02 | As an **Alumni**, I want to be able to switch back to Active if I'm somehow back as a current member (rare — but the partition allows it), so the role isn't artificially one-way. | P0 |
| US-03 | As a **Moderator** or **Admin**, I want to step down to a non-privileged role (Alumni or Active) at any time, so I can hand off the responsibility without needing another Admin to demote me. | P0 |
| US-04 | As an **Admin**, I want to grant Moderator role to a chapter member, so the chapter has more reviewers without my having to do all the moderation. | P0 |
| US-05 | As an **Admin**, I want to grant Admin role to a chapter member, so I have a co-Admin who can act when I can't. | P0 |
| US-06 | As an **Admin**, I want to demote any user (including another Admin) from a privileged role, so removed Moderators/Admins lose access immediately. | P0 |
| US-07 | As any user, when a role change I attempt is blocked by the min-Admin invariant, I want a clear error message that explains *why* and points me to the action that would unblock it, so I'm not left guessing. | P0 |
| US-08 | As an **Admin**, I want to see the audit log of all role changes for any user (who initiated, who was the target, what changed), so I can answer "why is this user a Moderator?" | P0 |

## 5. Requirements

Style: EARS. Each R-NN cites the PRD-001 R-NN it decomposes. Data model + min-Admin invariant per ADR-011; audit log table per ADR-009 (analog `user_role_transitions`).

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| R-01 | PRD-001 R-09 (a) | When a user submits a self-role-change request to a non-privileged role (Active or Alumni), the system shall update the user's `role` column to the requested value (subject to R-05 min-Admin) and write a `user_role_transitions` audit-log row capturing the user as both initiator and target. | P0 | US-01, US-02 | Self-change is permitted only to Active or Alumni — never self-grant to Moderator/Admin (R-04). |
| R-02 | PRD-001 R-09 (b) | When an Admin submits a role-grant request elevating any user to Moderator or Admin, the system shall update the target's `role` and write a `user_role_transitions` audit-log row capturing the Admin as initiator and the target separately. | P0 | US-04, US-05 | Q-02 resolved 2026-05-14: initiator and target stored separately. |
| R-03 | PRD-001 R-09 (c) | When an Admin submits a role-change request demoting any user from a privileged role (Moderator or Admin) to a non-privileged role, the system shall update the target's role (subject to R-05 min-Admin) and write a `user_role_transitions` audit-log row with separate initiator and target. | P0 | US-06 | Mirror of R-02 in the demotion direction. |
| R-04 | PRD-001 R-02 | If a user submits a self-role-change request to a privileged role (Moderator or Admin), the system shall return 403 Forbidden. | P0 | US-01..US-03 | No self-elevation to privilege; only Admins can grant. |
| R-05 | PRD-001 R-16 | The system shall enforce the minimum-Admin invariant: any role-change, account deletion, or account deactivation that would result in zero users with the Admin role shall be rejected at the database layer (per ADR-011's deferred-CHECK trigger). The application layer shall map the trigger error (Postgres ERRCODE `23514`) to a 422 response with a machine-readable error code (e.g., `MIN_ADMIN_INVARIANT_VIOLATED`). | P0 | US-07 | DEFERRABLE INITIALLY DEFERRED so atomic-swap (promote-then-demote in one transaction) succeeds. |
| R-06 | PRD-001 R-16 | When the system rejects a role change due to R-05, the UI shall display: (a) a clear plain-language explanation ("This is the chapter's only Admin — demoting them would leave the chapter without one"), and (b) a contextual action link, where applicable, that takes the user to the Users sub-route in the Admin view (PRD-007 R-10) with a "Promote a new Admin" affordance prefilled or focused. | P0 | US-07 | Q-01 resolved 2026-05-14: yes, suggest "promote someone else first" with a quick link. The contextual link is only shown to Admins (the only ones who can grant Admin). |
| R-07 | PRD-001 R-09 | The system shall maintain a `user_role_transitions` table (analog of `job_state_transitions` per ADR-009) with columns: `id`, `user_id` (target), `from_role`, `to_role`, `initiator_id`, `initiator_kind` (`'user'` for self-changes, `'admin'` for grants/demotes by another Admin, `'system'` for bootstrap), `note` (free-text, nullable), `created_at`. Indexed on `(user_id, created_at)`. | P0 | US-08 | Separate table from job state transitions — different domain. Same shape and write-helper pattern. |
| R-08 | PRD-001 R-13 | The Admin view's Users section (rendered at `/admin/users` per PRD-007 R-10) shall display: all chapter users in a list with current role + display name + email; for each user, role-grant/demote actions appropriate to the viewing Admin's permissions and the target's current role. | P0 | US-04, US-05, US-06 | This is PRD-008's UI surface that PRD-007 R-10 hosts. |
| R-09 | PRD-001 R-09 | The user's own profile/settings page shall include a self-service role-change control: a dropdown listing only the non-privileged roles (Active, Alumni) and a step-down option (visible only when the user currently has Moderator or Admin role). Submission triggers R-01 / R-04. | P0 | US-01, US-02, US-03 | Lives outside the Admin view — every user has profile/settings access regardless of role. |
| R-10 | PRD-001 R-09 | When an Admin views any user's detail (from R-08's user list), the system shall display the user's full role-change history from `user_role_transitions`, ordered by `created_at` descending, showing initiator display name + role + the from→to transition + timestamp + any captured note. | P0 | US-08 | Admin-only visibility. Mirrors PRD-007 R-06 for jobs. |

### 5.1 Acceptance criteria

- **AC-01** — covers R-01
  - **Given** an Active user U is logged in
  - **When** U changes their own role to Alumni via the profile UI
  - **Then** U's `role` is `Alumni` AND a `user_role_transitions` row exists with `user_id: U, from_role: Active, to_role: Alumni, initiator_id: U, initiator_kind: user`.

- **AC-02** — covers R-02
  - **Given** Admin M and target user T (currently Alumni)
  - **When** M grants Moderator role to T
  - **Then** T's `role` is `Moderator` AND a `user_role_transitions` row exists with `user_id: T, from_role: Alumni, to_role: Moderator, initiator_id: M, initiator_kind: admin`.

- **AC-03** — covers R-04
  - **Given** an Active user U is logged in
  - **When** U attempts to self-grant the Admin role via a crafted API request
  - **Then** the system returns 403 Forbidden AND U's `role` is unchanged.

- **AC-04** — covers R-05 (last-Admin demotion)
  - **Given** Admin M is the only Admin in the chapter
  - **When** M attempts to self-demote to Alumni
  - **Then** the database trigger rejects the transaction (ERRCODE `23514`) AND the application returns 422 with error code `MIN_ADMIN_INVARIANT_VIOLATED` AND M's `role` remains `Admin`.

- **AC-05** — covers R-05 (atomic swap)
  - **Given** Admin M is the only Admin AND target T is currently Alumni
  - **When** M issues a single transaction that grants T Admin role AND demotes M to Alumni (in either order within the transaction)
  - **Then** at commit, T is Admin AND M is Alumni AND the deferred trigger does not fire (count of Admins is still 1).

- **AC-06** — covers R-06
  - **Given** an Admin M is the only Admin and attempts self-demotion (AC-04 scenario)
  - **When** the 422 error returns
  - **Then** the UI displays the message "This is the chapter's only Admin — demoting them would leave the chapter without one" AND shows a "Promote another user to Admin first →" link that navigates to `/admin/users`.

- **AC-07** — covers R-07
  - **Given** any role change occurs
  - **When** the change is committed
  - **Then** a `user_role_transitions` row exists with all required fields populated correctly.

- **AC-08** — covers R-08
  - **Given** Admin M is on `/admin/users`
  - **When** the page renders
  - **Then** all chapter users are listed with display name, email, current role, and role-action buttons appropriate to M's Admin permissions and each user's current role.

- **AC-09** — covers R-09
  - **Given** an Active user U is on their profile/settings page
  - **When** U opens the role dropdown
  - **Then** the dropdown shows only `Active` (current) and `Alumni` (the other non-privileged option). It does NOT show Moderator or Admin.

- **AC-10** — covers R-09 (Moderator step-down)
  - **Given** a Moderator user U is on their profile/settings page
  - **When** U opens the role dropdown
  - **Then** the dropdown shows `Active` and `Alumni` and `Moderator` (current); Moderator selection is the no-op default; choosing Active or Alumni triggers the step-down.

- **AC-11** — covers R-10
  - **Given** Admin M views the detail page of user T who has gone through transitions [`Active → Alumni` (self), `Alumni → Moderator` (granted by Admin N), `Moderator → Admin` (granted by Admin N)]
  - **When** M views T's role-change history
  - **Then** the page shows all three rows, descending by `created_at`, each with the from→to and the initiator's display name + role.

### 5.2 Examples

**R-06 error wording** (user-facing UI message when self-demotion blocked):

> **Cannot demote — this is the chapter's only Admin.**
> Demoting yourself now would leave the chapter without an Admin. To proceed, **promote another user to Admin first**, then come back and demote yourself.
> [Promote another user to Admin first →]

**R-07 user_role_transitions row** (analog of ADR-009's `job_state_transitions`):

```json
{
  "id": "...",
  "user_id": "<target user uuid>",
  "from_role": "Alumni",
  "to_role": "Moderator",
  "initiator_id": "<admin uuid>",
  "initiator_kind": "admin",
  "note": null,
  "created_at": "2026-05-14T18:30:00.000Z"
}
```

**Initiator-kind values:**

| `initiator_kind` | When it applies |
|------------------|-----------------|
| `user` | Self-service change (R-01, R-04 step-down) — `initiator_id == user_id` |
| `admin` | Admin-initiated grant or demote (R-02, R-03) — `initiator_id != user_id` |
| `system` | `BOOTSTRAP_ADMIN_EMAIL` env-var promotion (ADR-002) — `initiator_id == NULL` |

## 6. User experience

- Mocks: pending
- UX rules: self-service role change is a one-click in the user's profile/settings; Admin role-grant is a separate action in the Admin view (PRD-007); the min-Admin error is surfaced as a clean inline message, not a stack trace.
- **Self-service role dropdown is filtered** to never show privileged options (R-09 / AC-09) — even rendering an option the user can't pick is a UX antipattern.
- **Admin Users list** (`/admin/users`, R-08) shows each user's role as a tag/chip that doubles as the role-change affordance (click → menu of valid target roles).
- **Min-Admin error message** is plain language with a concrete next-step link (R-06 / AC-06). The link is omitted for non-Admin users (they can't promote anyone anyway).
- **Role changes are immediate** (no email confirmation, no "are you sure" modal except for Admin demotion of another Admin — that one warrants a single-step confirm given the blast radius).
- **Role-change audit log** is read-only in the UI (R-10) — no editing or deletion of history rows.
- **No bulk role grants** — every grant/demote is a one-target action.

## 7. Scope boundaries

### 7.1 Non-goals

- Time-limited role grants (e.g., "Moderator for one term") — out of MVP.
- N≥2-Admin confirmation for Admin demotion (rejected at PRD-001 Q-08 resolution).
- Per-role permission matrices in-app — roles map to capabilities by code, not by Admin-editable config.
- **Bulk role assignment** (e.g., "promote everyone whose email ends in `@graduating-class.edu` to Alumni"). Out of MVP.
- **Role-grant approval workflows** (e.g., "two Admins must agree to promote a third"). Single-Admin grant is the model.
- **Role expiration / scheduled demotion** ("Moderator until 2027-06-30"). Manual demote only.
- **External role sync** (e.g., from Workspace groups). The Workspace SSO-created accounts default to Active; promotions are explicit Admin actions in the app.

### 7.2 DO NOT CHANGE

| Concern | Owned by | Reason |
|---------|----------|--------|
| Authentication (login, session, password reset, OIDC) | PRD-003 + ADR-002, ADR-007 | Identity layer. |
| Invite-link signup and link-pre-selects-role | PRD-003 + PRD-001 R-01 | Owned at signup, not at runtime role-change. |
| Audit log for role-change events | PRD-007 (audit-log analog of PRD-001 R-15 for users) | Records, doesn't drive. |

## 8. Assumptions & dependencies

- **Assumption:** Better Auth's user/role storage can express the four roles + the partition. **Confirmed by ADR-011** (single `role` text column with CHECK constraint).
- **Assumption:** Min-Admin invariant can be enforced as a Postgres deferred-CHECK constraint trigger. **Confirmed by ADR-011** (deferred constraint trigger; deferred to commit so atomic swaps work).
- **Assumption:** Display names are present on user profiles for the Users list (R-08) and role-change history (R-10). Same dependency as PRD-004 R-05 / PRD-005 R-07. Owned by PRD-003.
- **Assumption:** PRD-007's Admin view will host the Users section as a sub-route (`/admin/users`) per PRD-007 R-10. Coordinated.
- **Depends on:** PRD-003 (Identity & Access — session, role context, display name).
- **Depends on:** PRD-007 (Admin view hosts the Users sub-route; renders R-08 components).
- **Depends on:** ADR-002 (Better Auth + bootstrap), ADR-009 (audit log table pattern reused for `user_role_transitions`), ADR-011 (role data shape + min-Admin invariant).

## 9. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | ~~When a user self-demotes from Admin and they're the only Admin, should the error suggest "promote someone else first" with a quick link?~~ **Resolved 2026-05-14: yes (R-06).** Plain-language error + contextual link to `/admin/users`. Link omitted for non-Admin users (they can't promote anyone). | Design | ✅ Resolved 2026-05-14 |
| Q-02 | ~~Does the audit log record the *initiator* and *target* of the role change separately?~~ **Resolved 2026-05-14: yes — separate columns** (`initiator_id`, `user_id` in R-07's `user_role_transitions` table). `initiator_kind` distinguishes user/admin/system flows. | Product | ✅ Resolved 2026-05-14 |
| Q-03 | Should the Admin Users list (R-08) show each user's last-active timestamp (last login)? Useful for "is this Moderator still around?" but requires hooking Better Auth session updates. Lean: **defer to post-MVP** — the role-change audit log already shows when someone was last touched. | Design | Post-MVP |
| Q-04 | Should there be a "Promote N users to Alumni" UI for end-of-year graduations? Bulk operation. Lean: **no for MVP** — manual one-by-one is fine for one chapter; revisit if a chapter onboards with 100+ Actives graduating in May. | Product | Post-MVP |

## 10. Release plan

- **Walking skeleton:** Admin can change another user's role via direct DB or env-var bootstrap; in-app UI deferred. Min-Admin invariant present at the DB layer from day one.
- **MVP:** full P0 set including in-app self-service role change, Admin grant UI, error surfacing.
- **Post-MVP:** time-limited grants, per-role permission inspection.

## 11. Glossary changes

No new terms. Uses Active (T-01), Alumni (T-02), Moderator (T-03), Admin (T-04).

## 12. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial scaffold. §5 deferred to Phase 5. |
| 2026-05-14 | Tom Haynes | **Q-01 resolved: min-Admin error includes a clear "promote someone else first" link to /admin/users.** **Q-02 resolved: user_role_transitions captures initiator_id + user_id separately + initiator_kind to distinguish user/admin/system.** Added Q-03 (last-active timestamp on Users list — defer post-MVP) and Q-04 (bulk promote for graduations — defer post-MVP). |
| 2026-05-14 | Tom Haynes | **§5 drafted: 10 R-NN (EARS), 11 ACs, §5.2 examples for the min-Admin error wording + user_role_transitions row + initiator_kind table.** §4.2 stories US-01..US-08 covering self-service Active↔Alumni, step-down from privileged, Admin grants/demotes, min-Admin error UX, role-change history. §6 UX rules expanded with 6 (filtered self-service dropdown, role-as-affordance chips in Admin Users list, contextual error link, immediate role changes with one demotion confirm, read-only history, no bulk grants). §7.1 non-goals expanded with 4 (no bulk assign, no approval workflows, no expiration, no Workspace group sync). §8 assumptions confirmed against ADR-011 + added 2 (display name dependency, PRD-007 sub-route hosting). Cited ADR-002 + ADR-009 + ADR-011 throughout. |
