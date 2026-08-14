---
id: ADR-014
title: Consume portal member status (active|alumni) as the source for the Active/Alumni role partition
status: Accepted
date: 2026-08-14
deciders: [Tom Haynes]
consulted: [sigo-alumni backlog item 07 (member status designation), sigo-alumni ADR 0005 (registry), sigo-alumni ADR 0006 (tiers)]
informed: []
related:
  prds: [PRD-001, PRD-008]
  adrs: [ADR-011, ADR-013]      # ADR-011 role partition stands; ADR-013 portal OIDC client stands — this ADR supplements it
  flows: []
  designs: []
  supersedes: null
  superseded_by: null
---

## Context and problem statement

The suite decided (sigo-alumni backlog item 07, 2026-08-14) that members carry
a self-set **status: `active` | `alumni`** — a roster fact, not a permission —
whose single source of truth is the **portal's member registry**. The portal
will expose it three ways: a `status` claim in the id_token (sign-in
snapshot), and `GET`/`PUT /api/member/status` authenticated by the member's
OIDC access token. Consumers must store nothing durable.

This app already has an Active/Alumni split — but as an app-owned *role*
(`users.role`, ADR-011): Actives claim jobs, Alumni post them, and portal
tier drives only the privileged roles (ADR-013 §mapping — `brother` rides
both Alumni and Active). Question: how does this app consume portal member
status, given that the portal side ships post-launch (post-8/17) and the app
must keep working before it exists?

## Decision drivers

1. **One store** (contract): no status column, table, or durable cache here —
   the registry is the roster of record; staleness bounded to a page load.
2. **Display and access must not diverge**: whatever status the member sees
   is what the job board enforces (Active claims / Alumni posts).
3. **Portal ships later**: nothing may block on the portal; testing the app
   (including role flips) must stay possible before the endpoint exists.
4. **Audited role writes**: every `users.role` change goes through
   `transitionRole` (single-writer invariant, PLAN-003 / PRD-008 R-07).
5. **Tier mapping is untouched**: admin/operator/pending handling, the
   min-1-Admin guard, and privileged-role semantics stay exactly ADR-013's.

## Considered options

- **Option A** — Project status onto the existing Active/Alumni role
  partition; read fresh per page load; feature-detect the portal endpoint
  and fall back to local-only self-service until it ships
- **Option B** — Track status as new app state (column/cache) synced from
  the portal
- **Option C** — Replace the Active/Alumni roles with portal status reads
  everywhere access is decided

## Decision outcome

**Option A.** Portal member status becomes the *upstream source* for the
app's existing Active/Alumni role partition; the role stays the access
mechanism. Option B violates the one-store contract outright. Option C puts
a network read on every access decision and couples job-board availability
to the portal (rejected for the same reason as ADR-013 C-05 tolerates only
sign-in coupling).

Wiring (all in `packages/auth` + `packages/api` + the profile page):

- **Sign-in bootstrap + resync** (`status` claim): `mapProfileToUser` and
  the session-create claim-sync read `status` next to `tier`. For tier
  `brother`, a declared status pins the partition side (`active` → Active,
  `alumni` → Alumni); absent/null keeps prior behavior (new users default
  Alumni; existing users keep whichever side they hold). Sync writes go
  through `transitionRole` (initiator `system`, note
  `portal claim-sync: tier=brother status=… (ADR-014)`).
- **Server-side portal client** (`packages/auth/src/portal-client.ts`): the
  portal API base URL is the **origin of `OIDC_DISCOVERY_URL`** (no new env
  var — it follows the issuer cutover, ADR-013 C-03). The member's access
  token comes from Better Auth's `auth.api.getAccessToken` (refreshes via
  the stored refresh token when expired). Results are a discriminated union:
  `ok(status)` / `undeclared` / `no-registry-row` / `unavailable`.
- **Feature detection** (driver 3): a route-level 404, a 501, or a network
  refusal classifies as `unavailable` and keeps the portal-backed path
  dormant. Disambiguating the contract's no-row 404 from a route-404 uses a
  tolerant heuristic: a 404 with a JSON error body ⇒ `no-registry-row`;
  anything else ⇒ `unavailable`.
- **tRPC surface** (`memberStatus.get` / `memberStatus.set`): `get` reads
  fresh from the portal on page load and syncs a diverged Active/Alumni role
  (system initiator); `set` PUTs, re-GETs, then syncs (user initiator).
  Neither ever re-roles a Moderator/Admin — for privileged users status
  remains a settable roster fact with no role effect (their role follows
  tier per ADR-013).
- **Profile UI**: the Active/Alumni self-service control becomes
  portal-backed when the portal is available; falls back to the local-only
  `users.changeRole` path (pre-ADR-014 behavior, verbatim) when
  `unavailable`; hides entirely for members with no registry row.
  Privileged users keep their existing step-down affordances unchanged.

### Consequences

- **C-01 (good)** — One declaration, suite-wide: flip Active/Alumni in the
  portal settings page or here; the other app shows it on next load /
  next sign-in. The registry row is the only stored copy (audited
  portal-side per sigo-alumni ADR 0005).
- **C-02 (good)** — Display and access cannot diverge: every fresh read
  re-projects onto `users.role` through the audited FSM path, so the job
  board's gates follow the roster fact within one page load.
- **C-03 (good)** — Nothing blocks on the portal: until `GET /api/member/
  status` exists, every call classifies `unavailable` and the app behaves
  exactly as before this ADR (local self-service, e2e-tested both ways
  against the portal-shaped mock).
- **C-04 (neutral)** — The app-granted Active grant survives: with status
  undeclared, `brother` still rides both partition sides and
  `users.changeRole` still works — ADR-013's "portal registry has no
  actives" note is now false only for members who declare.
- **C-05 (bad, accepted)** — A member's local role flip (fallback path or
  admin grant) is overwritten by a *declared* portal status at the next
  sign-in / profile load. Correct per the contract (registry is truth), but
  means pre-launch local flips are ephemeral once the member later declares.
- **C-06 (bad, watch item)** — 404 disambiguation is heuristic (contract
  ambiguity, reported upstream): if the shipped portal returns bare 404s
  (no JSON error body) for no-row members, the app will read them as
  `unavailable` (feature off — safe but hides the control's absence
  reason). Confirm the portal's 404 body shape when item 07 ships.
- **C-07 (neutral)** — Status freshness is page-load-bounded (contract).
  Mid-session portal-side changes appear at the next profile load or
  sign-in; job-action gates use the role as of its last sync.
- **C-08 (neutral)** — `memberStatus.get` is a query that may write (role
  sync). Accepted: the write is idempotent, converges to the portal truth,
  and keeping it in the read path is what enforces C-02.

## Validation

- `packages/auth/__tests__/portal-status.test.ts` +
  `portal-client.test.ts` (parsing, projection, base-URL derivation, the
  404/409/501 classification matrix).
- `packages/auth/__tests__/integration/status-sync.integration.test.ts`
  (claim + projection sync against the real PG trigger stack, incl. the
  min-Admin guard and privileged-role skip).
- `packages/api/__tests__/integration/member-status.test.ts` (router
  against a portal API mock through the REAL `getAccessToken` path, incl.
  refresh-on-expiry).
- e2e: `apps/web/e2e/roles/member-status.spec.ts` (portal-backed flip +
  access surface, no-row hiding, feature-off fallback) and
  `apps/web/e2e/auth/member-status-signin.spec.ts` (status claim at
  bootstrap + resync) against the extended portal-shaped mock.
- Live: pending the portal shipping item 07 (post-8/17) — first live
  round-trip must confirm the 404 body shape (C-06).
