# Prompt for Claude Code agent — Validate PLAN-008 (against VALIDATION-008)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright). The docs-first SDLC pairs every implementation plan (`PLAN-NNN`) with a validation plan (`VALIDATION-NNN`); your job is the validation half for PLAN-008 — the canonical walking-skeleton chained Playwright spec, the in-process OIDC mock server, the three un-fixme'd PLAN-004 SSO specs, the `nextCookies` plugin addition, the per-spec test isolation refactor, and the out-of-process Resend mock seam.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/008-walking-skeleton-e2e-test-validation.md`'s §6 pass/fail gates against the PLAN-008 commit(s) on the current branch. You run the gates, confirm each is green, and report. If a gate fails, you do **not** relax it — small mechanical fixes only, otherwise escalate.

The **cross-plan invariants** are non-negotiable:
1. PLAN-003's `no-direct-state-writes.test.ts` MUST still pass with no IGNORE_DIRS allowlist changes. PLAN-008 introduces test fixtures + test-only escape hatches; production-code state writers must be unchanged.
2. PLAN-005's 111+ integration tests must still pass.
3. PLAN-006's 7 per-page walking-skeleton Playwright specs must still pass.
4. PLAN-007's notifications + settings tests must still pass.
5. PLAN-004's other auth specs (non-fixme'd ones — `invite-signup-happy-path`, `no-token-signup`, `no-oidc-config`, `signup-no-display-name`, `bootstrap-admin`, `signup-no-display-name`) must still pass.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.**
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root context.
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — Next.js 16 reminder, relevant when inspecting the test-only route handler at `apps/web/app/api/_test/resend-calls/route.ts`.
4. `docs/plans/008-walking-skeleton-e2e-test-validation.md` — validation contract. §3 coverage matrix, §5 Playwright acceptance criteria, §6 gate checklist.
5. `docs/plans/008-walking-skeleton-e2e-test.md` §3 Outputs, §4 Step 3.5 (un-fixme SSO specs), §5 Verification.
6. `git log -10 --oneline` — confirm PLAN-008 commit(s) exist; read each commit message; the execution agent should have noted the cross-spec isolation pattern, OIDC mock port strategy, and any open Q-PLN-NN with leans.

## What you do NOT do

- Do not modify any doc under `docs/` (plans, PRDs, ADRs, designs).
- Do not modify any `packages/*` source EXCEPT for tiny `fix(area):` mechanical fixes if a gate fails (and only with the rules below).
- Do not relax a gate. Small mechanical fixes are OK (missing import, wrong port number, off-by-one assertion, Playwright timeout that needs bumping); anything bigger → **escalate to the user**.
- Do not add any path to PLAN-003's `no-direct-state-writes.test.ts` IGNORE_DIRS allowlist.
- Do not skip flaky-test runs. If a chained-spec run fails 1 of 5, INVESTIGATE the flake source — do not "just run it again to confirm." Common flake sources: Better Auth session-cookie timing, tRPC mutation pending state vs. assertion timing, OIDC mock server startup race (await `.listening` event), Resend mock race (assertion fires before afterCommit's microtask).
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not amend PLAN-008's commit(s). If an implementation fix is needed, create a new commit (`fix(e2e): …` or `fix(auth): …`).
- Do not push to remote — the user pushes.

## Definition of done

Every box in VALIDATION-008 §6 green, verified by running the commands:

- [ ] **Chained spec discoverable + named correctly:** `pnpm --filter web e2e --list | grep walking-skeleton.spec.ts` returns the canonical spec.
- [ ] **Chained spec passes 5x:** run `pnpm --filter web e2e -- --grep "walking-skeleton"` FIVE TIMES IN A ROW. All 5 must pass. Capture timings — under 2 minutes per run per VALIDATION-008 §5.
- [ ] **Audit-log assertion correct:** the 7-row sequence (per Trap 4 in the execute prompt + PLAN-008 §5) is enumerated correctly. Open the spec; verify the final `expect(history).toEqual(...)` or equivalent matches the 7 transitions in order. Enroll/unenroll rows handled consistently (either enumerated OR filtered out).
- [ ] **Resend mock recorded ONE TreasurerBreakdown call:** the spec's assertion against `/api/_test/resend-calls` GET should expect exactly one entry with `to === <treasurer setting>`, `subject` containing `"payment-sent"`, and the rendered template containing the job description + per-Active credit lines.
- [ ] **3 un-fixme'd SSO specs all pass:**
  - `pnpm --filter web e2e -- --grep sso-happy-path` exit 0.
  - `pnpm --filter web e2e -- --grep hd-restriction` exit 0.
  - `pnpm --filter web e2e -- --grep account-linking` exit 0.
  Open each spec file: confirm `test.fixme(true, ...)` blocks are GONE. The env-conditional `test.skip(!OIDC_CLIENT_ID, ...)` SHOULD still be present (it's the "OIDC config not present" guard for environments without the mock).
- [ ] **`OIDC_DISCOVERY_URL` env override:** open `packages/auth/src/config.ts`; confirm the genericOAuth plugin reads `process.env.OIDC_DISCOVERY_URL` with a Google production default. Verify via the SSO specs: the OIDC mock's request log shows hits on `/.well-known/openid-configuration` during the spec runs (not Google's URL).
- [ ] **`nextCookies` plugin present:** open `packages/auth/src/config.ts`; confirm `import { nextCookies } from 'better-auth/next-js'` AND `nextCookies()` appears in the plugins array (likely as the last entry per Better Auth's convention).
- [ ] **Workaround removed:** grep `apps/web/__e2e__/support/` and `apps/web/e2e/fixtures/` for `'/api/auth/sign-in/email'` — there should be NO `page.request.post('/api/auth/sign-in/email', ...)` calls. PLAN-006's workaround is gone; persona helpers use the actual `<form action={signInAction}>` flow OR the equivalent Playwright keystroke-driven flow.
- [ ] **Mock-server lifecycle clean:** run `pnpm --filter web e2e` TWICE in a row, back-to-back. The second run must NOT fail with `EADDRINUSE` or similar port-stuck errors. (If the agent chose the OS-assigned-port + discovery-file pattern, also verify the discovery file is cleaned up — but a stale file isn't a hard fail as long as the port works.)
- [ ] **Cross-spec isolation works:** run `pnpm --filter web e2e -- --workers=9` for the entire suite. All specs must pass — no flake from cross-spec races. PLAN-006's previously-flaky specs (`no-token-signup`, `invite-signup-happy-path`) must now be stable.
- [ ] **PLAN-006 per-page specs still green:** `pnpm --filter web e2e -- e2e/walking-skeleton/` exit 0; 7/7 specs pass.
- [ ] **PLAN-005 integration tests still green:** `pnpm --filter @app/api test` exit 0; 111+/111+ pass.
- [ ] **PLAN-007 notifications + settings still green:** `pnpm --filter @app/notifications test && pnpm --filter @app/settings test` exit 0.
- [ ] **PLAN-004 non-SSO auth specs still green:** `pnpm --filter web e2e -- --grep "(invite-signup|no-token-signup|no-oidc-config|signup-no-display-name|bootstrap-admin)"` exit 0.
- [ ] **Cross-plan invariant:** `pnpm --filter @app/domain test no-direct-state-writes` exit 0; IGNORE_DIRS allowlist unchanged.
- [ ] **`pnpm --filter web build` succeeds** — including the test-only `/api/_test/resend-calls` route compiling. Verify the route returns 404 when `process.env.RESEND_TEST_MODE !== 'true'`: a quick way is to grep the route handler for the env-var guard.
- [ ] **Repo-wide `pnpm -r typecheck`** exit 0.
- [ ] **Commit shape:** PLAN-008's commit(s) on the branch with the expected message; touched files limited to the allowlist in the execute prompt's "Definition of done" (e2e + playwright config + auth config + send-email's test branch + the new test-only route + pnpm-lock if deps were added). No `docs/` files touched. No production state-machine changes.

Report back (under 250 words): which gates passed, any implementation fixes you made (with new commit hash), anything escalated, **and explicit confirmation that (1) PLAN-003 static check still passes, (2) PLAN-005 integration tests still pass, (3) PLAN-006 per-page Playwright specs still pass, (4) PLAN-007 notifications + settings tests still pass, (5) the chained spec passed 5x consecutively without flake, (6) all 3 un-fixme'd SSO specs pass, (7) the `--workers=9` run was clean.**

## Specific things to look hard at

1. **`nextCookies` plugin placement.** Open `packages/auth/src/config.ts`. The plugin should be in the `plugins` array. Better Auth's docs typically put it last (some plugins depend on the cookie context being set up). If it's not the last entry, sanity-check that the order doesn't break other plugins (`genericOAuth`, `emailAndPassword`). The user-facing `<form action={signInAction}>` flow should now propagate Set-Cookie headers back to the browser through the Server Action's return value.

2. **OIDC mock id_token signing.** Open the mock server implementation (likely `apps/web/__e2e__/support/oidc-mock.ts` or similar). The id_token should be a signed JWT (RS256 or ES256). The `/.well-known/openid-configuration` should advertise the JWKS URI, and `/.well-known/jwks.json` should serve the public key. If the agent took a shortcut with an unsigned token, verify Better Auth accepts it — the genericOAuth plugin likely DOES require signature verification (unless explicitly disabled). If unsigned tokens work, that's fine for a test seam, but worth flagging in the validation report.

3. **`/api/_test/resend-calls` production guard.** Open `apps/web/app/api/_test/resend-calls/route.ts`. Both `GET` and `DELETE` handlers MUST check `process.env.RESEND_TEST_MODE === 'true'` (or equivalent gate) and return 404 otherwise. A common mistake: only guarding one method. Test by running `pnpm --filter web build` (production-mode compile) and grepping the output for any reference to the test-mode store — there should be no leaks of the `testResendCalls` array variable into production bundles. If the build emits a warning about a dynamic env var in this file, that's actually GOOD — it means the route knows it's environment-dependent.

4. **Walking-skeleton spec is ONE `test()` block.** Open `apps/web/e2e/walking-skeleton.spec.ts`. There should be a single `test('full happy-path job loop', ...)` with `test.step()` sub-sections for readability. NOT multiple `test()` functions sharing state via globals.

5. **Personas via storageState.** Open `apps/web/e2e/fixtures/personas.ts` (or wherever). The pattern: sign each persona in once → save `context.storageState({ path: '...' })` → switch persona by loading the saved state. NOT re-signing-in every step (slow + flake-prone).

6. **Cross-spec isolation pattern.** Open the e2e support layer (look for files modified by PLAN-008's commit under `apps/web/__e2e__/support/` or `apps/web/e2e/fixtures/`). Identify the chosen pattern (per-spec unique IDs, truncate-affected-tables, per-spec Postgres schemas, fresh testcontainer-per-spec). Verify:
   - The pattern is consistent across PLAN-004, PLAN-006, AND PLAN-008 specs (no one spec uses a different isolation strategy).
   - The bootstrap Admin row survives the truncation (otherwise PLAN-004's bootstrap-admin spec breaks).
   - `chapter_settings` rows seeded in globalSetup are preserved (otherwise PLAN-007 helpers fail with `MissingSettingError`).

7. **Audit-log assertion order.** Open the spec's final assertion. The 7 transitions must be in the order PLAN-008 §5 lists. Watch for off-by-one or out-of-order issues: `approved → enrollment_open` (row 3, system actor) often gets confused with `awaiting_moderation → approved` (row 2, Moderator actor) because they happen in the same logical action ("approve") but produce two audit rows via the `approveJob` two-row pattern.

8. **HD restriction profile.** Open `apps/web/__e2e__/auth/hd-restriction.spec.ts`. The spec should seed the OIDC mock with a profile whose `hd` claim is missing OR is `"wrong.example"` (NOT `OIDC_HOSTED_DOMAIN`). After clicking SSO, the browser lands on `/login?error=hd_restriction`. Verify the assertion is on the URL path/query, not just on a visible error message (defense-in-depth).

9. **Account-linking row counts.** Open `apps/web/__e2e__/auth/account-linking.spec.ts`. After invite-signup + SSO-sign-in:
   - `users` table: exactly 1 row for the test email.
   - `account` table: exactly 2 rows for that user — one with `providerId === 'credential'`, one with `providerId === 'google-workspace'` (or whatever the genericOAuth plugin's provider id is).
   The spec should query these counts directly via the testcontainer connection. If the spec only asserts "user can log in via both methods" without checking the table state, that's a weaker assertion than VALIDATION-008 requires — flag it.

10. **5x-no-flake gate is a real gate, not a vibe check.** Actually run 5 consecutive `pnpm --filter web e2e -- --grep "walking-skeleton"` invocations. Capture the timings + pass/fail for each. If any single run fails, do NOT mark the gate green; investigate the flake source. Common fix: increase Playwright's `expect` timeout for transitions through tRPC mutations (the default 5s is sometimes too aggressive for cold-start cases); OR add `await page.waitForLoadState('networkidle')` after each role-switching navigation.

11. **No production state-writer regression.** The cross-plan invariant test (PLAN-003) only fires on direct `INSERT INTO jobs / users / job_state_transitions / user_role_transitions` outside `packages/domain/`. PLAN-008 shouldn't trip it (no production code changes; only test fixtures + a test-only route). Verify by running the test AND by spot-checking the diff: any new `INSERT INTO` statements should be in test files (`__tests__/`, `__e2e__/`, `e2e/`) only.

## If a gate fails

1. **Mechanical fix (allowed):** missing import in the spec, wrong port number, off-by-one assertion, Playwright timeout that needs bumping for the cold-start case, test-only env-var guard missing on `DELETE` but present on `GET` — fix the implementation, re-run the gate, create a `fix(e2e):` (or `fix(auth):` if it's the nextCookies wiring) commit.
2. **Cross-plan invariant regression (FIX, do not allowlist):** if PLAN-003's test fails, the fix is in the offending production code, not in the test.
3. **PLAN-004/005/006/007 regression (FIX, do not skip):** if any prior spec/test fails after PLAN-008's changes, the fix is in PLAN-008's modifications — restore the expected behavior. Do NOT mark the regressing test as `.skip` or `test.fixme`.
4. **Flake on the 5x chained-spec gate (INVESTIGATE):** identify the flake source per the "Specific things to look hard at" §10 above. Common: timing assumption in a tRPC mutation's pending → success transition; await-storageState before role-switch; ensure the OIDC mock server is fully listening before globalSetup completes.
5. **Test reveals an upstream design problem (escalate):** do not edit the design — surface to the user.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Begin.
