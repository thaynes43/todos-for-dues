---
id: ADR-015
title: Make member status (active|alumni) fully orthogonal to roles; roles are portal-derived only
status: Accepted
date: 2026-08-14
deciders: [Tom Haynes]
consulted: [sigo-alumni backlog item 07 (member status designation + INCIDENT RULING), sigo-alumni ADR 0005 (registry), sigo-alumni ADR 0006 (tiers), sigo-alumni ADR 0007 / ADR-013 (OIDC)]
informed: []
related:
  prds: [PRD-001, PRD-008]
  adrs: [ADR-011, ADR-013]      # ADR-011 role partition + ADR-013 portal OIDC client stand; this changes what "role" means
  flows: []
  designs: []
  supersedes: ADR-014
  superseded_by: null
---

## Context and problem statement

ADR-014 modeled portal member status by *projecting* it onto the app's
`Active`/`Alumni` **role** partition: a declared status re-roled the user
through `transitionRole`, and access ("Alumni post, Actives claim") was
enforced by role. That coupling produced a Sev-1 incident.

**Incident (2026-08-14 ~22:19 ET, owner-confirmed).** The owner — an Admin with
no portal registry row — opened his dues profile and clicked "Active". The
status→role projection wrote `user_role_transitions: Admin→Active`
(self-initiated), **destroying his Admin role**. The portal was verified clean
(roles intact, no registry write ever arrived). His role was restored by a
corrective `UPDATE` + an audited transitions row. Root cause: Active/Alumni were
values in the ROLE enum with self-service role switching (PRD-008 step-down),
and the v1.1.x status work deepened the coupling by projecting portal status
onto those roles.

**The owner's ruling, now a pinned suite-wide invariant:** member status
(`active|alumni`) is FULLY ORTHOGONAL to roles/tiers. An Admin/Moderator/Member
can each be active or alumni. Setting status must never read from or write to
any role field. Roles stay centralized in the portal (tier claims → app roles).

## Decision drivers

1. **Orthogonality (non-negotiable, owner ruling)**: status must never touch a
   role field, in either direction, anywhere in the suite.
2. **No repeat of the incident**: eliminate every self-service / in-app writer
   of `users.role` — the landmine surface.
3. **One store for status** (sigo-alumni item 07 contract): the portal member
   registry; no durable status column/cache here.
4. **Kill the role-vs-status ambiguity permanently**: "Active/Alumni" naming a
   role AND a status is the confusion that let the bug hide.
5. **Keep the audited role machinery** (`transitionRole`, min-1-Admin trigger)
   — claim-sync still needs it.

## Considered options

- **Option A** — Keep status as a role projection, just guard privileged roles
  (patch the symptom).
- **Option B** — Make status a fully separate axis: remove Active/Alumni from
  the role enum (rename Alumni→Member), gate access on status, and delete every
  in-app role writer so claim-sync is the sole role writer.
- **Option C** — Keep Active/Alumni roles but forbid the profile control from
  touching them.

## Decision outcome

**Option B.** Options A and C leave Active/Alumni in the role enum and leave a
self-service role writer alive — the exact shape that caused the incident, only
narrowed. Option B removes the coupling by construction:

- **Role enum** becomes `Member | Moderator | Admin` (migration 0012). The
  ambiguous "Alumni" role is renamed to **Member**; the "Active" role is gone
  (role no longer encodes membership status). Tier mapping:
  admin→Admin, operator→Moderator, **brother→Member**, pending→refused. History
  is history: `user_role_transitions` rows (including the corrective
  Admin-restore) are NOT rewritten — that table has no role CHECK, so legacy
  `Active`/`Alumni` audit rows stay valid beside new `Member` rows.
- **Status is portal-only** (`memberStatus.get`/`set` → the registry). The
  router reads/writes status and NEVER touches `users.role`. Response is
  `{ kind, status }` (no role field). Pinned classifier: GET 200
  `{"status":active|alumni|null}`; PUT any 2xx then re-GET; **409 JSON
  `{"code":"no_registry_row"}`** = authenticated member with no linked row →
  hide the control; 404/401/501/5xx/non-JSON → unavailable → hide the control.
  There is NO local fallback control anymore.
- **Access gating moves from role to status** (server-side, fresh or
  session-scoped): status `active` → claim/enroll; status `alumni` → post;
  undeclared / no-registry-row / unavailable → neither, with a one-sentence
  prompt to /profile. Privileged roles gate by their OWN status exactly like
  everyone else (an Admin with status active can claim). Moderator/Admin-only
  surfaces (moderation queue, admin pages) stay role-gated.
- **Every in-app role writer is deleted**: the self-service `users.changeRole`,
  the admin `users.grantRole`, the `RoleChangeDropdown` / `ProfileRoleSection`
  step-down UI, and the `UserListTable` role menu. **Claim-sync (portal tier →
  role) is now the ONLY role writer.** In-app grants were already ephemeral
  under SSO claim-sync (ADR-013 C-07), so nothing durable is lost.
- **The sign-in claim path is status-blind**: `mapProfileToUser` and
  `syncRoleFromPortalTier` read `tier` alone; the id_token `status` claim is a
  display/bootstrap snapshot only and never influences role.

### Consequences

- **C-01 (good)** — Orthogonal by construction: status lives only in the portal
  registry and the `memberStatus` router; role lives only in `users.role`
  written only by claim-sync. Neither code path can touch the other. Every
  consumer carries a "status change does not alter role" regression test
  (PUT, page-load GET, and sign-in claim paths) plus its inverse.
- **C-02 (good)** — The incident cannot recur: there is no in-app surface that
  writes a role. A status toggle fires no role transition; an Admin with no
  registry row who opens their profile sees the control hidden and keeps Admin.
- **C-03 (good)** — Ambiguity gone: "Member" is a role, "active/alumni" is a
  status; the words no longer overload.
- **C-04 (bad, accepted — flagged to owner)** — Admin `grantRole` is removed:
  roles are portal-derived only. Promotions/demotions happen at the portal and
  land on next sign-in via claim-sync. Accepted because in-app grants were
  already ephemeral (ADR-013 C-07) and the write surface was a hazard.
- **C-05 (bad, accepted — flagged to owner)** — An undeclared member (or one
  with no registry row, or during portal downtime) can neither post nor claim
  and is prompted to declare on /profile. This couples job-board availability
  to a declared status / portal reachability (the coupling ADR-014 avoided) —
  accepted because orthogonality *requires* status-based gating, and failing
  closed is the safe default.
- **C-06 (neutral)** — Access gates read status server-side per request (fresh),
  memoized within a request; a portal round-trip is added to page loads and to
  the claim/post mutations. Bounded and acceptable for a single-chapter MVP.
- **C-07 (neutral)** — Status freshness stays page-load-bounded (item 07
  contract): portal-side changes appear on the next load; no durable cache.
- **C-08 (neutral)** — The min-1-Admin trigger and `transitionRole` audit
  machinery are unchanged; claim-sync still routes through them, so the audit
  trail and the last-Admin guard stay intact.

### Confirmation

- `packages/api/__tests__/integration/member-status.test.ts` +
  `member-status-cycles.test.ts` — status change (GET + PUT) leaves role
  byte-identical, zero `user_role_transitions` rows; the owner scenario (Admin +
  409) hides the control with zero role/registry writes; and the inverse (a
  role transition never alters the registry status).
- `packages/auth/__tests__/integration/claim-sync.integration.test.ts` — a
  `status` claim never moves the role at sign-in (tier drives role alone).
- `packages/auth/__tests__/portal-tiers.test.ts` — brother→Member.
- `packages/db/migrations/0012_role_member_rename.sql` — data-migrates
  Active/Alumni role rows → Member; widens the CHECK; leaves history + the
  owner's corrective rows untouched.
- e2e: the member-status specs assert the role pill never moves while the
  status-driven access surfaces (post/claim gates) flip.

## Pros and cons of the options

### Option A — Guard privileged roles only
Keep the projection; skip re-roling Moderator/Admin.
- Good — smallest diff.
- Bad — leaves Active/Alumni in the role enum and a live self-service role
  writer; a Member self-service flip still mutates a role.
- Bad — does not satisfy the owner's orthogonality ruling; ambiguity remains.

### Option B — Separate axis, portal-only roles (chosen)
Remove Active/Alumni from roles (Alumni→Member), gate on status, delete all
in-app role writers.
- Good — orthogonal by construction; the incident surface is gone.
- Good — permanent disambiguation.
- Bad — removes admin `grantRole`; undeclared members are gated out until they
  declare (both flagged, accepted).

### Option C — Keep roles, forbid the control from touching them
- Good — small.
- Bad — Active/Alumni still roles; the ambiguity and a role writer persist.

## More information

- Authoritative ruling: sigo-alumni `backlog/front-page/members-portal/07-member-status-designation.md`
  ("⚠️ INCIDENT + RULING", "Pinned shapes").
- Supersedes ADR-014 (portal member status consumption) — its Option A
  (status→role projection) is the design this ADR reverses. ADR-014's body is
  immutable; see its frontmatter `superseded_by`.
- Canonical app URL is now https://dues.sigoalumni.org.

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-08-14 | Agent (owner-directed, backlog 07 ruling) | Initial — Accepted. Member status orthogonal to roles; roles portal-derived only; Alumni role renamed Member; self-service/admin role writers removed; status-based access gating. Supersedes ADR-014. |
