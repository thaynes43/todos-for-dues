# Prompt for Claude Code agent — Execute PLAN-004 (auth wiring)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). Launch chapter: Sigma Phi Omicron, UMass Lowell. **Current state:** PLAN-001 (scaffolding), PLAN-002 (DB schema), and PLAN-003 (FSM module with `transitionJob` / `createJob` / `approveJob` / `recordRelationshipEvent` / `transitionRole` / `transitionRolesAtomically`) are committed. PLAN-004 wires Better Auth + Workspace OIDC + invite tokens + the three Server Actions.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/004-auth-wiring-implementation.md` end-to-end, then verify against `docs/plans/004-auth-wiring-validation.md` pass/fail gates. You produce: Better Auth instance config with `genericOAuth` plugin, HD-restriction hook (rejects non-hosted-domain SSO at the callback), session-extension hook (attaches `role` to session payload), bootstrap-admin hook (`BOOTSTRAP_ADMIN_EMAIL` → Admin on first matching login), invite-token verification helper, three Server Actions (signup, login, forgot-password), and the OAuth catch-all route via `toNextJsHandler(auth.handler)`.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.**
2. `docs/plans/004-auth-wiring-implementation.md` — the plan. §3 Outputs, §4 Steps 1–8, §5 verification.
3. `docs/plans/004-auth-wiring-validation.md` — gate checklist + Playwright spec list.
4. `docs/designs/004-auth-wiring.md` — full design contract. **Read §4.4 (bootstrap-admin hook) alongside the trap callout below — DO NOT copy §4.4 verbatim.** §4.1 (Better Auth config), §4.2 (HD-restriction), §4.3 (session-extension), §4.5 (verify-invite-token), §4.6/§4.7/§4.8 (3 Server Actions), §4.9 (account linking), §4.10 (OAuth catch-all).
5. `docs/adrs/002-auth.md` + `docs/adrs/007-google-workspace-oidc.md` — auth library + OIDC choice rationale + HD restriction mechanism.
6. `docs/prds/003-identity-and-access.md` §5 R-01..R-10 + §5.1 AC-01..AC-09 — the contract you're verifying.

**What's already in the repo you can rely on:**
- `import { db, getPool } from '@app/db'` — Proxy-based lazy `db` (PLAN-002 Step 0).
- `import { users, inviteTokens, userRoleTransitions, type Role } from '@app/db/schema'` — every table + enum type.
- `import { runMigrations } from '@app/db/migrate'` — for testcontainers seeding in integration tests.
- **`import { transitionRole } from '@app/domain'`** — the *only* legal mutator of `users.role` and writer of `user_role_transitions`. PLAN-003's static-analysis test (`no-direct-state-writes.test.ts`) fails the build if anything else writes those.
- `@app/test-utils.startPostgres()` — testcontainers helper from PLAN-001.

## What you do NOT do

- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans). If a design block contradicts a constraint from a previous plan, **adapt within this plan** (see Trap 1 below) and document the adaptation in your commit message and the plan's §9 Open Questions if relevant. Do not edit the design itself.
- Do not skip ahead into PLAN-005+ scope (no tRPC procedures, no UI components beyond minimal form pages that host the Server Actions).
- Do not write any `UPDATE users SET role =` / `INSERT INTO user_role_transitions` outside `packages/domain/`. PLAN-003's static-analysis test enforces this.
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not commit until §5 + VALIDATION-004 §6 gates are all green.
- Do not push to remote — the user pushes.

## Specific traps to watch for

**Trap 1 — Bootstrap-admin hook MUST route through `transitionRole`, NOT raw SQL.**
DESIGN-004 §4.4 sketches the hook with `await tx.update(users).set({ role: 'Admin' })...` and `await tx.insert(userRoleTransitions).values({...})` directly. Copying that verbatim violates PLAN-003's `no-direct-state-writes.test.ts` invariant (`packages/domain/` is the sole writer of `users.role` and `user_role_transitions`). Adapt the hook to:

```ts
import { db } from '@app/db';
import { users } from '@app/db/schema';
import { eq } from 'drizzle-orm';
import { transitionRole } from '@app/domain';

export const bootstrapAdminHook = async ({ user }: { user: { id: string; email: string } }) => {
  const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!bootstrapEmail) return;
  if (user.email.toLowerCase() !== bootstrapEmail.toLowerCase()) return;

  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, user.id));
  if (!row || row.role === 'Admin') return;  // already Admin — no-op

  await transitionRole({
    targetUserId: user.id,
    expectedFromRole: row.role,
    toRole: 'Admin',
    initiator: { id: null, kind: 'system' },
    note: 'BOOTSTRAP_ADMIN_EMAIL promotion',
  });
};
```

Same external behaviour (single `user_role_transitions` row with `initiatorKind: 'system'`, role flipped to Admin, min-Admin trigger correctly passes since count went up). Document this adaptation in the commit message: "bootstrap-admin hook routes through `transitionRole` from @app/domain to preserve PLAN-003's single-writer invariant; DESIGN-004 §4.4's direct-SQL sketch was written before PLAN-003 ratified that invariant."

**Trap 2 — Signup does NOT write a `user_role_transitions` row.**
PRD-008 R-07 + AC-07 track role *changes*; initial role assignment at user creation is not a change. The signup Server Action (DESIGN-004 §4.6) just creates the user with role pre-selected via Better Auth's `additionalFields`. No null→Active row in `user_role_transitions`. The static-analysis test exempts `INSERT INTO users` — only `UPDATE users SET role =` and `INSERT INTO user_role_transitions` are forbidden outside `packages/domain/`.

**Trap 3 — Better Auth's `additionalFields` API may have moved.**
DESIGN-004 §4.1 sketches a `mapProfileToUser` + `additionalFields: { role }` pattern. The exact Better Auth API for adding `role` as a custom user-table column + surfacing it in the session payload varies by version. **Verify at install time** — read Better Auth's current docs for the version you install. If the sketch's exact shape doesn't compile, adapt while keeping the intent: (a) `users.role` populated at signup from the invite token's `preselectedRole` or defaulted to `'Active'` for SSO, (b) `session.user.role` available in tRPC context (PLAN-005 reads it).

**Trap 4 — HD-restriction must reject BEFORE any user row is created.**
DESIGN-004 §4.2 + ADR-007 require the HD check fire at the OAuth callback hook, throwing `HdRestrictionError` before Better Auth's user-creation path runs. The integration test asserts no `users` row exists post-rejection. If a non-HD user ends up with a created-then-orphaned row, the hook is firing in the wrong order.

**Trap 5 — Account linking (PRD-003 R-09) may not be transparent in Better Auth's default config.**
DESIGN-004 §4.9 is conditional ("If Better Auth's default doesn't link transparently in our version, we add a hook…"). Write the integration test FIRST (`account-linking.integration.test.ts` per VALIDATION-004 §5) — if Better Auth's defaults handle it, you're done; if not, add the custom hook from §4.9.

**Trap 6 — Three Server Actions cap is ADR-003's hard limit.**
Signup, login, forgot-password are the only forms allowed to use Server Actions. Everything else in MVP goes through tRPC (which lands in PLAN-005). Do not add a fourth Server Action.

## Definition of done

Every box in VALIDATION-004 §6 green:

- `pnpm --filter @app/auth typecheck && test` passes all unit + integration tests:
  - HD-restriction (matching HD + email → pass; either mismatch → `HdRestrictionError`)
  - verify-invite-token (valid / not-found / revoked)
  - session-extension (`session.user.role` populated)
  - bootstrap-admin (matching email → role becomes Admin via `transitionRole`; non-matching → no-op; already Admin → no-op)
  - Full invite-token signup → user row + role from token's `preselectedRole` + auto-signin
  - SSO mock signup → user row with `role: 'Alumni'`
  - SSO HD-restriction → 4xx, no user row
  - Account linking (existing app-managed email signs in via SSO) → same user_id, no duplicate
  - `BOOTSTRAP_ADMIN_EMAIL` end-to-end (sign in once with matching email → Admin role + audit row with `initiatorKind: 'system'`)
- `pnpm --filter web build` succeeds.
- Playwright auth specs pass (`apps/web/e2e/auth/*.spec.ts` — every spec listed in VALIDATION-004 §5).
- PLAN-003's `no-direct-state-writes.test.ts` STILL PASSES after this plan lands (no regression — proves Trap 1 was honoured).
- Repo-wide `pnpm typecheck` clean.
- One commit matching PLAN-004 §3's commit message.

Report back (under 200 words): commit hash, anything escalated, any open Q-PLN-NN with your lean, and explicit confirmation that PLAN-003's static-analysis test still passes.

## If you get stuck

If Better Auth's API differs materially from DESIGN-004's sketch and you cannot reconcile while keeping the intent, **escalate to the user** with: (1) the design block that doesn't fit, (2) the actual Better Auth API shape, (3) your proposed adaptation. Do not invent product or architectural decisions. Do not modify the design or any other plan.

Begin.
