---
id: PLAN-014
title: Invite-management Admin UI + RoleAwareNav `/admin` link
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-17
last_updated: 2026-05-17
estimate: S
related:
  prds: [PRD-003]
  adrs: [ADR-001, ADR-002, ADR-005]
  bounded_contexts: [BCC-03]
  aggregates: []
  designs: [DESIGN-006]
  plans:
    prerequisite: [PLAN-002, PLAN-004, PLAN-005, PLAN-011, PLAN-012]
    lateral: [VALIDATION-014]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Close the two Admin-UI gaps surfaced after the v0.5.0 deploy to the launch chapter:

1. **`RoleAwareNav` has no `/admin` link.** The entire `/admin/*` route tree exists and works (PLAN-011 + PLAN-012), but the global top nav at `apps/web/components/RoleAwareNav.tsx` doesn't surface it. An Admin has to know to type `/admin` directly in the URL bar to reach Dashboard / Disputes / Settings / Audit log / Users.

2. **Invite-token generation has no UI.** Backend plumbing exists (DB table `invite_tokens` with verify + revoke helpers; the signup form consumes tokens) — but there is no Admin surface to mint, list, or revoke tokens, and the signup action **never marks consumed tokens revoked** (any unrevoked token can be redeemed unlimited times). Chapter Admins are currently expected to issue raw SQL to onboard non-SSO members, which is unsafe and undocumented.

This plan builds the missing Admin UI (mint / list / revoke), wires the single-use redemption semantic per PRD-003 R-14, and adds the missing top-nav link — all in one PR.

> **Produces:** new `invites` tRPC router + new `/admin/invites` route + 3 new React components + nav-link fix + signup-action revoke-on-redemption + tests.
> **Definition of success:** VALIDATION-014 passes — every PRD-003 R-11..R-14 AC is verified, the nav fix is verified, and the existing PLAN-004 invite-token integration tests are updated to assert single-use semantics.

## 2. Inputs

### 2.1 Documents the agent must read first

1. `docs/prds/003-identity-and-access.md` §5 R-11..R-14 + §5.1 AC-10..AC-13 — the requirements added in PRD-003's 2026-05-17 changelog entry. These are the load-bearing acceptance gates.
2. `docs/designs/006-ui-components.md` §3 (the `/admin/*` route tree) + §4.3 (component sketches; `InviteList` etc. are not currently listed, so the new components mirror DESIGN-006's existing idioms — see PLAN-011's `DisputeCardList` / `SettingsForm` for the shape).
3. `docs/adrs/002-better-auth.md` §Decision-outcome — the invite-token mechanism is part of the app-managed path, NOT the SSO path. Workspace-OIDC members do not consume invites.
4. `packages/db/src/schema/invite-tokens.ts` — the existing schema. Columns: `id`, `token` (unique), `preselected_role`, `created_by`, `created_at`, `revoked_at` (nullable). CHECK constraint `invite_tokens_role_non_privileged` enforces `preselected_role IN ('Active', 'Alumni')`.
5. `packages/auth/src/invite-tokens/verify.ts` — the existing `verifyInviteToken` + `findActiveInviteToken` helpers. Verify rejects on `revokedAt IS NOT NULL` with `InviteTokenError('revoked', …)`.
6. `apps/web/app/signup/actions.ts` — the existing signup server action. **You will modify this** to atomically mark the token revoked alongside the user-account creation (R-14).
7. `apps/web/components/RoleAwareNav.tsx` — the global top nav. You will add one entry.
8. `apps/web/components/AdminNav.tsx` + `apps/web/app/admin/layout.tsx` — the `/admin/*` side-nav and layout. You will add an "Invites" entry to `ADMIN_NAV_ENTRIES` so the new route is reachable.

### 2.2 Repo state assumed

- PLAN-004 complete: `verifyInviteToken` + signup flow + `invite_tokens` table exist + integration-tested (`packages/auth/__tests__/integration/signup-flow.integration.test.ts`).
- PLAN-011 complete: `/admin/layout.tsx` Admin-only shell exists with `AdminNav` left-rail.
- PLAN-012 complete: `/admin/users` is now a real list (not a placeholder).
- Live instance is on v0.5.0 (just deployed) — image `ghcr.io/thaynes43/todos-for-dues:v0.5.0`.

### 2.3 External dependencies

- Same as PLAN-006: dev server + Postgres via testcontainers.

## 3. Outputs

After this plan completes:

- **`apps/web/components/RoleAwareNav.tsx`** — extended with one new entry:
  ```ts
  { href: '/admin', label: 'Admin', roles: ['Admin'] }
  ```
  Placement: after `Moderation queue`, before `Profile` (matches the nav grouping: "things that are role-specific actions, then user-account stuff at the end"). Update the existing component test to assert the new entry shows for Admin and does NOT show for any other role.

- **`apps/web/components/AdminNav.tsx`** — `ADMIN_NAV_ENTRIES` extended with one new entry between Audit-log and Users (or wherever feels natural):
  ```ts
  { href: '/admin/invites', label: 'Invites', testId: 'admin-nav-invites' }
  ```
  No count badge (yet — could be added later if outstanding-invite count becomes useful signal). Update `AdminNav.test.tsx` accordingly.

- **`packages/api/src/routers/invites.ts`** — new tRPC router. Three procedures:
  - **`invites.mint`** — `adminProcedure` input `{ preselectedRole: 'Active' | 'Alumni' }`; generates a URL-safe token (`crypto.randomBytes(16).toString('base64url')` is the lean); inserts the row with `created_by: ctx.userId`; returns `{ id, token, preselectedRole, createdAt, createdBy }`. Defense-in-depth Zod guard rejects privileged roles even though the DB CHECK would also reject.
  - **`invites.list`** — `adminProcedure` query; returns outstanding invites (`revokedAt IS NULL`) ordered `createdAt DESC`. Each row: `{ id, token, preselectedRole, createdAt, createdByDisplayName }`. The display-name comes from a JOIN to `users.display_name`.
  - **`invites.revoke`** — `adminProcedure` input `{ id: uuid }`; `UPDATE invite_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`. If row-count is 0, return a `NOT_FOUND` (already-revoked or never-existed).

  Register the router in `packages/api/src/routers/index.ts` (or wherever the appRouter aggregates).

- **`apps/web/app/admin/invites/page.tsx`** — new server-component route. Reads session (Admin gate is inherited from `apps/web/app/admin/layout.tsx`). Server-fetches `trpc.invites.list` via `getServerCaller()`; renders `<InviteList invites={…} baseUrl={absoluteOrigin} />`. The `baseUrl` is read from the request's `Host` header (Next.js `headers()`) so the displayed signup-URL is correct in both dev (`http://localhost:3000`) and prod (`https://todos-for-dues.haynesops.com`).

- **`apps/web/components/InviteList.tsx`** — client component (needs hooks for the mint/revoke mutations + the optimistic invalidation). Renders:
  - A header section with `<MintInviteButton baseUrl={…} />`.
  - A table or card list of outstanding invites, each row showing:
    - Preselected role (chip).
    - Created-at timestamp (chapter-local via `formatChapterLocal` per DESIGN-006 §4.7; UTC ISO in `<time datetime>` for tooltip).
    - Minter display name.
    - The signup URL with a "Copy" button (uses `navigator.clipboard.writeText`; brief "Copied!" toast on success — reuse the existing toast pattern from `ResolveDisputeModal` etc.).
    - A "Revoke" button → `<RevokeInviteButton inviteId={row.id} />`.
  - When the list is empty: `<p>No outstanding invites. Click "Mint invite" to create one.</p>`.

- **`apps/web/components/MintInviteButton.tsx`** — opens a small modal (reuse `components/ui/modal.tsx` from PLAN-010) with:
  - A `<select>` or radio group for `preselectedRole` (Active / Alumni — and ONLY those two).
  - A submit button "Generate invite".
  - On success: close the modal; invalidate `invites.list`; the new row appears in the list with the URL ready to copy.

- **`apps/web/components/RevokeInviteButton.tsx`** — a button that opens a confirm modal ("Revoke this invite? The link will stop working immediately."). On confirm: call `invites.revoke`; invalidate `invites.list`; the row disappears.

- **`apps/web/app/signup/actions.ts`** — **modified** to atomically revoke the token on successful signup (R-14). The new flow:
  ```ts
  // After the user account is created via auth.api.signUpEmail:
  const result = await db
    .update(inviteTokens)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(inviteTokens.token, input.token), isNull(inviteTokens.revokedAt)))
    .returning({ id: inviteTokens.id });
  if (result.length === 0) {
    // Race lost: another signup consumed it. The user we just created is orphaned —
    // delete the Better Auth user row before returning the error, OR wrap the whole
    // sequence in a transaction (see Step 3 in §4 for the chosen path).
    return { ok: false, error: 'Invite link is invalid or has been revoked.', field: 'token' };
  }
  ```
  See §7 Risks for the atomicity-vs-rollback trade-off and the chosen path.

- **Unit tests:**
  - `apps/web/__tests__/components/RoleAwareNav.test.tsx` — extended to assert the `/admin` link appears for Admin and is absent for Active/Alumni/Moderator. (Spec may already exist; extend it.)
  - `apps/web/__tests__/components/AdminNav.test.tsx` — extended for the new Invites entry.
  - `apps/web/__tests__/components/InviteList.test.tsx` — list rendering, empty-state, copy-button shape.
  - `apps/web/__tests__/components/MintInviteButton.test.tsx` — role select renders Active + Alumni only; submit fires mutation; success closes modal.
  - `apps/web/__tests__/components/RevokeInviteButton.test.tsx` — confirm dialog opens; confirm fires mutation; cancel does not.

- **Integration tests:**
  - `packages/api/__tests__/integration/invites.test.ts` — mint inserts with correct fields; list returns only outstanding in DESC order; revoke updates `revokedAt`; mint with `Moderator` / `Admin` is rejected at the Zod layer (before the DB).
  - `packages/auth/__tests__/integration/signup-flow.integration.test.ts` — **extended** to add the single-use case: same token cannot be redeemed twice; the second attempt returns the revoked error and no second user is created.

- **Playwright spec** — `apps/web/e2e/admin/invites.spec.ts`:
  - Admin opens `/admin/invites` → sees empty state.
  - Admin clicks "Mint invite" → modal opens → selects "Active" → submit → modal closes → row appears with role Active + Copy button.
  - Admin clicks Copy → clipboard contains `<base>/signup?token=<token>`.
  - Admin opens a second browser context (no auth) → navigates to the signup URL → signup succeeds with role Active.
  - Back in the Admin context, reload `/admin/invites` → the redeemed invite is gone (revoked-on-redeem per R-14).
  - Admin mints a second invite for Alumni → reveals + revokes → row disappears immediately; reload confirms persistence.

- **One feature PR** with conventional-commit title `feat(web): Admin invite management UI + nav link + single-use token redemption per PRD-003 R-11..R-14`.

## 4. Steps

### Step 0 — Branch from main

`git checkout -b plan-014-invite-management-and-admin-nav` off latest `origin/main`. (PLAN-011 lesson: never branch off another open PR's branch.)

### Step 1 — RoleAwareNav `/admin` entry (main agent does this directly)

This is mechanical; main agent lands it before spawning subagents so subagent B has a stable nav to test against.

- Edit `apps/web/components/RoleAwareNav.tsx`: add the entry described in §3.
- Update `apps/web/__tests__/components/RoleAwareNav.test.tsx` (or wherever) to assert the new behavior across all four roles.
- Commit.

### Step 2 — Spawn Subagent A (backend) + Subagent B (UI) in parallel

The main agent issues two Agent tool calls in the same response (or sequential with `run_in_background`) to parallelize the work. Both subagents work on the SAME branch (no worktree isolation needed — file conflicts are unlikely since they touch different paths).

**Subagent A (`general-purpose`) — Backend track:**

Scope:
- Add `packages/api/src/routers/invites.ts` with `mint` / `list` / `revoke` per §3.
- Register the router in the appRouter aggregation file.
- Add `packages/api/__tests__/integration/invites.test.ts` with cases per §3.
- Modify `apps/web/app/signup/actions.ts` to atomically revoke the token on successful signup. See §7 Risk 1 for the rollback strategy.
- Extend `packages/auth/__tests__/integration/signup-flow.integration.test.ts` with the single-use case (PRD-003 AC-13).

Definition of done for Subagent A:
- `pnpm --filter @app/api test` exits 0 (≥ 117 + new tests).
- `pnpm --filter @app/auth test` exits 0 (≥ 23 + new tests).
- `pnpm --filter @app/domain test no-direct-state-writes` exits 0; IGNORE_DIRS unchanged (the signup-action change writes to `invite_tokens`, NOT to a state-machine table, so the static scan is unaffected; verify).
- `pnpm -r typecheck` exits 0.
- Single self-contained PR-style summary report back to the main agent: files changed, test counts, any deviations.

**Subagent B (`general-purpose`) — UI track:**

Scope:
- Add `apps/web/app/admin/invites/page.tsx` (server component).
- Add `apps/web/components/{InviteList,MintInviteButton,RevokeInviteButton}.tsx`.
- Add Vitest tests per §3.
- Add `apps/web/e2e/admin/invites.spec.ts` Playwright spec.
- Extend `apps/web/components/AdminNav.tsx` + its test for the new "Invites" entry.

Definition of done for Subagent B:
- `pnpm --filter web test` exits 0 (≥ 161 + new component tests).
- `pnpm --filter web build` exits 0 with `DATABASE_URL` unset (PLAN-002 lazy Proxy intact).
- The Playwright spec runs locally 3× with no flake under `--workers=1`.
- Single self-contained report back to the main agent.

**Coordination notes for subagents:**

- The two tracks share the tRPC type surface (`AppRouter`). Subagent A defines the router → Subagent B consumes it via `trpc.invites.…`. Subagent B should treat the API surface as a contract: if `invites.mint`'s return shape changes after B starts, B re-runs typecheck. Tighten the contract in Subagent A's prompt so B doesn't drift.
- Both subagents work in the same git working tree. They should commit only what they own and avoid touching the other track's files. If a conflict arises, the main agent integrates.
- Subagent A's `invites.test.ts` and Subagent B's `invites.spec.ts` can both reference an "invites" topic without colliding (different directories).

### Step 3 — Main agent integrates + runs cross-plan invariants

After both subagents report back:

- Pull the branch into a clean state; verify `git status` is clean.
- Run **every** cross-plan invariant locally (PLAN-003 static / PLAN-005 integration / PLAN-006 per-page Playwright / PLAN-007 / PLAN-008 chained + SSO / PLAN-010 MVP / PLAN-011 admin / PLAN-012 roles). Anything red → fix or escalate.
- Run the new spec 3× consecutively to confirm no-flake.
- Confirm no `console.error` during Playwright runs (the spec must install `installPageerrorListener` per the PLAN-011 hygiene rule).

### Step 4 — Commit + push + open PR

Squash-friendly: each step's commits can stay (the PR squash-merge collapses them). The squash-commit title is the load-bearing one for release-please:

```
feat(web): Admin invite management UI + nav link + single-use token redemption per PRD-003 R-11..R-14
```

`feat(web):` → minor bump → v0.6.0 on release-please's next pass.

Open the PR with a body summarizing:
- The two gaps closed.
- The signup-action security fix (R-14).
- Subagent split + integration notes.
- Cross-plan invariant confirmations.
- Q-PLN-NN leans implemented (per §9 below).
- Test plan checkboxes.

### Step 5 — Wait for CI green

Lint + typecheck + test. The new Playwright spec is NOT in CI (PLAN-013 §3.1 backlog still applies); local-only.

### Step 6 — GATE 1 — STOP for user review

Tell the user "PR up at https://github.com/.../pull/N; CI green; ready to merge." Do **not** merge.

## 5. Verification (end-to-end)

- [ ] VALIDATION-014 passes — every PRD-003 R-11..R-14 AC has a passing test.
- [ ] `pnpm --filter web typecheck && build` succeed.
- [ ] Manual click-through (in dev):
  - Admin signs in → sees "Admin" entry in top nav → clicks → lands on `/admin` Dashboard.
  - Admin clicks "Invites" in the left rail → lands on `/admin/invites` → empty state.
  - Mints an Active invite → URL appears → copies it.
  - Pastes URL in a private browsing window → signup form prefilled with role Active → completes signup → lands as Active.
  - Back in Admin context, reloads `/admin/invites` → the consumed invite is gone (single-use).
  - Mints a second invite → clicks Revoke → confirms → row disappears; reload confirms persistence.
- [ ] One commit on the squash-merge.

## 6. Out of scope

- **Email delivery of invite URLs** (PRD-003 §10 backlog) — Admin copies + sends through their own channel for MVP. Resend template + spam considerations land later.
- **Bulk invite minting** — one at a time.
- **Time-limited invite TTL** — invites stay valid until redeemed or revoked. No `expires_at` column. Add later if launch chapter requests it.
- **`redeemed_by` audit column** — schema currently has `created_by` but not `redeemed_by` / `redeemed_at`. PRD-003 R-14 sets `revoked_at` on redemption, which is sufficient signal for "this token was consumed." If audit needs more, add a follow-up plan with a small migration.
- **Invite analytics / dashboard widget** — not a launch-chapter need.
- **Privileged-role invites** (Moderator / Admin) — explicitly forbidden by the DB CHECK + Zod guard per R-04 + R-07 + R-11.

## 7. Risks & gotchas

### Risk 1 — Atomicity of signup + token-revoke (R-14)

The signup action does TWO writes: (1) create the user account via Better Auth's `auth.api.signUpEmail`, (2) revoke the invite token. If these are not atomic, two scenarios can break:

- **Race:** two concurrent signups with the same token both see `revoked_at IS NULL` at verify time; the first signup succeeds, then the second signup's revoke-update finds `revoked_at IS NOT NULL` and returns 0 affected rows — but the second signup already created a user account.
- **Crash:** signup creates the user, then the revoke-update fails (DB blip) — token stays valid, second user can redeem it.

**Three possible strategies:**

- **(a) Order: revoke first, then create user.** `UPDATE invite_tokens SET revoked_at = now() WHERE token = $1 AND revoked_at IS NULL RETURNING preselected_role`. If rows = 0 → return error before account creation (clean). If rows = 1 → proceed with `auth.api.signUpEmail`. If account creation then fails (e.g., email already exists), the token is already revoked — minor wart (orphans the token), but no orphan user account is created. Strong default.
- **(b) Wrap both in a Postgres transaction.** Drizzle supports `db.transaction(async (tx) => …)`. Better Auth's `signUpEmail` uses the same Drizzle adapter so it should participate. **Risk:** Better Auth may issue its own internal commit; check before relying. If it does participate, this is the cleanest atomic story.
- **(c) Order: create user first, then revoke, with explicit rollback on revoke=0.** If revoke returns 0 rows, delete the just-created user. More moving parts, more failure modes.

**Lean: (a).** Revoke-first is the simplest correct path. The "orphan token if signup fails after" wart is acceptable — the user just gets an error and contacts the Admin for a new invite. The Admin sees the spent token in `invite_tokens` (revoked, no associated user); they can prune it manually if they care.

Subagent A: **implement (a) unless you can verify Better Auth's `signUpEmail` participates cleanly in a Drizzle transaction without committing internally, in which case (b) is acceptable.** If you go with (a), the existing AC-13 still holds: same token cannot be redeemed twice.

### Risk 2 — `invites.list` enumeration leaks tokens to the Admin's browser

`invites.list` returns the raw token strings so the UI can render the signup URL. That's fine for the listing Admin (who needs the URLs anyway), but:
- The token strings end up in browser-side React state — if the Admin's session is hijacked, the attacker can enumerate outstanding invites and redeem them. Mitigation: the `adminProcedure` middleware already gates this; the threat is already present at every Admin tRPC procedure. No new mitigation needed for MVP.
- Logging tokens to console / observability tools is a leak. Make sure no `console.log(invites)` ships.

### Risk 3 — Token format / entropy

`crypto.randomBytes(16).toString('base64url')` produces a 22-character URL-safe token with 128 bits of entropy. That's the lean — strong enough that brute-force enumeration is infeasible. Do NOT use `crypto.randomUUID()` because that's only 122 bits and visually resembles other UUIDs in the app (confusing in URLs). Do NOT use shorter formats (8 bytes / 64 bits is below the brute-force threshold).

### Risk 4 — The PLAN-003 `no-direct-state-writes` invariant

The signup-action's UPDATE to `invite_tokens.revoked_at` is a direct DB write — but `invite_tokens` is **not a job/role state-machine table**, so the static scan doesn't flag it. Verify by running `pnpm --filter @app/domain test no-direct-state-writes` before opening the PR; expected: green; IGNORE_DIRS unchanged.

### Risk 5 — Nav-link visibility regression

If `RoleAwareNav.tsx`'s filter logic changes accidentally (e.g., `roles.includes(role)` becomes `role in roles`), the Admin nav entry might leak to non-Admins. Add a specific test for each role to lock down the visibility.

## 8. Resume points

- After Step 0: branch created.
- After Step 1: nav-link landed.
- After Step 2: backend + UI both done in parallel.
- After Step 3: cross-plan invariants confirmed.
- After Step 4: PR opened.
- After Step 5: CI green; ready for Gate 1.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Where does the "Invites" entry sit in `ADMIN_NAV_ENTRIES`? Between Audit-log and Users (alphabetical-ish), or at the end? Lean: **between Audit-log and Users** — chapter Admins onboard new members frequently; keep it near the Users entry where role management lives. | Implement at index 4 (before Users). |
| Q-PLN-02 | Token format: `crypto.randomBytes(16).toString('base64url')` (22 chars, 128 bits) vs. `crypto.randomBytes(24).toString('base64url')` (32 chars, 192 bits)? Lean: **16 bytes / 128 bits** — strong enough; shorter URLs paste better in chat / SMS. | Implement 16 bytes. |
| Q-PLN-03 | Should the "Copy URL" button copy just the URL or also the role text ("Active invite: https://…")? Lean: **just the URL** — pastes cleanly into any messaging app; the role is implicit in the URL. | Implement URL-only. |
| Q-PLN-04 | Should `invites.list` paginate? Lean: **no** — outstanding-invite counts at MVP scale (<50 chapter members → <50 outstanding invites ever) are fine in a single list. Revisit if a chapter hits 200. | No pagination. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-17 | Tom Haynes | Initial draft. Bundles the two Admin-UI gaps surfaced after v0.5.0 deploy: missing `/admin` link in `RoleAwareNav`, and missing invite-token mint/list/revoke UI (with a latent security bug in the signup-action — invite tokens were never marked consumed). Paired with VALIDATION-014. Implementation pattern: main agent lands the nav-link fix as Step 1, then spawns two parallel subagents for backend (tRPC `invites` router + signup-action fix) and UI (route + 3 components + tests). One PR. |
