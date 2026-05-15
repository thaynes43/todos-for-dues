# Prompt for Claude Code agent — Validate PLAN-004 (against VALIDATION-004)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js + tRPC + Drizzle + Postgres 16 + Better Auth + shadcn/ui + Playwright; self-hosted on `haynes-ops`). The docs-first SDLC pairs every implementation plan (`PLAN-NNN`) with a validation plan (`VALIDATION-NNN`); your job is the validation half for PLAN-004 (auth wiring).

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/004-auth-wiring-validation.md`'s §6 pass/fail gates against the PLAN-004 commit on the current branch. PLAN-004 produced `packages/auth/` (Better Auth instance + 3 hooks + invite-token verifier) and `apps/web/app/{signup,login,forgot-password}/` (3 Server Actions + minimal form pages) and the OAuth catch-all route. You run the gates, confirm each is green, and report. If a gate fails, you do **not** relax it — small mechanical fixes only, otherwise escalate.

**Cross-plan invariant to verify:** PLAN-003's `no-direct-state-writes.test.ts` MUST still pass after PLAN-004 lands. PLAN-004's bootstrap-admin hook routes through `transitionRole` from `@app/domain` rather than writing `user_role_transitions` directly (per the prompt the execution agent received). If the static-analysis test fails, the hook bypassed the FSM — that's a real regression, not a test relaxation candidate.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.**
2. `docs/plans/004-auth-wiring-validation.md` — validation contract. §3 coverage matrix, §4 unit tests, §5 Playwright specs, §6 gate checklist.
3. `docs/plans/004-auth-wiring-implementation.md` §3 Outputs, §5 Verification — expected artifacts and commit shape.
4. `git log -1` — confirm PLAN-004's commit exists on the current branch before starting.
5. The PLAN-004 commit message — the execution agent should have noted the bootstrap-admin-uses-transitionRole adaptation. If they didn't, ask them; that adaptation is load-bearing.

## What you do NOT do

- Do not modify any doc under `docs/` (plans, PRDs, ADRs, designs).
- Do not relax a gate. Small mechanical fixes to the implementation are OK (missing dep, wrong path, Better Auth API version drift); anything bigger → **escalate to the user**.
- Do not add packages/auth or apps/web paths to PLAN-003's static-analysis allowlist if it fires — the FIX is in the offending hook (route through `transitionRole`), not in the test.
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not amend PLAN-004's commit. If an implementation fix is needed, create a new commit (`fix(auth): <what>`).
- Do not push to remote — the user pushes.

## Definition of done

Every box in VALIDATION-004 §6 green, verified by running the commands:

- [ ] `pnpm --filter @app/auth typecheck` exit code 0.
- [ ] `pnpm --filter @app/auth test` exit code 0 — all unit + integration suites in §4 pass.
- [ ] `pnpm --filter web build` exit code 0.
- [ ] `pnpm --filter web e2e -- --grep auth/` — every Playwright spec in VALIDATION-004 §5 passes:
  - `invite-signup-happy-path.spec.ts` (invite token → user row with role from token → auto-signin)
  - `no-token-signup.spec.ts` (no token → rejection; no user row created)
  - `sso-happy-path.spec.ts` (mocked Workspace SSO → Alumni user)
  - `hd-restriction.spec.ts` (non-HD email → rejected; no user row)
  - `no-oidc-config.spec.ts` (no env vars → SSO button absent)
  - `account-linking.spec.ts` (existing email + SSO → same user_id, no dup)
  - `signup-no-display-name.spec.ts` (empty displayName → field-level error)
  - `sso-no-name-claim.spec.ts` ("What should we call you?" fallback prompt)
  - `bootstrap-admin.spec.ts` (matching email signs in → role Admin + audit row)
- [ ] **Cross-plan invariant:** `pnpm --filter @app/domain test no-direct-state-writes` still exits 0. This proves PLAN-004's bootstrap-admin hook routed through `transitionRole` rather than raw SQL.
- [ ] Repo-wide `pnpm -r typecheck` exit code 0.
- [ ] PLAN-004's commit is on the branch with the expected message; only `packages/auth/*` + `apps/web/app/{signup,login,forgot-password,api/auth}/*` + `pnpm-lock.yaml` modified; no `docs/` files touched.

Report back (under 200 words): which gates passed, any implementation fixes you made (with new commit hash), anything escalated, **and explicit confirmation that PLAN-003's static-analysis test still passes**.

## Specific things to look hard at

1. **Bootstrap-admin hook uses `transitionRole`:** open `packages/auth/src/hooks/bootstrap-admin.ts`. Look for `import { transitionRole } from '@app/domain'`. The hook should: read current role, no-op if already Admin, otherwise call `transitionRole({ targetUserId, expectedFromRole, toRole: 'Admin', initiator: { id: null, kind: 'system' }, note: 'BOOTSTRAP_ADMIN_EMAIL promotion' })`. If you see `await tx.update(users).set({ role: 'Admin' })` or `await tx.insert(userRoleTransitions)` in this file, the implementation is wrong (and PLAN-003's static-analysis test should have caught it — re-run it as a tripwire).
2. **HD-restriction rejects BEFORE user creation:** open the integration test for HD restriction. It should assert `SELECT count(*) FROM users WHERE email = '<non-HD email>'` returns 0 after the rejection. If the rejection happens after user creation, the hook order is wrong.
3. **Account linking integration test result:** read its assertion. After the SSO sign-in of an existing app-managed email, there should be exactly ONE row in `users` for that email AND exactly ONE row in Better Auth's `accounts` linking the OIDC provider to that user_id. Two rows in either is a duplicate-account bug.
4. **`session.user.role` is present:** open `session-extension.test.ts` or the integration that exercises authenticated tRPC. Confirm the session payload exposes `role`. PLAN-005 reads this on every authenticated request — if it's missing, every PLAN-005 procedure will 401 or break role gates.
5. **Workspace OIDC mock:** the SSO Playwright specs should use `page.route()` to intercept `/api/auth/callback/oauth/google-workspace` with a stubbed payload. If the spec hits the real Google OAuth endpoint, you'll see flakes — the mock pattern from DESIGN-004's testing section is the right move.

## If a gate fails

1. **Mechanical fix (allowed):** Better Auth API version drift (e.g., the `additionalFields` shape changed), missing env-var test fixture, typo — fix in the implementation, re-run the gate, create a new `fix(auth): …` commit.
2. **Static-analysis regression (FIX, do not allowlist):** if PLAN-003's test fails because a `packages/auth/` file writes to `users.role` or `user_role_transitions` directly, the fix is to route through `@app/domain`'s `transitionRole`. Do NOT add packages/auth to the allowlist.
3. **Plan/validation ambiguity (escalate):** the plan says X, the design says Y, and they conflict in a way the implementation can't reconcile without a product decision — stop and ask the user.
4. **Test reveals an upstream design problem (escalate):** do not edit the design — surface to the user.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Begin.
