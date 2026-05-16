# Prompt for Claude Code agent — Execute PLAN-007 (notifications: Resend adapter + 4 helpers + webhook)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). **Current state:** PLAN-001 (scaffolding), PLAN-002 (DB schema + lazy `db` Proxy + Better Auth tables + chapter_settings bootstrap migration), PLAN-003 (FSM helpers with `afterCommit` semantics), PLAN-004 (Better Auth + Workspace OIDC + invite tokens + 3 Server Actions), PLAN-005 (all 5 tRPC routers with **stubbed** notification calls in `jobs.post.afterCommit`, `jobs.markPaymentSent.afterCommit`, `jobs.dispute.afterCommit`), and PLAN-006 (walking-skeleton UI: 5 routes, ~12 components, all 7 Playwright specs green) are committed. PLAN-007 replaces the notification stubs with real Resend-backed implementations per DESIGN-005, lands the bounce/complaint webhook, and introduces the `@app/settings` package per ADR-010.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/007-notifications-implementation.md` end-to-end, then verify against `docs/plans/007-notifications-validation.md` §6 pass/fail gates. You produce:

- **New package `packages/settings/`** with `getSetting<T>(key)` (DB-first + env-var fallback per ADR-010).
- **Replacement of `packages/notifications/src/stubs.ts`** with the real implementation per DESIGN-005 §3 file layout: `send-email.ts` (adapter), `helpers/{treasurer-breakdown,admin-dispute,moderator-new-posting,alumni-rejection}.ts`, `templates/{TreasurerBreakdown,AdminDispute,ModeratorNewPosting,AlumniRejection}.tsx` + `templates/_components/Layout.tsx`.
- **Updated `packages/notifications/src/index.ts`** that re-exports the same function names PLAN-005 already imports (`sendModeratorQueueEmail`, `sendTreasurerEmail`, `sendAdminDisputeEmail`) — but with new signatures (see Trap 1).
- **Updated `packages/api/src/routers/jobs.ts`** call sites — drop the now-redundant `recipient` argument; see Trap 1.
- **New webhook route** `apps/web/app/api/webhooks/resend/route.ts` per DESIGN-005 §4.7 with REAL HMAC signature verification (not the sketch's `return true`).
- **Tests per VALIDATION-007 §4**: unit tests in `packages/settings/__tests__/`, `packages/notifications/__tests__/`, `packages/notifications/templates/__tests__/`, `apps/web/__tests__/api/`; extended jobs-router integration tests in `packages/api/__tests__/integration/jobs.test.ts` that assert each `afterCommit` fires the right helper with a mocked Resend.
- **One commit:** `feat(notifications): Resend adapter + 4 email templates per DESIGN-005`.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Honour every feedback memory (ask-don't-invent, brief responses, doc conventions, **test-DB rule: PG16 via testcontainers, no SQLite or MySQL substitution**, skip-confirm-when-strong).
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root project context. The **"Domain invariant — FSM-only state writes"** section is still load-bearing: helpers READ from the DB (jobs, users, chapter_settings) — that's fine; they do NOT write to `jobs.state`, `users.role`, `job_state_transitions`, or `user_role_transitions`. PLAN-003's `no-direct-state-writes.test.ts` MUST stay green.
3. `docs/plans/007-notifications-implementation.md` — the plan. §3 Outputs, §4 Steps 1–7, §5 verification.
4. `docs/plans/007-notifications-validation.md` — validation gates and per-helper / per-template test inventory.
5. `docs/designs/005-notifications-adapter.md` — full design. §3 file layout, §4.1 `sendEmail` adapter, §4.2 treasurer helper (verbatim code), §4.3 admin-dispute helper (verbatim code), §4.4 moderator-new-posting helper (verbatim code), §4.5 alumni-rejection (optional MVP), §4.6 template sketches, §4.7 webhook receiver, §7 error handling, §8 testing approach.
6. `docs/adrs/010-per-instance-settings-storage.md` — `getSetting()` contract: DB-first, env-var fallback (`BOOTSTRAP_<KEY>` upper-snake), typed-error if both absent for a required key.
7. `docs/adrs/005-email.md` (skim) — Resend + React Email choice.
8. The relevant PRD §5 sections you're realising: PRD-002 R-12 + AC-01 (moderator-queue email), PRD-005 R-07 + AC-08 (treasurer email shape), PRD-006 R-07 + AC-07 (admin dispute email shape). Read the AC lists carefully — they pin the template content.

**What's already in the repo you can rely on:**
- `packages/db/migrations/0004_bootstrap_chapter_settings.sql` — seeds chapter_settings rows from `BOOTSTRAP_*` env vars at first deploy. Verify which keys are seeded by reading the migration; the 5 MVP keys per ADR-010 are `admin_recipient_email`, `treasurer_recipient_email`, `moderators_recipient_email`, `chapter_timezone`, `chapter_display_name`. If any are missing from the migration, escalate — don't add new migrations from PLAN-007 (DB schema changes are PLAN-002's purview).
- `packages/notifications/src/stubs.ts` — REPLACES; the 3 function signatures it exports today are what `packages/api/src/routers/jobs.ts` consumes (see Trap 1).
- `packages/api/src/routers/jobs.ts` — three call sites to update:
  - Line ~72: `createJob.afterCommit → sendModeratorQueueEmail({ jobId: id })` (already shape-correct; recipient was never passed here)
  - Line ~409-413: `markPaymentSent.afterCommit` computes `recipient = await getSettingValue<string>(ctx, 'treasurer_recipient_email')` then `sendTreasurerEmail({ jobId, recipient })` — drop the `recipient` param after Trap 1.
  - Line ~525-535: `dispute.afterCommit` computes `recipient = await getSettingValue<string>(ctx, 'admin_recipient_email')` then `sendAdminDisputeEmail({ jobId, disputerId, reason, recipient })` — drop the `recipient` param after Trap 1.
- `packages/api/src/lib/` (or wherever the `getSettingValue<T>(ctx, key)` helper currently lives) — this is PLAN-005's ctx-bound shim. Once `@app/settings.getSetting()` lands, replace internal usages with the new helper and remove the api-package version (DRY). If keeping it adds value (e.g., it provides ctx-aware caching that the global helper doesn't), document why — but the default is delete.
- `import { db } from '@app/db'` — Drizzle Proxy (lazy `Pool`). Helpers consume this directly.
- `import { jobs, users, chapterSettings } from '@app/db/schema'` — tables you'll query.
- `import { transitionJob, createJob } from '@app/domain'` — FSM helpers with `afterCommit` callback. **You do not call these from notifications code.** The api package already wires the afterCommit hooks; you swap the function bodies they call into.

## What you do NOT do

- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans, DDD). If a design ambiguity blocks a step, **escalate to the user** — do not improvise. (Plausible escalation: DESIGN-005 §4.7's signature-verification sketch returns `true` literally; consult Resend's actual webhook signing docs to implement HMAC; only escalate if the docs don't match the SDK in `node_modules/`.)
- Do not modify `packages/db/migrations/` or add new migrations. The chapter_settings table + bootstrap rows are PLAN-002's purview. If a key is missing, escalate.
- Do not modify `packages/domain/`. The `afterCommit` semantics (fire-and-forget, swallow + log on failure) are PLAN-003's; the notifications layer just provides the body of the callback. The static-analysis test `no-direct-state-writes.test.ts` must stay green with no allowlist changes.
- **Do not write any `UPDATE jobs SET state =` / `UPDATE users SET role =` / `INSERT INTO job_state_transitions` / `INSERT INTO user_role_transitions`** from notifications code. Helpers READ from these tables; they never write. PLAN-003's static check will fail the build otherwise.
- Do not invent settings keys beyond ADR-010 §Decision-outcome's 5 MVP enumeration (`admin_recipient_email`, `treasurer_recipient_email`, `moderators_recipient_email`, `chapter_timezone`, `chapter_display_name`). If a helper needs additional context, fetch it from the existing tables (jobs, users) — not a new setting.
- Do not skip ahead into PLAN-008+ scope. No Playwright spec authoring here (VALIDATION-007 §5 explicitly says minimal — only the optional webhook receiver spec; the canonical happy-path is PLAN-008's walking-skeleton spec, which already asserts the helpers fire via the integration tests you extend in Step 5).
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not commit until §5 + VALIDATION-007 §6 gates are all green.
- Do not push to remote — the user pushes. (Branch protection lands in PLAN-009; still pushing to `main` directly.)

## Specific traps to watch for

**Trap 1 — Helper signatures CHANGE from PLAN-005 stubs; tRPC call sites must update.**
PLAN-005's stubs (currently at `packages/notifications/src/stubs.ts`) take `recipient` as a parameter:
```ts
// CURRENT (stubs):
sendTreasurerEmail({ jobId: string; recipient: string | null }): Promise<void>
sendAdminDisputeEmail({ jobId: string; disputerId: string; reason: string; recipient: string | null }): Promise<void>
sendModeratorQueueEmail({ jobId: string }): Promise<void>  // (recipient was never in this stub's shape)
```
DESIGN-005 §4.2 / §4.3 / §4.4 spec the real helpers to fetch the recipient internally via `@app/settings.getSetting()`:
```ts
// NEW (real helpers per DESIGN-005):
sendTreasurerEmail({ jobId: string }): Promise<{ id: string } | { skipped: true; reason: string }>
sendAdminDisputeEmail({ jobId: string; disputerId: string; reason: string }): Promise<{ id: string } | { skipped: true; reason: string }>
sendModeratorQueueEmail({ jobId: string }): Promise<{ id: string } | { skipped: true; reason: string }>
```
After implementing the helpers, **update `packages/api/src/routers/jobs.ts`** to drop the now-dead `recipient` argument:
```ts
// BEFORE (jobs.ts line ~409-413):
const recipient = await getSettingValue<string>(ctx, 'treasurer_recipient_email');
await sendTreasurerEmail({ jobId: input.jobId, recipient });

// AFTER:
await sendTreasurerEmail({ jobId: input.jobId });
```
Same shape for `dispute.afterCommit` at line ~525-535. The PLAN-005-era `getSettingValue(ctx, ...)` helper (likely at `packages/api/src/lib/settings.ts` or similar — locate via grep) becomes orphaned in those call sites; delete it if no other consumer exists, or leave a deprecated re-export pointing at `@app/settings.getSetting` if other code paths still consume it. Run `pnpm -r typecheck` after the swap to confirm nothing else broke.

**Trap 2 — `@app/settings` is a NEW package — workspace plumbing matters.**
`pnpm-workspace.yaml` globs `packages/*` (per CLAUDE.md), so the new directory is auto-included. Create:
- `packages/settings/package.json` — match the other internal packages' shape (`"type": "module"`, `"main": "src/index.ts"`, `"types": "src/index.ts"`, `"exports": { ".": "./src/index.ts" }`). No build script — internal packages export TS directly per CLAUDE.md "Packaging notes."
- `packages/settings/tsconfig.json` — extend `../../tsconfig.base.json`; `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride` carry through automatically.
- `packages/settings/src/index.ts` — exports `getSetting<T>(key: string): Promise<T>` (typed), and ideally `getSettingOrDefault<T>(key: string, fallback: T): Promise<T>` for callers that have a safe default.
- Add the package as a workspace dep in any package that consumes it (`packages/notifications/package.json` — `"@app/settings": "workspace:*"`). Run `pnpm install` once at the repo root after manifest edits so the workspace symlinks resolve.

The new package does NOT need an entry in `pnpm-workspace.yaml`'s native build allowlist — no install-time scripts.

**Trap 3 — Resend SDK + React Email deps are NEW; install carefully.**
`packages/notifications/package.json` needs `resend`, `@react-email/components`, `@react-email/render` added. Run `pnpm --filter @app/notifications add resend @react-email/components @react-email/render` (NOT `pnpm install <pkg>` at root). After install, check `pnpm-workspace.yaml`'s `onlyBuiltDependencies` allowlist (per CLAUDE.md): if any of the new packages have install scripts (esbuild-shaped), add them to the allowlist explicitly. Re-run `pnpm install` at root after the allowlist edit if necessary.

**Trap 4 — Resend SDK should be MOCKED at SDK level in tests, not via `RESEND_API_KEY` skip mode.**
The `RESEND_API_KEY`-missing skip mode is a real production-adjacent code path (dev environment, smoke tests). It needs ONE unit test (`it('skips when RESEND_API_KEY missing')`). All other tests (treasurer payload shape, admin-dispute payload shape, etc.) need the SDK mocked at the module level so you can assert exact `resend.emails.send()` calls:
```ts
// In test setup:
import { vi } from 'vitest';
const mockSend = vi.fn().mockResolvedValue({ data: { id: 'mocked-id' }, error: null });
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));
```
Then set `process.env.RESEND_API_KEY = 'test-key'` in the test so the adapter doesn't enter skip mode. Each test resets `mockSend.mockClear()` between cases.

**Trap 5 — `afterCommit` failure must NOT roll back the FSM transition.**
Per DESIGN-005 §7 + DESIGN-002 §4.1.4: `afterCommit` callbacks fire AFTER the transaction commits. If a helper throws, the FSM transition is already persisted — the error is swallowed and logged. The current `packages/domain/src/job-state-machine.ts` already implements this. Your job is to NOT introduce code that calls back into the FSM helpers or wraps the `afterCommit` in a transaction. Just throw real errors when Resend or template-render fails — the domain layer's swallow-and-log is the safety net.

VALIDATION-007's `it('afterCommit failure does not roll back the transition')` test verifies this: mock Resend to reject → assert the jobs row state advanced + the audit row exists + the error appears in logs. This test extends `packages/api/__tests__/integration/jobs.test.ts`.

**Trap 6 — Webhook HMAC verification: implement the REAL check.**
DESIGN-005 §4.7's `verifyResendSignature()` is literally `return true; // sketch`. Implement the real HMAC verification per Resend's webhook signing spec — Svix-based. Their docs prescribe:
1. Compute `HMAC-SHA256(signing_secret, signed_payload)` where `signed_payload = "<msg_id>.<timestamp>.<body>"`.
2. Compare against the `svix-signature` header (which is base64-encoded, possibly with a `v1,` prefix and multiple signatures separated by space — take any match).
3. Reject if timestamp is older than 5 minutes (replay protection).
The signing secret comes from `process.env.RESEND_WEBHOOK_SECRET`. If `process.env.RESEND_WEBHOOK_SECRET` is missing in dev/test, the route should return 401 (NOT silently accept — that would be a critical security regression).

VALIDATION-007 §4 has `it('returns 200 on valid signed payload')` + `it('returns 401 on missing or invalid signature')` — both must pass. Use a deterministic test fixture: a known body + known secret + computed expected signature.

**Trap 7 — Template content per PRD ACs.**
Each template snapshot test (in `packages/notifications/templates/__tests__/*.test.tsx`) must verify the rendered HTML contains the fields the PRD AC pins:
- **TreasurerBreakdown** (PRD-005 R-07 / AC-08): job description, total amount, line-items per Active with displayName + amount, job ID, timestamp.
- **AdminDispute** (PRD-006 R-07 / AC-07): job description, dispute reason, disputer display name + role, job ID, drill-in link to `/admin/jobs/<jobId>`.
- **ModeratorNewPosting** (PRD-002 R-12): job description, dues amount, recommended count, poster display name, link to `/moderation-queue`.
- **AlumniRejection** (optional MVP): job description, rejection reason — sent to the posting Alumni's own email, NOT a chapter setting.

Use snapshot tests (`toMatchSnapshot()`) for stability — but ALSO assert key fields appear via substring check (`expect(html).toContain(jobDescription)`) so the snapshot's intent is readable when it inevitably needs to be updated.

**Trap 8 — Idempotency keys per helper.**
DESIGN-005 §4.2 / §4.3 / §4.4 are explicit:
- `sendTreasurerEmail` → `idempotencyKey: 'job:${jobId}:payment_sent'`
- `sendModeratorQueueEmail` → `idempotencyKey: 'job:${jobId}:moderation_queue'`
- `sendAdminDisputeEmail` → **NO idempotency key** — re-disputes (after Admin resolves to `payment_sent`) are legitimately separate events.
- `sendAlumniRejectionEmail` → `idempotencyKey: 'job:${jobId}:rejected'`

The adapter passes the key via `headers: { 'Idempotency-Key': '<key>' }`. The unit test `it('passes Idempotency-Key when provided')` in `send-email.test.ts` verifies the wiring.

**Trap 9 — `getSetting()` typing.**
The DB column is `jsonb` per ADR-010, but MVP values are all strings. Type `getSetting<T>` as generic with the caller specifying the type:
```ts
const recipient = await getSetting<string>('treasurer_recipient_email');  // throws if both DB + env absent
```
The env-var fallback name convention is `BOOTSTRAP_<KEY_UPPER>` — e.g., `BOOTSTRAP_TREASURER_RECIPIENT_EMAIL`. Per ADR-010 Confirmation: unit test must verify both paths + the both-absent throw.

**Trap 10 — `chapter_display_name` is used in every email subject.**
Per DESIGN-005 §4.2 / §4.3 / §4.4: every helper fetches `chapter_display_name` via `getSetting()` and prefixes the subject (e.g., `"${chapterName} — payment-sent for "..."`). The bootstrap migration (0004) should have seeded this; verify by reading the migration. If missing, escalate.

**Trap 11 — Cross-plan invariant.**
After your work: `pnpm --filter @app/domain test no-direct-state-writes` MUST still exit 0. The notifications helpers read from `jobs`, `users`, `chapter_settings` (which are explicitly out of the IGNORE_DIRS-tracked tables) — that's fine. Do NOT add new tables or write to existing tracked tables.

## Definition of done

Every box in VALIDATION-007 §6 green:

- [ ] `pnpm --filter @app/settings typecheck && test` exit code 0.
- [ ] `pnpm --filter @app/notifications typecheck && test` exit code 0 — every test in VALIDATION-007 §4 passes:
  - `packages/settings/__tests__/get-setting.test.ts` — DB-value + env-fallback + both-absent-throws.
  - `packages/notifications/__tests__/send-email.test.ts` — skip mode + HTML+text rendering + idempotency-key passthrough + throw-on-Resend-error.
  - `packages/notifications/__tests__/treasurer-breakdown.test.ts` — recipient composition + payload + idempotency key + missing-credit throw.
  - `packages/notifications/__tests__/admin-dispute.test.ts` — recipient + payload + NO idempotency key.
  - `packages/notifications/__tests__/moderator-new-posting.test.ts` — recipient + payload + idempotency key.
  - `packages/notifications/__tests__/alumni-rejection.test.ts` — recipient (Alumni's own email) + payload.
  - `packages/notifications/templates/__tests__/*.test.tsx` — snapshot + substring assertions per Trap 7.
- [ ] Extended `packages/api/__tests__/integration/jobs.test.ts` passes — the 4 new assertions:
  - `post → sendModeratorQueueEmail` fires once with the right input + mocked Resend records the call.
  - `markPaymentSent → sendTreasurerEmail` fires once.
  - `dispute → sendAdminDisputeEmail` fires once.
  - `afterCommit failure does not roll back the transition` — mocked Resend rejects; state still advanced + audit row present + error logged.
- [ ] `apps/web/__tests__/api/webhooks-resend.test.ts` passes — valid signature → 200; invalid/missing → 401; bounce events logged; delivered/opened/clicked ignored.
- [ ] (Optional, per VALIDATION-007 §5) `apps/web/e2e/notifications/webhook-receiver.spec.ts` passes if implemented.
- [ ] `pnpm --filter web build` succeeds — confirms the new webhook route compiles under Next.js 16.
- [ ] **Cross-plan invariant:** `pnpm --filter @app/domain test no-direct-state-writes` exit code 0; IGNORE_DIRS unchanged.
- [ ] Repo-wide `pnpm -r typecheck` exit code 0.
- [ ] One commit matching PLAN-007 §3's commit message; touched files limited to `packages/settings/*`, `packages/notifications/*`, `packages/api/src/routers/jobs.ts`, `packages/api/__tests__/integration/jobs.test.ts`, `apps/web/app/api/webhooks/resend/*`, `apps/web/__tests__/api/webhooks-resend.test.ts`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (if allowlist edits needed). No `docs/` changes.

Report back (under 200 words): commit hash, anything escalated, any open Q-PLN-NN with your lean, explicit confirmation that (1) PLAN-003's static-analysis test still passes, (2) PLAN-005's existing integration tests still pass after the call-site swap, (3) PLAN-006's walking-skeleton Playwright specs still pass (they don't exercise notifications directly but the api package changes could ripple).

## If you get stuck

If a step's verification fails AND it's not obviously a copy-paste fix, **escalate to the user** with: (1) which step, (2) the exact error, (3) what you tried, (4) your lean. Do not invent product or architectural decisions. Do not modify any design or upstream plan.

Particular escalation candidates to watch for (anything in this list, stop and ask):
- A chapter_settings key required by DESIGN-005 (`admin_recipient_email`, `treasurer_recipient_email`, `moderators_recipient_email`, `chapter_timezone`, `chapter_display_name`) isn't seeded by `0004_bootstrap_chapter_settings.sql` — this is a PLAN-002 gap; escalate, don't add a new migration.
- Resend SDK's TypeScript types don't match DESIGN-005 §4.1's sketch (e.g., the SDK changed `Resend()` constructor signature or `.emails.send()` return shape) — adjust the adapter to the real SDK shape, but flag the divergence in your report.
- Resend's webhook signing scheme isn't the Svix scheme described in Trap 6 (their docs may have changed) — implement per their current docs, flag the divergence.
- React Email's `render()` API has a different name or shape than the DESIGN-005 sketch (e.g., `render` vs `renderToString`) — use the real one and flag.
- `pnpm-workspace.yaml`'s `onlyBuiltDependencies` allowlist fights with the new deps (postinstall script blocked) — try `pnpm install --reporter=ndjson` for diagnostics; if blocked, add the dep to the allowlist (real native deps are listed in CLAUDE.md's packaging notes).

Begin.
