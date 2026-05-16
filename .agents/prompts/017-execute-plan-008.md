# Prompt for Claude Code agent — Execute PLAN-008 (walking-skeleton E2E + OIDC mock + un-fixme SSO specs)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). **Current state:** PLAN-001..007 are committed and green. The end-to-end happy path (signup → post → approve → enroll → lock → complete → mark payment-sent → confirm received → `closed`) works at the API layer (PLAN-005 walking-skeleton E2E test) and at the per-page UI layer (PLAN-006's 7 page-focused Playwright specs). What's missing: a canonical chained Playwright spec that drives the FULL UI flow with the FULL stack (real Better Auth via OIDC mock server, real Postgres, real tRPC, real Resend wired but mocked at the SDK seam) end-to-end. PLAN-008 lands this, plus three PLAN-004 SSO specs that were `test.fixme()`'d pending an in-process OIDC mock (no longer deferred — implement them here).

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/008-walking-skeleton-e2e-test.md` end-to-end, then verify against `docs/plans/008-walking-skeleton-e2e-test-validation.md` §6 pass/fail gates. You produce:

- **OIDC mock server** running in-process during Playwright's `globalSetup`, on a fixed port (or OS-assigned with a discovery file), implementing the four canonical Better Auth-facing endpoints: `/.well-known/openid-configuration`, `/oauth/authorize`, `/oauth/token`, `/userinfo`. Plus a control endpoint (e.g., `/_test/profile`) for seeding the next-profile-to-return.
- **`OIDC_DISCOVERY_URL` env var support in `packages/auth/src/config.ts`** — the genericOAuth plugin honors this when set; falls back to Google's production discovery URL when not.
- **`apps/web/e2e/walking-skeleton.spec.ts`** — the canonical chained happy-path spec driving the FULL UI flow with 4 personas (Active, Alumni, Moderator, Admin), per PLAN-008 §4 Step 3.
- **Persona helpers and seed fixtures** at `apps/web/e2e/fixtures/{personas,seed-chapter}.ts` (or wherever PLAN-008's directory convention lands).
- **Un-fixme'd PLAN-004 SSO specs** at `apps/web/__e2e__/auth/{sso-happy-path,hd-restriction,account-linking}.spec.ts` — remove `test.fixme(true, ...)` blocks; rewrite `oauth-mock.ts` to use the in-process mock's control endpoint instead of the broken `page.route()` approach.
- **`nextCookies` plugin added to `packages/auth/src/config.ts`** — PLAN-006 agent's flagged follow-up (see Trap 5). Removes the Playwright `page.request` workaround in PLAN-006's e2e support.
- **Per-spec test isolation** so the 5x-no-flake gate holds under `--workers > 1` — PLAN-006 validation agent's flagged follow-up (see Trap 6).
- **Resend mock seam for Playwright** — PLAN-007's `__setResendForTests()` is in-process and won't reach the out-of-process `pnpm dev` server (see Trap 7). Implement a test-only path that records Resend calls in-memory inside the Next.js process + exposes them via a test-only HTTP endpoint Playwright can query.
- **One commit:** `test(e2e): walking-skeleton happy-path Playwright test + OIDC mock + nextCookies + test isolation`.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Honour every feedback memory (ask-don't-invent, brief responses, doc conventions, **test-DB rule: PG16 via testcontainers, no SQLite or MySQL substitution**, skip-confirm-when-strong).
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root project context. The **"Domain invariant — FSM-only state writes"** section is still load-bearing: PLAN-008 introduces no production-code writers; only test fixtures + a few env-var-gated test-mode escape hatches. PLAN-003's `no-direct-state-writes.test.ts` MUST stay green.
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — "This is NOT the Next.js you know." For any App Router / Server Component / Server Action change, read `node_modules/next/dist/docs/`. Heavily relevant when adding the test-only route handler in Trap 7.
4. `docs/plans/008-walking-skeleton-e2e-test.md` — the plan. §3 Outputs, §4 Steps 1–4 (Step 3.5 inserted for un-fixme), §5 verification, §7 risks, §9 Q-PLN-NN (resolved leans).
5. `docs/plans/008-walking-skeleton-e2e-test-validation.md` — validation gates, including 5x-no-flake on the chained spec + all 3 un-fixme'd SSO specs passing + `OIDC_DISCOVERY_URL` honored + mock-server clean teardown.
6. `docs/domain-driven-design/001-ddd-active-walking-skeleton.md` + `002-ddd-alumni-walking-skeleton.md` — the E-NN timeline + Mermaid diagrams that the chained spec realises step-by-step. Your assertions follow these timelines.
7. `docs/designs/004-auth-wiring.md` (relevant sections) — Better Auth genericOAuth plugin config + the `mapProfileToUser` hook that does HD-restriction. Your OIDC mock must serve profiles that exercise the matching-HD and non-matching-HD paths.
8. **Existing PLAN-004 SSO specs** at `apps/web/__e2e__/auth/{sso-happy-path,hd-restriction,account-linking}.spec.ts` + the helper at `apps/web/__e2e__/support/oauth-mock.ts` — read them to understand what they currently assume and what needs to change (the `page.route()` approach is fundamentally broken for server-side OIDC fetches).
9. **PLAN-007's Resend test seam** — `packages/notifications/src/send-email.ts` (the `__setResendForTests` hook + how `sendEmail` consumes it). Useful background for designing the out-of-process equivalent in Trap 7.

**What's already in the repo you can rely on:**
- `@app/test-utils.startPostgres()` — testcontainers PG16 helper.
- `runMigrations()` from `@app/db/migrate` — apply schema before tests start.
- `auth, oidcEnabled` from `@app/auth` — Better Auth instance + SSO-enabled flag (checks all three of `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_HOSTED_DOMAIN`).
- `verifyInviteToken`, `findActiveInviteToken` from `@app/auth` — invite-token helpers (Server Action calls them).
- `appRouter.createCaller(ctx)` — for any seed work that needs to drive tRPC (e.g., Admin generates invite tokens before the spec acts as Alumni).
- The `packages/api/__tests__/e2e/walking-skeleton.test.ts` API-level chained test (from PLAN-005) — read it for the assertion shape the Playwright version should mirror at the UI layer.
- `apps/web/playwright.config.ts` — existing config (PLAN-004 + PLAN-006 contributed). You'll extend it for PLAN-008.

## What you do NOT do

- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans, DDD). If a design ambiguity blocks a step, **escalate to the user** — do not improvise.
- Do not modify `packages/db/`, `packages/domain/`, `packages/api/` (except adding the test-only Resend-capture seam if you decide that lives there — see Trap 7; a `packages/notifications/` change is more natural). PLAN-003's static-analysis test must stay green with no allowlist changes.
- **Do not introduce production code paths gated on `NODE_ENV === 'test'`** without explicit guards. Every test-only escape hatch (Resend recorder, OIDC discovery override, test-control HTTP endpoints) must:
  1. No-op in production (`NODE_ENV !== 'test'` OR a dedicated `RESEND_TEST_MODE` / similar env var).
  2. Return 404 from production routes (no test endpoints leaked to prod surface area).
  3. Be reviewable in the diff — flag every such gate in the commit message.
- Do not skip the Resend mock — assertions on the TreasurerBreakdown email payload are mandatory per VALIDATION-008 §6.
- Do not delete PLAN-006's per-page Playwright specs (`apps/web/e2e/walking-skeleton/*.spec.ts`). They're complementary to PLAN-008's canonical chained spec (per-page = fast-feedback; chained = integration confidence). Both must pass.
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not commit until PLAN-008 §5 + VALIDATION-008 §6 gates are all green.
- Do not push to remote — the user pushes. (Branch protection lands in PLAN-009.)

## Specific traps to watch for

**Trap 1 — In-process OIDC mock server: lifecycle + port collision.**
PLAN-008 §4 Step 1 suggests a fixed port (e.g., `127.0.0.1:9999`) but real-world `pnpm --filter web e2e` runs back-to-back will collide on a stuck port if globalTeardown is sloppy. Two safer patterns:
- **OS-assigned port + discovery file:** create the HTTP server with `port: 0`, capture the assigned port from `server.address()`, write it to `apps/web/.playwright-tmp/oidc-port` (gitignored), and have the spec + the `OIDC_DISCOVERY_URL` env var read from this file.
- **Or guarantee teardown:** wrap server close in a `try/finally` inside globalTeardown; assert the port is freed via a `net.connect` probe.
Either is fine; pick one and stick to it. The validation gate "mock-server lifecycle clean across consecutive runs" (VALIDATION-008 §6) will fail otherwise.

Suggested implementation:
- Use Node's built-in `http.createServer` — keep the mock dependency-light (no Express or oidc-provider-mock unless they're already in node_modules). The 4 endpoints + 1 control endpoint are <100 lines of code.
- The mock's `/oauth/authorize` GET redirects to `${REDIRECT_URI}?code=test-code&state=${state}` (the redirect URI is the Better Auth callback at `/api/auth/callback/oauth/google-workspace`).
- The `/oauth/token` POST returns `{ access_token: 'test-token', id_token: '<signed_jwt>', token_type: 'Bearer', expires_in: 3600 }`. The id_token JWT must include `sub`, `email`, `email_verified: true`, `name`, `hd` (or omitted, depending on the seeded profile). Sign with a self-generated RSA key pair; publish the public key at `/.well-known/jwks.json` and reference the JWKS URI in the discovery document.
- The `/userinfo` GET returns the seeded profile, keyed by the bearer token.
- The `/_test/profile` POST takes JSON of the next profile to serve (or a queue of profiles). Reset between tests via `/_test/reset` or by clearing the queue.

**Trap 2 — `OIDC_DISCOVERY_URL` env-var override in `packages/auth/src/config.ts`.**
Add the override at the genericOAuth plugin's config:
```ts
genericOAuth({
  providers: [{
    providerId: 'google-workspace',
    clientId: process.env.OIDC_CLIENT_ID!,
    clientSecret: process.env.OIDC_CLIENT_SECRET!,
    discoveryUrl: process.env.OIDC_DISCOVERY_URL
      ?? 'https://accounts.google.com/.well-known/openid-configuration',
    // ...existing mapProfileToUser, etc.
  }],
}),
```
Verify Better Auth's `genericOAuth` plugin accepts `discoveryUrl` — check `node_modules/better-auth/dist/plugins/generic-oauth/*` or `node_modules/better-auth/dist/docs/`. If the plugin uses a different option name, use that name and flag the divergence.

**Trap 3 — Walking-skeleton chained spec is ONE big `test()`, not multiple.**
VALIDATION-008 §6 verifies the audit-log sequence at the END. If you split into multiple `test()` blocks, each gets a fresh page/context unless you carefully share state — but you'd then need to share DB seed state too, which becomes a race. Stay with one `test('full happy-path job loop', async () => { ... })` and use `test.step()` for readability sub-sections.

Personas via Playwright's `context.storageState()`:
- After signing up each persona once during `globalSetup` (or at the start of the test), call `context.storageState({ path: '...' })` to persist the auth cookie state.
- Switching persona = `await page.context().clearCookies(); await page.context().addCookies(JSON.parse(...))` from the persisted state.

**Trap 4 — Audit-log final assertion: 7 FSM transitions, optional enroll/unenroll rows.**
At the end of the spec, call `appRouter.createCaller(ctx).jobs.getHistory({ jobId })` (or fetch via HTTP if simpler) as the seeded Admin. Assert the 7 expected transitions in order per PLAN-008 §5:
1. `null → awaiting_moderation` (Alumni)
2. `awaiting_moderation → approved` (Moderator)
3. `approved → enrollment_open` (system)
4. `enrollment_open → locked` (Alumni)
5. `locked → completed` (Alumni)
6. `completed → payment_sent` (Alumni)
7. `payment_sent → closed` (Active)

Per VALIDATION-008 §5: enroll/unenroll audit rows from `recordRelationshipEvent` may ALSO appear between rows 3 and 4 (`fromState === toState === 'enrollment_open'`, `note: 'enroll'`). Either enumerate them explicitly OR filter them out — the gate accepts both. Be consistent.

**Trap 5 — `nextCookies` plugin in `packages/auth/src/config.ts` (PLAN-006 follow-up).**
PLAN-006's e2e support layer worked around a missing `nextCookies` plugin by POSTing to `/api/auth/sign-in/email` via `page.request` — bypassing the Server-Action form flow. Add the plugin:
```ts
import { nextCookies } from 'better-auth/next-js';
export const auth = betterAuth({
  // ...
  plugins: [
    genericOAuth({ ... }),
    nextCookies(),
  ],
});
```
Then update PLAN-006's e2e support (likely `apps/web/__e2e__/support/db.ts` or similar) and PLAN-008's persona helpers to use the actual `<form action={signInAction}>` flow. The `nextCookies` plugin forwards Set-Cookie headers from Better Auth's internal fetch response back to the browser through the Server Action return value — this is the documented Better Auth + Next.js pattern.

Verify `nextCookies` exists in the installed Better Auth version (`node_modules/better-auth/dist/next-js/`). If not, escalate — it may be in a different submodule path or named differently across Better Auth versions.

**Trap 6 — Per-spec test isolation under `--workers > 1` (PLAN-006 follow-up).**
PLAN-006's validation noted: `no-token-signup` and `invite-signup-happy-path` specs fail intermittently under `--workers=9` due to cross-spec races on the shared dev DB. Fix this here so the 5x-no-flake gate (VALIDATION-008 §6) holds under any worker count.

Cheapest robust pattern: **per-spec unique identifiers + truncate-affected-tables in `beforeEach`.**
- Each spec generates UUID-suffixed emails / display names (e.g., `alumni-${randomUUID()}@test.example`) so cross-spec contamination is impossible.
- `beforeEach` truncates `jobs`, `job_enrollments`, `job_state_transitions`, `users` (BUT preserve the bootstrap Admin), `user_role_transitions`, `account`, `session`, `verification`, `invite_tokens`. Truncate via a fixture helper that runs the SQL directly against the testcontainer.
- `chapter_settings` survives — seeded once in globalSetup.

Alternative (heavier): per-spec testcontainers — fresh PG per spec. Probably too slow.

Alternative (cleaner but more code): per-spec Postgres schemas — each spec runs in its own schema. Complex to wire through Drizzle's session handling.

Pick the cheapest pattern and document it in the commit message.

**Trap 7 — Resend mock seam for out-of-process Playwright.**
PLAN-007's `__setResendForTests(client)` injects a mock into `packages/notifications/src/send-email.ts`'s closure — works for in-process Vitest tests, useless for Playwright (which talks to `pnpm dev`, a separate Node process).

Implementation pattern:
1. In `packages/notifications/src/send-email.ts`, when `process.env.RESEND_TEST_MODE === 'true'`, route all sends through an in-memory store (`testResendCalls: SendEmailInput[]`) instead of the real Resend SDK. Return `{ id: 'test-<n>' }` synthetically.
2. Add a NEW test-only route handler at `apps/web/app/api/_test/resend-calls/route.ts`:
   - `GET` returns the in-memory `testResendCalls` array as JSON.
   - `DELETE` clears it (for `beforeEach`).
   - Both return 404 (`return new Response(null, { status: 404 })`) when `process.env.RESEND_TEST_MODE !== 'true'`.
3. The walking-skeleton spec queries this endpoint after marking payment-sent:
   ```ts
   const resp = await page.request.get('/api/_test/resend-calls');
   const calls = await resp.json();
   expect(calls).toHaveLength(1);  // one TreasurerBreakdown
   expect(calls[0].to).toBe('treasurer@test.example');
   expect(calls[0].subject).toContain('payment-sent for "Help me move a couch"');
   ```
4. `globalSetup` exports `RESEND_TEST_MODE=true` into the env vars passed to `pnpm dev`.
5. In `beforeEach`, the spec also clears the store: `await page.request.delete('/api/_test/resend-calls');`

The `__setResendForTests` injection hook from PLAN-007 stays for in-process Vitest tests — both seams coexist. Document the choice in the commit message (Resend has two test seams now, for the two different test surface areas).

**Trap 8 — Better Auth callback URL must match the OIDC mock's redirect.**
The mock's `/oauth/authorize` redirects to `${BETTER_AUTH_CALLBACK_URL}?code=test-code&state=${state}`. The callback URL is whatever Better Auth registered for the OAuth flow — likely `http://localhost:3000/api/auth/callback/oauth/google-workspace` (verify by reading `packages/auth/src/config.ts` + Better Auth's URL conventions). The `state` parameter is generated by Better Auth on the initial `/api/auth/sign-in/oauth/google-workspace` POST — your mock just echoes it back.

Get this URL wrong and the SSO specs all 401. Test by reading the network log: the browser's first request to the mock should be `/oauth/authorize?response_type=code&client_id=...&redirect_uri=...&state=...&scope=...`; the mock's `Location` header should be exactly `${decoded_redirect_uri}?code=test-code&state=${decoded_state}`.

**Trap 9 — HD restriction + non-HD profile path.**
`hd-restriction.spec.ts` seeds a profile with `hd: 'wrong.example'` (or missing entirely). PLAN-004's `mapProfileToUser` aborts in this case BEFORE creating a `users` row — Better Auth surfaces the abort by redirecting to `/login?error=hd_restriction`. The spec asserts:
1. After clicking the SSO button + mock completing the flow, the browser lands on `/login?error=hd_restriction`.
2. The `users` table has ZERO rows for the test email — verified via a direct DB query in the spec (using the testcontainer connection).

**Trap 10 — Account linking happy path.**
`account-linking.spec.ts`:
1. Acts as a fresh user → opens an invite link → signs up via the form (credential account). Verify one `users` row + one `account` row with `providerId: 'credential'`.
2. Signs out.
3. Acts as the same user → clicks "Sign in with Google" → mock serves a profile with the SAME email + matching `hd`. Better Auth's account-linking logic kicks in (the email matches + the OIDC provider is in the `trustedProviders` list).
4. Verify one `users` row (same `id` as before) + two `account` rows (one credential, one google-workspace).

Per Better Auth's account-linking docs: `emailVerified` must be `true` on the OIDC account for linking to happen automatically. The mock's id_token MUST include `email_verified: true`.

**Trap 11 — PLAN-006's per-page Playwright specs must STILL pass.**
PLAN-008 doesn't replace PLAN-006's per-page specs (`apps/web/e2e/walking-skeleton/{smoke-routes,post-job,post-approve-enroll,lock-job,complete-job,payment-sent,confirm-received}.spec.ts`). They remain useful for fast-feedback failure attribution. They MAY need adjustments if PLAN-008's test-isolation refactor (Trap 6) reshapes the e2e support layer — but the SPECS themselves should be untouched. If they break because of a shared-helper change, fix the helper, not the spec.

**Trap 12 — Cross-plan invariant.**
After your work: `pnpm --filter @app/domain test no-direct-state-writes` MUST still exit 0. PLAN-008 introduces NO production-code writers to `jobs.state` / `users.role` / audit tables; only test fixtures + test-only escape hatches. The static-analysis allowlist must NOT grow.

## Definition of done

Every box in VALIDATION-008 §6 green:

- [ ] `pnpm --filter web e2e -- --grep walking-skeleton` passes — the canonical chained spec runs to completion in <2 minutes.
- [ ] Run the chained spec 5x in a row — all 5 pass; no flake.
- [ ] The final audit-log assertion enumerates the 7 expected FSM transitions in order (per Trap 4); enroll/unenroll rows handled consistently.
- [ ] The mocked-Resend store records EXACTLY ONE `TreasurerBreakdown` call after the markPaymentSent step, with the expected `to` + subject + payload fields.
- [ ] **PLAN-004 SSO specs un-fixme'd and passing:** `sso-happy-path.spec.ts`, `hd-restriction.spec.ts`, `account-linking.spec.ts` — all three run + pass against the OIDC mock server. `test.fixme(true, ...)` blocks removed.
- [ ] **`OIDC_DISCOVERY_URL`** env override honored by `packages/auth/src/config.ts` — verified via reading the source AND via the SSO specs hitting the mock (mock's request log shows `/.well-known/openid-configuration` hits).
- [ ] **Mock-server lifecycle clean** — running `pnpm --filter web e2e` twice in a row succeeds; the OIDC mock port is freed between runs.
- [ ] **`nextCookies` plugin** added to `packages/auth/src/config.ts`'s plugin array; PLAN-006's e2e support layer no longer uses the `page.request` workaround; user-facing Server-Action sign-in flow works end-to-end in Playwright.
- [ ] **Per-spec test isolation** under `--workers > 1` — run `pnpm --filter web e2e -- --workers=9` for the entire suite (PLAN-004 auth + PLAN-006 walking-skeleton + PLAN-008 chained + 3 un-fixme'd SSO specs) — all pass.
- [ ] **PLAN-006 per-page specs still green** — `pnpm --filter web e2e -- e2e/walking-skeleton/` passes (7/7).
- [ ] **PLAN-005 integration tests still green** — `pnpm --filter @app/api test` exit 0 (111+/111+).
- [ ] **PLAN-007 notifications tests still green** — `pnpm --filter @app/notifications test` + `pnpm --filter @app/settings test` exit 0.
- [ ] **Cross-plan invariant:** `pnpm --filter @app/domain test no-direct-state-writes` exit 0; IGNORE_DIRS unchanged.
- [ ] `pnpm --filter web build` succeeds — confirms the test-only `/api/_test/resend-calls` route compiles AND returns 404 in non-test mode.
- [ ] Repo-wide `pnpm -r typecheck` exit 0.
- [ ] One commit matching PLAN-008's commit message; touched files limited to `apps/web/__e2e__/*`, `apps/web/e2e/*`, `apps/web/playwright.config.ts`, `apps/web/app/api/_test/resend-calls/route.ts`, `packages/auth/src/config.ts`, `packages/notifications/src/send-email.ts` (test-mode branch only), `pnpm-lock.yaml` (if new test deps). No `docs/` changes. No production-code state-machine changes.

Report back (under 250 words): commit hash, anything escalated, the cross-spec isolation pattern you picked, the OIDC mock port strategy you picked, explicit confirmation that (1) PLAN-003 static check passes, (2) PLAN-005 integration tests pass, (3) PLAN-006 per-page Playwright specs pass, (4) PLAN-007 notifications tests pass, (5) all 5 chained-spec runs passed in sequence, (6) all 3 un-fixme'd SSO specs pass.

## If you get stuck

If a step's verification fails AND it's not obviously a copy-paste fix, **escalate to the user** with: (1) which step, (2) the exact error, (3) what you tried, (4) your lean. Do not invent product or architectural decisions. Do not modify any design or upstream plan.

Particular escalation candidates to watch for (anything in this list, stop and ask):
- Better Auth's `genericOAuth` plugin doesn't accept `discoveryUrl` (or accepts a differently-named option) — read the installed version's source, use the actual name, flag the divergence.
- Better Auth's `nextCookies` is in a different submodule path than `better-auth/next-js`, OR doesn't exist in the installed version — flag.
- The OIDC mock server's id_token signing fails because of a Node/JWT-library compatibility issue — flag; fall back to an unsigned/symbolic id_token if Better Auth permits in dev mode (probably not — flag instead).
- The `nextCookies` plugin breaks an existing PLAN-004 spec (e.g., a redirect chain it didn't anticipate) — investigate; the fix is likely in the spec's assertions, NOT in disabling the plugin.
- Cross-spec isolation breaks the bootstrap-admin flow (the truncate-between-specs wipes the Admin row that subsequent specs need) — preserve the Admin row OR re-bootstrap in a per-spec `beforeEach`.

Begin.
