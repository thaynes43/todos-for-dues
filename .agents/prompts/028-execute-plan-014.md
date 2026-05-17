# Prompt for Claude Code agent — Execute PLAN-014 (Invite management UI + admin nav fix)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent for this plan — load `.agents/profiles/developer.md` first.** Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). **Current state:** v0.5.0 just deployed to the launch chapter at `https://todos-for-dues.haynesops.com`. PLAN-001..012 are committed, green, and live. PLAN-014 closes two Admin-UI gaps surfaced after the v0.5.0 deploy.

The project is on **PR-flow + release-please**: `main` is branch-protected, every code change lands via PR after CI green (`lint-and-typecheck` + `test`), conventional commit prefixes drive release-please SemVer bumps, and merging a release PR creates the next `vX.Y.Z` tag.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/014-invite-management-and-admin-nav.md` end-to-end. Two distinct gaps in one PR:

1. **`/admin` nav-link gap.** `RoleAwareNav` doesn't surface the existing `/admin/*` area. Add one entry (Admin role only).
2. **Invite-token Admin UI gap.** Build `/admin/invites` with mint / list / revoke flows. Fix the signup action to mark tokens revoked on successful redemption (PRD-003 R-14 — the schema + verify infrastructure already exists, only the consumption was missing).

**The plan calls for spawning two subagents in parallel** for the backend (`invites` tRPC router + signup-action fix) and UI (route + 3 components + tests). You orchestrate, integrate, and open one PR.

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — the developer role definition. §1–§7 are the loop; §10 onward is the deploy flow (skip for this run — coordinator will handle the deploy separately after merge).
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root project context. **`## Pull-request flow (NORMATIVE)`** + **`## Release versioning (release-please)`** sections are load-bearing.
4. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — "This is NOT the Next.js you know." Both new routes touch the App Router; read `node_modules/next/dist/docs/` for current idioms.
5. `docs/plans/014-invite-management-and-admin-nav.md` — the plan. **§4 Steps + §7 Risks are load-bearing.** §7 Risk 1 (atomicity of signup + token-revoke) is the most nuanced architectural call; the plan's lean is "revoke first, then create user" — implement that unless you can verify Better Auth's `signUpEmail` participates cleanly in a Drizzle transaction.
6. `docs/plans/014-invite-management-and-admin-nav-validation.md` — VALIDATION-014 gates.
7. `docs/prds/003-identity-and-access.md` §5 R-11..R-14 + §5.1 AC-10..AC-13 — the requirements + acceptance criteria.
8. `packages/db/src/schema/invite-tokens.ts` — the existing schema you're building on. **Do not modify** — schema is sufficient as-is.
9. `packages/auth/src/invite-tokens/verify.ts` — existing verify helpers. Reuse, don't modify.
10. `apps/web/app/signup/actions.ts` — **you will modify this** to atomically revoke on success (R-14). Read the existing code first.
11. `apps/web/components/RoleAwareNav.tsx` — you'll add one entry.
12. `apps/web/components/AdminNav.tsx` + `apps/web/app/admin/layout.tsx` — you'll add one entry to `ADMIN_NAV_ENTRIES`.
13. **Existing component idioms to mirror:** `apps/web/components/{ResolveDisputeModal,DisputeCardList,SettingsForm,JobDetailView,JobStateBadge}.tsx` — mutation + toast pattern, server-side role-gate redirect pattern, confirm-dialog pattern (mirror `ResolveDisputeModal`'s nested-dialog approach for the revoke confirm).
14. **Existing e2e helpers** from PLAN-010 (`apps/web/e2e/mvp/support.ts`), PLAN-011 (`apps/web/e2e/admin/support.ts`), PLAN-012 (`apps/web/e2e/roles/support.ts`). The admin support has `installPageerrorListener`, `seedAdmin`, etc.
15. **Existing test patterns** in `packages/auth/__tests__/integration/signup-flow.integration.test.ts` — your single-use case extends this.

## What you do NOT do

- **Do not push directly to `main`** — branch protection rejects it. Open a PR; wait for CI green; the user merges.
- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans, DDD). PRD-003 was already amended with R-11..R-14; consume those requirements but do not edit the doc.
- Do not modify `packages/db/schema/`. The schema already supports everything you need.
- Do not modify `packages/domain/` source. There are no FSM transitions involved here; `transitionRole` / `transitionJob` are not called.
- Do not add Playwright to CI — that's PLAN-013's scope. Your Playwright spec runs LOCALLY only.
- Do not bypass branch protection with `gh pr merge --admin` or `--no-verify`.
- Do not implement email delivery of invite URLs — PRD-003 §10 backlog; out of scope per PLAN-014 §6.
- Do not add an `expires_at` column or any other schema changes.
- Do not allow Moderator or Admin as a `preselectedRole` for new invites — the DB CHECK enforces it, but you add a Zod guard at the procedure boundary as defense-in-depth (R-11 + R-04).
- Do not commit until ALL PLAN-014 §5 + VALIDATION-014 §6 gates are green locally.
- Do not change the test DB engine — PG16 via testcontainers per ADR-004.
- Do not log invite tokens to console/observability. The strings are the secret material.

## Specific traps to watch for

**Trap 1 — Subagent coordination.**

The plan calls for spawning Subagent A (backend) and Subagent B (UI) in parallel. They share the tRPC type surface (`AppRouter` from `packages/api`). The cleanest pattern:

1. **You** land Step 0 (branch) and Step 1 (nav-link fix) yourself, single-thread. Commit + (optionally) push.
2. **You** write the `invites` router stub in `packages/api/src/routers/invites.ts` — just the procedure signatures, returning placeholder values — and register it. This locks in the type contract.
3. **Spawn Subagent A** with the prompt "fill in the router bodies + write integration tests + fix the signup action." See template below.
4. **In parallel**, spawn Subagent B with the prompt "build the `/admin/invites` route + the 3 components + Vitest tests + Playwright spec, consuming `trpc.invites.{mint,list,revoke}`. Treat the API contract as fixed."
5. **You** integrate when both report back. Run the full cross-plan invariant suite. Push.

If you skip step 2 (the type-contract stub), Subagent B will write code against an inferred-from-prose API and likely fail typecheck. Always lock the contract first.

**Subagent prompt template (Subagent A — backend):**

> You are a backend track within PLAN-014. The plan lives at `docs/plans/014-invite-management-and-admin-nav.md`. Read §3 Outputs (backend portion) + §4 Step 2 (Subagent A scope) + §7 Risk 1 (the atomicity strategy — implement (a) revoke-first unless you can prove Better Auth participates in a Drizzle transaction). Working dir: `/Users/thaynes/src/projects/todos-for-dues`. Branch: `plan-014-invite-management-and-admin-nav` (already exists; checkout). Your scope:
> - Fill in `packages/api/src/routers/invites.ts` per §3 (the stub is already there; preserve the signatures).
> - Add `packages/api/__tests__/integration/invites.test.ts` with cases per §3 + VALIDATION-014 §3 coverage matrix.
> - Modify `apps/web/app/signup/actions.ts` per §7 Risk 1 — revoke-first strategy (a).
> - Extend `packages/auth/__tests__/integration/signup-flow.integration.test.ts` with the single-use case (PRD-003 AC-13) AND the concurrent-redemption race case (VALIDATION-014 §6 "R-14 race-safety asserted").
> - Run `pnpm --filter @app/api test`, `pnpm --filter @app/auth test`, `pnpm --filter @app/domain test no-direct-state-writes`, `pnpm -r typecheck` — all must exit 0.
> - Commit your work (`feat(api): invites router` + `fix(auth): single-use invite tokens` is a sensible split; the PR squashes anyway).
> - Report back with files changed, test counts, deviations. <250 words.

**Subagent prompt template (Subagent B — UI):**

> You are a UI track within PLAN-014. The plan lives at `docs/plans/014-invite-management-and-admin-nav.md`. Read §3 Outputs (UI portion) + §4 Step 2 (Subagent B scope). Working dir: `/Users/thaynes/src/projects/todos-for-dues`. Branch: `plan-014-invite-management-and-admin-nav` (already exists; checkout). The tRPC contract is fixed: `trpc.invites.mint({ preselectedRole: 'Active' | 'Alumni' })` → `{ id, token, preselectedRole, createdAt, createdBy }`; `trpc.invites.list()` → `Array<{ id, token, preselectedRole, createdAt, createdByDisplayName }>`; `trpc.invites.revoke({ id: string })` → `{ revokedAt: Date }`. Your scope:
> - Add `apps/web/app/admin/invites/page.tsx` (server component; reads session origin via `headers()` for the `baseUrl`).
> - Add `apps/web/components/{InviteList,MintInviteButton,RevokeInviteButton}.tsx` per §3 — mirror existing PLAN-010/011 idioms (`ResolveDisputeModal` for nested dialogs; shadcn `<Dialog>` + the `ui/modal` primitive).
> - Extend `apps/web/components/AdminNav.tsx` + its test to add the "Invites" entry between Audit-log and Users (Q-PLN-01 lean).
> - Add Vitest component tests + the Playwright spec `apps/web/e2e/admin/invites.spec.ts` per VALIDATION-014 §5. Install `installPageerrorListener` per the PLAN-011 hygiene rule.
> - Run `pnpm --filter web test`, `pnpm --filter web build` (with `DATABASE_URL` unset), `pnpm -r typecheck` — all must exit 0. Run the new spec 3× under `--workers=1` and confirm no-flake.
> - Commit your work (`feat(web): invite management UI` is fine).
> - Report back with files changed, test counts, spec timing, deviations. <250 words.

**Trap 2 — Atomicity of signup + token-revoke (R-14, plan §7 Risk 1).**

Strategy (a) — revoke-first — is the plan's lean. Implementation sketch for Subagent A:

```ts
// In apps/web/app/signup/actions.ts, BEFORE auth.api.signUpEmail:
const revoked = await db
  .update(inviteTokens)
  .set({ revokedAt: sql`now()` })
  .where(and(eq(inviteTokens.token, input.token), isNull(inviteTokens.revokedAt)))
  .returning({ preselectedRole: inviteTokens.preselectedRole });

if (revoked.length === 0) {
  return { ok: false, error: 'Invite link is invalid or has been revoked.', field: 'token' };
}
const preselectedRole = revoked[0]!.preselectedRole;

// Now create the user — the token is already revoked, so:
// - Concurrent redemptions: only one survives.
// - Crash here: token is consumed but no user; Admin can prune if needed.
try {
  await auth.api.signUpEmail({ … role: preselectedRole … });
} catch (err) { … }
```

This replaces the existing two-step `verifyInviteToken` + `signUpEmail` pattern. **Delete the verifyInviteToken call** — the UPDATE-RETURNING does both jobs (verify + consume) in one atomic operation.

**Trap 3 — Token format / entropy.**

Use `crypto.randomBytes(16).toString('base64url')` for the token. 128 bits of entropy, 22 URL-safe chars, paste-friendly. Do NOT use `crypto.randomUUID()` (visually confusing — looks like other UUIDs in the app).

**Trap 4 — `invites.list` field projection.**

The `createdByDisplayName` field requires a JOIN to `users`:
```ts
const rows = await ctx.db
  .select({
    id: inviteTokens.id,
    token: inviteTokens.token,
    preselectedRole: inviteTokens.preselectedRole,
    createdAt: inviteTokens.createdAt,
    createdByDisplayName: users.displayName,
  })
  .from(inviteTokens)
  .leftJoin(users, eq(users.id, inviteTokens.createdBy))
  .where(isNull(inviteTokens.revokedAt))
  .orderBy(desc(inviteTokens.createdAt));
```
SELECT-only — PLAN-003 `no-direct-state-writes` invariant unaffected.

**Trap 5 — Server-side `baseUrl` for the signup link.**

The `<InviteList>` displays URLs like `https://todos-for-dues.haynesops.com/signup?token=…`. The host comes from the request headers (Next.js 16 `headers()` API), NOT from a hardcoded env var (which would be wrong in dev). Server-component pattern:
```ts
import { headers } from 'next/headers';
const h = await headers();
const proto = h.get('x-forwarded-proto') ?? 'http';
const host = h.get('host') ?? 'localhost:3000';
const baseUrl = `${proto}://${host}`;
```
Pass `baseUrl` to `<InviteList>` as a prop; the client component concatenates with `/signup?token=…`.

**Trap 6 — Clipboard permission in Playwright.**

`navigator.clipboard.writeText` requires `clipboard-write` permission in Playwright. Configure in `playwright.config.ts`:
```ts
use: { permissions: ['clipboard-read', 'clipboard-write'] }
```
Verify the existing config doesn't already grant these (some setups do globally). If you have to change `playwright.config.ts`, scope the change minimally.

**Trap 7 — Conventional-commit message + PR title for release-please.**

PLAN-014 §3 specifies `feat(web): Admin invite management UI + nav link + single-use token redemption per PRD-003 R-11..R-14`. `feat:` is load-bearing — release-please will bump minor on the next release PR (v0.5.0 → v0.6.0).

**Trap 8 — Cross-plan invariants (the ones you must not break).**

After your work:
- `pnpm --filter @app/domain test no-direct-state-writes` MUST still exit 0; **IGNORE_DIRS unchanged**. Your only DB write is to `invite_tokens.revoked_at`; that's not a state-machine table.
- `pnpm --filter @app/api test` MUST still exit 0 (≥ 117 + new).
- `pnpm --filter @app/auth test` MUST still exit 0 (≥ 23 + new for single-use case + concurrent-redemption case).
- `pnpm --filter web e2e -- e2e/walking-skeleton/` MUST still pass (PLAN-006 7/7).
- `pnpm --filter web e2e -- --grep walking-skeleton.spec.ts` MUST still pass (PLAN-008 chained, 5× no-flake).
- `pnpm --filter web e2e -- __e2e__/auth/` (or `--grep sso.spec.ts`) MUST still pass (PLAN-008 SSO).
- `pnpm --filter web e2e -- e2e/mvp/` MUST still pass (PLAN-010 9/9 under `--workers=1`).
- `pnpm --filter web e2e -- e2e/admin/` MUST still pass (PLAN-011 10/10 + your new `invites.spec.ts`).
- `pnpm --filter web e2e -- e2e/roles/` MUST still pass (PLAN-012 7/7).
- `pnpm --filter @app/notifications test && pnpm --filter @app/settings test` MUST still exit 0.
- `unset DATABASE_URL && pnpm --filter web build` MUST succeed (PLAN-002 lazy Proxy intact).
- `pnpm -r typecheck` MUST exit 0.

## PR-flow specifics

1. `git checkout -b plan-014-invite-management-and-admin-nav` **off latest `origin/main`** (PLAN-011 lesson — not off another open PR's branch).
2. Land Step 1 (nav-link fix) directly; commit.
3. Write the tRPC router stub (signatures only, placeholder returns); commit.
4. Spawn Subagents A + B in parallel; wait for both reports.
5. Integrate; run the full cross-plan invariant suite locally.
6. Run the new `invites.spec.ts` 3× under `--workers=1` to verify no-flake.
7. `git push -u origin plan-014-invite-management-and-admin-nav`.
8. `gh pr create --base main --head plan-014-invite-management-and-admin-nav --title 'feat(web): Admin invite management UI + nav link + single-use token redemption per PRD-003 R-11..R-14' --body '<PR body per the template in §3>'`.
9. Wait for CI green (`lint-and-typecheck` + `test`). Playwright is NOT in CI.
10. **Gate 1 — STOP for user review.** Tell the user the PR is up + CI green; they decide on merge.

**Do not merge the PR yourself.**

## Definition of done

Every box in VALIDATION-014 §6 green:

- [ ] All Vitest component tests pass: `pnpm --filter web test`.
- [ ] All integration tests pass: `pnpm --filter @app/api test` + `pnpm --filter @app/auth test`.
- [ ] Playwright `invites.spec.ts` passes 3× no-flake under `--workers=1`.
- [ ] `pageerror` listener present in `invites.spec.ts`.
- [ ] DB-state assertions for mint / single-use / revoke all green.
- [ ] R-14 race-safety case asserts exactly-one survivor.
- [ ] No privileged-role mint possible (Zod + DB CHECK).
- [ ] No `console.error` during Playwright runs.
- [ ] `pnpm --filter web build` exits 0 (`DATABASE_URL` unset).
- [ ] `pnpm -r typecheck` exits 0.
- [ ] One PR opened with conventional-commit title (`feat(web): …`).
- [ ] CI green on the PR.
- [ ] **Cross-plan invariants ALL green** — confirm each explicitly in your report.
- [ ] **Subagent reports** integrated; no untracked artefacts left behind.

Report back (under 350 words): PR URL, commit hashes, subagent file lists, any escalations, **which atomicity strategy you chose for the signup-action (a/b/c per plan §7 Risk 1)**, **explicit confirmation of each cross-plan invariant**.

## If you get stuck

Escalate with: (1) which step, (2) exact error, (3) what you tried, (4) your lean. Do not invent product or architectural decisions. Do not modify any design or upstream plan.

Particular escalation candidates:
- Better Auth's `signUpEmail` does NOT participate in a Drizzle transaction → strategy (b) is dead → use (a). If even (a) is somehow broken (e.g., `db.update().returning()` doesn't propagate the row count cleanly), escalate.
- The clipboard assertion fails in Playwright despite the permission config → flag; lean on `page.evaluate(() => navigator.clipboard.readText())` if needed; if THAT also fails, the assertion might need to be replaced with reading the input element's value (the displayed URL).
- A subagent's report indicates they wrote a file you didn't expect (e.g., a migration). Escalate before integrating.
- The integration test for concurrent redemption is flaky (occasionally both succeed) → that's a real correctness bug in your atomicity strategy. Investigate; don't paper over with a retry.

Begin.
