# Prompt for Claude Code agent — Validate PLAN-007 (against VALIDATION-007)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright). The docs-first SDLC pairs every implementation plan (`PLAN-NNN`) with a validation plan (`VALIDATION-NNN`); your job is the validation half for PLAN-007 (notifications adapter + 4 email helpers + Resend webhook + new `@app/settings` package).

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/007-notifications-validation.md`'s §6 pass/fail gates against the PLAN-007 commit(s) on the current branch. PLAN-007 introduced a new `packages/settings/` package with `getSetting<T>()`, replaced `packages/notifications/src/stubs.ts` with real Resend-backed helpers per DESIGN-005, updated `packages/api/src/routers/jobs.ts` call sites to drop the now-redundant `recipient` argument, and added a Resend bounce/complaint webhook at `apps/web/app/api/webhooks/resend/route.ts` with real HMAC signature verification. You run the gates, confirm each is green, and report. If a gate fails, you do **not** relax it — small mechanical fixes only, otherwise escalate.

The **cross-plan invariant** is non-negotiable: PLAN-003's `no-direct-state-writes.test.ts` MUST still pass with no IGNORE_DIRS allowlist changes. Notifications helpers READ from `jobs`, `users`, `chapter_settings` — that's fine; they MUST NOT write to `jobs.state`, `users.role`, `job_state_transitions`, or `user_role_transitions`.

Additionally: PLAN-005's existing 107 integration tests in `packages/api/__tests__/integration/` must STILL pass after the call-site swap (jobs.ts now calls `sendTreasurerEmail({ jobId })` etc. without the `recipient` argument). And PLAN-006's 7 walking-skeleton Playwright specs must still pass (they don't exercise notifications directly but the api package's behavior could ripple).

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.**
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root context, especially "Domain invariant — FSM-only state writes."
3. `docs/plans/007-notifications-validation.md` — validation contract. §3 coverage matrix (PRD/DESIGN ref × test × file), §4 unit test list per package, §5 Playwright (minimal), §6 gate checklist.
4. `docs/plans/007-notifications-implementation.md` §3 Outputs, §5 Verification — expected artifacts and commit shape.
5. `docs/designs/005-notifications-adapter.md` §4 + §7 — the contract the implementation must realise.
6. `docs/adrs/010-per-instance-settings-storage.md` — the `getSetting()` semantics that `@app/settings` must implement.
7. `git log -10 --oneline` — confirm PLAN-007 commit(s) exist; read each commit message; the execution agent should have noted any Q-PLN-NN landed-with-a-lean items + which old `getSettingValue(ctx, ...)` shim was removed vs. kept.

## What you do NOT do

- Do not modify any doc under `docs/` (plans, PRDs, ADRs, designs).
- Do not modify any database migration files. Notification helpers consume the existing `chapter_settings` rows seeded by `0004_bootstrap_chapter_settings.sql`. If a key is missing, escalate; do NOT add a new migration.
- Do not relax a gate. Small mechanical fixes are OK in `packages/notifications/*` or `packages/settings/*` or `apps/web/app/api/webhooks/resend/*` (missing import, wrong path, Vitest snapshot off-by-one, header name typo); anything bigger → **escalate to the user**.
- Do not add any path to PLAN-003's `no-direct-state-writes.test.ts` IGNORE_DIRS allowlist. If the test fails because a notifications helper writes to a tracked table, the fix is in the helper.
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not amend PLAN-007's commit(s). If an implementation fix is needed, create a new commit (`fix(notifications): …` or `fix(settings): …`).
- Do not push to remote — the user pushes.

## Definition of done

Every box in VALIDATION-007 §6 green, verified by running the commands:

- [ ] `pnpm --filter @app/settings typecheck` exit code 0.
- [ ] `pnpm --filter @app/settings test` exit code 0 — `get-setting.test.ts` covers: DB-value returned when row present; env-var fallback when DB row absent; throws when both absent for a required key.
- [ ] `pnpm --filter @app/notifications typecheck` exit code 0.
- [ ] `pnpm --filter @app/notifications test` exit code 0 — all VALIDATION-007 §4 tests pass:
  - `send-email.test.ts` — skip mode (`RESEND_API_KEY` missing) returns `{ skipped: true }` + logs; HTML + text rendered from React Email; idempotency-key passthrough on `headers`; throws on mocked Resend error.
  - `treasurer-breakdown.test.ts` — recipient composed from `getSetting('treasurer_recipient_email')`; chapter name from `getSetting('chapter_display_name')` in subject; payload includes job description + total + line items + job ID + timestamp; idempotency key is `job:<id>:payment_sent`; throws when job has no `perActiveDuesCredit`.
  - `admin-dispute.test.ts` — recipient from `admin_recipient_email`; payload includes disputer display name + role + reason + job ID + drill-in link to `/admin/jobs/<jobId>`; **NO** idempotency key.
  - `moderator-new-posting.test.ts` — recipient from `moderators_recipient_email`; payload includes description + dues + count + poster + `/moderation-queue` link; idempotency key is `job:<id>:moderation_queue`.
  - `alumni-rejection.test.ts` — recipient is the posting Alumni's own email (from `users` table, NOT a chapter setting); payload includes description + rejection reason.
  - `templates/__tests__/*.test.tsx` — snapshot tests for each of the 4 templates; ALSO substring assertions confirm PRD-pinned fields appear in rendered HTML (PRD-002 R-12 / PRD-005 R-07 / PRD-006 R-07 / PRD-002 rejection).
- [ ] Extended integration tests in `packages/api/__tests__/integration/jobs.test.ts` pass:
  - `post → sendModeratorQueueEmail fires` — mocked Resend records one call with the expected `to` + subject + `Idempotency-Key`.
  - `markPaymentSent → sendTreasurerEmail fires` — same shape.
  - `dispute → sendAdminDisputeEmail fires` — same shape; verify NO `Idempotency-Key` header.
  - `afterCommit failure does not roll back the transition` — mocked Resend rejects; the FSM transition still committed (state advanced + `job_state_transitions` row written); error visible via `console.error` spy.
- [ ] `apps/web/__tests__/api/webhooks-resend.test.ts` exit code 0:
  - 200 on valid Svix-signed payload.
  - 401 on missing `svix-signature` header.
  - 401 on invalid signature (HMAC mismatch).
  - 401 on stale timestamp (>5min old) — replay protection.
  - `email.bounced` and `email.complained` events logged via `console.warn`.
  - `email.delivered` / `email.opened` / `email.clicked` events ignored (no log).
- [ ] (Optional) `apps/web/e2e/notifications/webhook-receiver.spec.ts` passes if implemented.
- [ ] `pnpm --filter web build` succeeds — confirms the new webhook route compiles under Next.js 16.
- [ ] **Regression — PLAN-005 integration tests:** `pnpm --filter @app/api test` exit code 0; 107 (or more, with the extensions) of 107+ pass. The call-site swap in `jobs.ts` MUST not have broken any pre-existing assertion.
- [ ] **Regression — PLAN-006 Playwright specs:** `pnpm --filter web e2e -- e2e/walking-skeleton/` exit code 0; 7/7 specs pass. (Run once — VALIDATION-007 doesn't require 3x like VALIDATION-006.)
- [ ] **Cross-plan invariant:** `pnpm --filter @app/domain test no-direct-state-writes` exit code 0; IGNORE_DIRS allowlist unchanged (no `packages/notifications/`, `packages/settings/`, or anything else added).
- [ ] Repo-wide `pnpm -r typecheck` exit code 0 — all 8 packages (7 prior + `@app/settings`).
- [ ] PLAN-007's commit(s) on the branch with the expected `feat(notifications): …` message; touched files limited to `packages/{settings,notifications}/*`, `packages/api/src/routers/jobs.ts`, `packages/api/__tests__/integration/jobs.test.ts`, `apps/web/app/api/webhooks/resend/*`, `apps/web/__tests__/api/webhooks-resend.test.ts`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (if allowlist edits were needed). No `docs/` files touched.

Report back (under 200 words): which gates passed, any implementation fixes you made (with new commit hash), anything escalated, **and explicit confirmation that (1) PLAN-003's static-analysis test still passes, (2) PLAN-005's existing 107+ integration tests still pass, (3) PLAN-006's 7 walking-skeleton Playwright specs still pass**.

## Specific things to look hard at

1. **Call-site swap in `packages/api/src/routers/jobs.ts`.** Open the file. Lines previously at ~409-413 (`markPaymentSent.afterCommit`) and ~525-535 (`dispute.afterCommit`) should NO LONGER compute `recipient = await getSettingValue<string>(ctx, ...)`. They should just call `await sendTreasurerEmail({ jobId: input.jobId })` and `await sendAdminDisputeEmail({ jobId: input.jobId, disputerId: ctx.userId!, reason: input.reason })`. If the `recipient` argument is still being passed, the helper signature change wasn't propagated — TypeScript should have caught it at typecheck, but verify.

2. **`packages/api/src/lib/settings.ts` (or wherever `getSettingValue(ctx, key)` lived).** The PLAN-005-era helper is either (a) deleted entirely if no other consumer exists, or (b) re-implemented as a thin shim that delegates to `@app/settings.getSetting(key)`. Grep the api package for `getSettingValue` — if any call sites remain, verify the shim is in place; if no call sites, the helper file should be gone. The settings router (`packages/api/src/routers/settings.ts`) may still have its own DB access logic — that's fine; the `users.list` / `settings.list` / `settings.set` patterns predate `@app/settings`.

3. **`packages/notifications/src/index.ts` exports.** The barrel should re-export `sendModeratorQueueEmail`, `sendTreasurerEmail`, `sendAdminDisputeEmail`, `sendAlumniRejectionEmail` from `./helpers/*`, AND `sendEmail` from `./send-email`. The OLD `stubs.ts` file should be GONE (deleted; not just emptied). If `stubs.ts` is still present as a stub, that's a leftover — flag it.

4. **Helper recipient lookup.** Open `packages/notifications/src/helpers/treasurer-breakdown.ts`. The helper MUST call `await getSetting<string>('treasurer_recipient_email')` (or via the new module's import path) — NOT take recipient as a parameter. Same for `admin-dispute.ts` (`admin_recipient_email`) and `moderator-new-posting.ts` (`moderators_recipient_email`). `alumni-rejection.ts` fetches the recipient from `users` table by `job.postedBy` — NOT from chapter_settings (that's a special case; PRD-002 rejection emails go to the posting Alumni's own address).

5. **Idempotency keys.** Per DESIGN-005 §4.2 / §4.3 / §4.4:
   - `sendTreasurerEmail` → `'job:<id>:payment_sent'` — PRESENT
   - `sendModeratorQueueEmail` → `'job:<id>:moderation_queue'` — PRESENT
   - `sendAdminDisputeEmail` → **ABSENT** (re-disputes are legitimate separate events)
   - `sendAlumniRejectionEmail` → `'job:<id>:rejected'` (if implemented)
   The unit tests for each helper should assert this exact key shape.

6. **`afterCommit` failure does not roll back.** Open the new integration test in `jobs.test.ts`. The expected pattern:
   ```ts
   mockResend.send.mockRejectedValueOnce(new Error('Resend down'));
   await caller.jobs.markPaymentSent({ jobId });
   // FSM transition still committed:
   const job = await db.select(...).from(jobs).where(eq(jobs.id, jobId));
   expect(job[0].state).toBe('payment_sent');
   const audit = await db.select(...).from(jobStateTransitions).where(...);
   expect(audit).toHaveLength(<expected count including this one>);
   // Error logged but not thrown:
   expect(consoleErrorSpy).toHaveBeenCalled();
   ```
   If the test catches a thrown error instead of asserting the state advanced + log, the `afterCommit` swallow-and-log contract is misimplemented — flag.

7. **Webhook HMAC verification is REAL, not a stub.** Open `apps/web/app/api/webhooks/resend/route.ts`. There should be a `verifyResendSignature(body, signature, secret)` function that computes `HMAC-SHA256(secret, "<msg_id>.<timestamp>.<body>")` and compares against the `svix-signature` header. NOT `return true`. The test fixture should include a known body + known secret + computed expected signature.

8. **Replay protection.** The webhook route should reject signatures with `svix-timestamp` headers older than 5 minutes. Look for a `Math.abs(now - timestamp) > 5 * 60 * 1000` check (or equivalent). VALIDATION-007's tests include a stale-timestamp case — verify it returns 401.

9. **Bootstrap migration sanity-check.** `packages/db/migrations/0004_bootstrap_chapter_settings.sql` must seed all 5 MVP keys per ADR-010 (`admin_recipient_email`, `treasurer_recipient_email`, `moderators_recipient_email`, `chapter_timezone`, `chapter_display_name`). If any are missing, the integration tests in `jobs.test.ts` will fail with "throws when both DB and env absent" — but the actual root cause is the migration. Flag this as a PLAN-002 gap, escalate; do NOT add a new migration from PLAN-007.

10. **No PLAN-005 regression.** Run `pnpm --filter @app/api test` and confirm 107+ tests pass (107 pre-PLAN-007 + however many extensions PLAN-007 added). If any pre-existing test fails, the call-site swap or settings refactor introduced a regression — flag it; the fix is in the offending code, not in the test.

11. **No PLAN-006 regression.** Run `pnpm --filter web e2e -- e2e/walking-skeleton/`. PLAN-006's specs don't exercise notifications directly, but the api package's call-site changes could ripple if (e.g.) a tRPC procedure now throws synchronously instead of via `afterCommit`. Verify all 7 pass.

12. **No native-build allowlist changes you can't explain.** If PLAN-007's commit modifies `pnpm-workspace.yaml`'s `onlyBuiltDependencies` list, the added entries should correspond to real native deps from the new packages (`resend`, `@react-email/components`, `@react-email/render`). Grep `node_modules/<dep>/package.json` for `"scripts": { "postinstall": ... }` to verify. Unexplained allowlist entries are scope-leaks.

## If a gate fails

1. **Mechanical fix (allowed):** missing import, wrong helper-fn name in a call site, Vitest snapshot drift, off-by-one in a test fixture, idempotency-key string typo — fix the implementation, re-run the gate, create a `fix(notifications): …` (or `fix(settings): …`, `fix(api): …`) commit.
2. **Cross-plan invariant regression (FIX, do not allowlist):** if PLAN-003's test fails because a `packages/notifications/` or `packages/settings/` file writes to a tracked table, the fix is in the offending code — route reads through `@app/db` queries; never write to state/role/audit tables from helpers.
3. **PLAN-005 / PLAN-006 regression (FIX, do not skip):** if an existing test fails after PLAN-007's changes, the fix is in PLAN-007's modifications — restore the expected behavior. Do NOT mark the regressing test as `.skip` or `test.fixme`.
4. **Bootstrap migration gap (escalate):** if a required chapter_settings key isn't seeded, escalate — this is a PLAN-002 gap, not a PLAN-007 fix.
5. **Resend SDK / React Email / Svix divergence from design sketch (escalate IF non-trivial):** small adjustments to match real SDK shape are fine (the design's code blocks are sketches per the doc's voice); a structural mismatch (e.g., Resend SDK no longer has `.emails.send()`) is escalate.
6. **Test reveals an upstream design problem (escalate):** do not edit the design — surface to the user.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Begin.
