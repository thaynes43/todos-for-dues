# Prompt for Claude Code agent — Validate PLAN-006 (against VALIDATION-006)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright). The docs-first SDLC pairs every implementation plan (`PLAN-NNN`) with a validation plan (`VALIDATION-NNN`); your job is the validation half for PLAN-006 (walking-skeleton UI per DESIGN-006 §4.2).

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/006-walking-skeleton-ui-validation.md`'s §6 pass/fail gates against the PLAN-006 commit(s) on the current branch. PLAN-006 produced the walking-skeleton UI: a real root layout with header + nav + footer + tRPC provider; `lib/trpc-client.ts` + `lib/formatters.ts`; ~12 components (`ChapterHeader`, `RoleAwareNav`, `Footer`, `JobCard`, `JobStateBadge`, `JobDetailView` walking-skeleton subset, `EnrollButton`, `PostJobForm`, `ApproveRejectButtons` (Approve only), `LockJobForm`, `CompleteJobForm`, `MarkPaymentSentButton`, `ConfirmReceivedButton`, `TippingNudge`); 5 new pages (`/`, `/jobs`, `/jobs/new`, `/jobs/[jobId]`, `/moderation-queue`); Vitest component tests in `apps/web/__tests__/`; per-page Playwright specs in `apps/web/e2e/walking-skeleton/`. You run the gates, confirm each is green, and report. If a gate fails, you do **not** relax it — small mechanical fixes only, otherwise escalate.

The **cross-plan invariant** is non-negotiable: PLAN-003's `no-direct-state-writes.test.ts` MUST still pass with no `apps/web/` paths added to its IGNORE_DIRS allowlist. PLAN-006 is a UI consumer of tRPC — if any component or page short-circuits tRPC and writes to the DB directly, the FSM audit trail breaks silently.

Additionally: the existing PLAN-004 e2e auth specs under `apps/web/__e2e__/auth/` must STILL pass. PLAN-006 replaces the minimal root layout with a real header/nav/footer; if that broke any auth page redirect or the SSO POST button (commit 7daab1c), the auth regression suite catches it.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Test-DB rule: **PG16 via testcontainers, no SQLite or MySQL substitution.**
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root context.
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` — load-bearing reminder about Next.js 16 breaking changes. If you need to verify any App Router contract, read `node_modules/next/dist/docs/` rather than guessing from training data.
4. `docs/plans/006-walking-skeleton-ui-validation.md` — validation contract. §3 coverage matrix (PRD AC × component / spec), §4 Vitest test list, §5 Playwright spec list, §6 gate checklist.
5. `docs/plans/006-walking-skeleton-ui-implementation.md` §3 Outputs, §5 Verification — expected artifacts and commit shape.
6. `docs/designs/006-ui-components.md` §4.2 (walking-skeleton subset table), §4.3 (`JobDetailView` walking-skeleton-vs-MVP delta), §4.6 (`stateDisplayName` — explicit map, NOT regex), §4.7 (chapter-local date format), §4.8 (`TippingNudge` non-numeric).
7. `git log -10 --oneline` — confirm PLAN-006 commit(s) exist; read each commit message; the execution agent should have noted any Q-PLN-NN landed-with-a-lean items.

## What you do NOT do

- Do not modify any doc under `docs/` (plans, PRDs, ADRs, designs).
- Do not modify any `packages/*` source. PLAN-006 is a `apps/web/` plan — if `packages/*` changed in the commit, that's a scope-leak and worth flagging (but the right fix is in the next plan that owns that package, not yours).
- Do not relax a gate. Small mechanical fixes are OK in `apps/web/` (missing import, wrong file path, off-by-one in a test fixture, Tailwind class typo); anything bigger → **escalate to the user**.
- Do not add `apps/web/` paths to PLAN-003's static-analysis allowlist if it fires — the fix is in the offending UI code (route through tRPC), not in the test.
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004.
- Do not amend PLAN-006's commit(s). If an implementation fix is needed, create a new commit (`fix(web): <what>`).
- Do not push to remote — the user pushes.

## Definition of done

Every box in VALIDATION-006 §6 green, verified by running the commands:

- [ ] `pnpm --filter web typecheck` exit code 0.
- [ ] `pnpm --filter web test` exit code 0 — all Vitest component / formatter tests in VALIDATION-006 §4 pass:
  - `components/JobStateBadge.test.tsx` — every `JobState` renders `stateDisplayName(state)` (e.g., `awaiting_moderation` → `"awaiting moderation"`, `enrollment_open` → `"enrollment-open"`, `payment_sent` → `"payment-sent"`). The mix of space vs. hyphen is intentional per DESIGN-006 §4.6 / PRD-001 R-07.
  - `components/JobDetailView.test.tsx` — given (job, viewer) tuples representing each walking-skeleton state (`enrollment_open`, `locked`, `completed`, `payment_sent`, `closed`), the correct subset of action affordances renders. CRITICAL: the *non-walking-skeleton* affordances (Reject, Cancel, Reschedule, RevertCompletion, Dispute, ResolveDispute, UnenrollButton) must NOT render — VALIDATION-006 §4 lists these as the walking-skeleton scope; assert their absence.
  - `components/PostJobForm.test.tsx` — submits → calls `trpc.jobs.post.useMutation` with the right input shape; submit button disabled during pending.
  - `components/EnrollButton.test.tsx` — calls `trpc.jobs.enroll.useMutation({ jobId })`; disabled when state !== 'enrollment_open'.
  - `components/LockJobForm.test.tsx` — submits a future date; submit button disabled with past date.
  - `components/CompleteJobForm.test.tsx` — attendee checklist from roster; submit calls `trpc.jobs.complete.useMutation({ jobId, confirmedAttendees: [...ids] })`.
  - `components/MarkPaymentSentButton.test.tsx` — single click fires mutation; shows treasurer recipient per PRD-005 §6.
  - `components/ConfirmReceivedButton.test.tsx` — single click; visible only when state === 'payment_sent' AND viewer is enrolled or Admin; treats `alreadyClosed: true` response as success path (not error).
  - `components/TippingNudge.test.tsx` — rendered text contains NO `$`, NO digits 0-9 — purely static per PRD-001 Q-06.
  - `components/ModerationQueue.test.tsx` — oldest-first ordering per PRD-002 R-06 / AC-06.
  - `lib/formatters.test.ts` — `stateDisplayName` returns the exact mapping in DESIGN-006 §4.6 for every `JobState`; `formatChapterLocal` formats UTC ISO into chapter-local string with the configured timezone.
- [ ] `apps/web/e2e/walking-skeleton/*.spec.ts` passes — VALIDATION-006 §5 list:
  - `smoke-routes.spec.ts` — each route in DESIGN-006 §4.2 walking-skeleton table returns 200 or the expected auth redirect.
  - `post-job.spec.ts` — Alumni signin → `/jobs/new` → fill + submit → redirect to `/jobs/<newId>` → state badge shows `awaiting moderation`.
  - `post-approve-enroll.spec.ts` — chained post + Mod approve + Active enroll; each step's UI reflects the new state.
  - `lock-job.spec.ts` — Alumni-poster on `enrollment_open` with ≥1 enrollee, lock with a future date → state badge `locked`.
  - `complete-job.spec.ts` — Alumni-poster on `locked`, check enrolled attendee, submit → state `completed` + per-Active credit visible.
  - `payment-sent.spec.ts` — Alumni-poster on `completed`, click MarkPaymentSent → state `payment-sent`.
  - `confirm-received.spec.ts` — enrolled Active on `payment_sent`, click ConfirmReceived → state `closed`. Assert the `<ClosedJobBanner>` is NOT rendered (it's PLAN-010 scope; walking-skeleton shows only the state badge).
  Run each spec **3x** — VALIDATION-006 §6 calls for 3x no-flake (the 5x gate lives on VALIDATION-008's canonical chained spec).
- [ ] No `console.error` calls during the happy-path Playwright run — confirm via Playwright's `page.on('pageerror')` listener; check spec assertions include it or run a full happy-path with the listener active and inspect output.
- [ ] `pnpm --filter web build` succeeds — confirms the new layout + tRPC provider compile under Next.js 16's production build.
- [ ] **Cross-plan invariant:** `pnpm --filter @app/domain test no-direct-state-writes` exit code 0. Open the test file's IGNORE_DIRS; confirm no `apps/web/` paths were added.
- [ ] **Auth regression:** `pnpm --filter web e2e -- __e2e__/auth/` exits 0. The PLAN-004 auth specs (SSO POST button, HD restriction, invite signup, bootstrap admin, etc.) must still pass with the new root layout in place.
- [ ] Repo-wide `pnpm -r typecheck` exit code 0.
- [ ] PLAN-006's commit(s) on the branch with the expected `feat(web): walking-skeleton UI per DESIGN-006 §4.2` message; only `apps/web/*` + `pnpm-lock.yaml` modified; no `docs/` files touched; no `packages/*` source touched.

Report back (under 200 words): which gates passed, any implementation fixes you made (with new commit hash), anything escalated, **and explicit confirmation that PLAN-003's static-analysis test still passes AND the PLAN-004 auth e2e specs still pass**.

## Specific things to look hard at

1. **`stateDisplayName` is a literal map, NOT a regex.** Open `apps/web/lib/formatters.ts`. There must be an explicit `Record<JobState, string>` map. PRD-001 R-07 mixes space and hyphen separators (`"awaiting moderation"` with a space; `"enrollment-open"` and `"payment-sent"` with hyphens). A `.replace('_', '-')` shortcut will get at least one state wrong. The unit test file should iterate every `JobState` and assert the exact display string.

2. **`JobDetailView` walking-skeleton subset.** Open `apps/web/components/JobDetailView.tsx`. The rendered affordance list MUST be: EnrollButton, LockJobForm, CompleteJobForm, MarkPaymentSentButton, ConfirmReceivedButton, TippingNudge. The following must NOT appear anywhere in the JSX: RejectButton, UnenrollButton, CancelJobModal, RescheduleButton, RevertCompletionButton, DisputeJobModal, ResolveDisputeModal, MinAdminErrorBanner. Grep the file for those component names — zero hits expected. If any appear (even disabled / hidden), the agent over-reached into PLAN-010+ scope.

3. **Roster visibility is server-projected.** Open `apps/web/components/JobDetailView.tsx`. The roster section should consume EITHER `job.roster: { id, displayName }[]` OR `job.enrollmentCount: number`, depending on which the tRPC `jobs.getById` response carries. There should be no client-side filter that gates display names by `viewer.role` — `packages/api/src/routers/jobs.ts`'s `jobs.getById` projection is the authoritative gate. If you see a `viewer.role !== 'Active' || isEnrolled || ...` filter applied to a `roster: ...[]` field on the client, the procedure is leaking names and the client is masking — flag this; it's a PLAN-005 implementation bug that PLAN-006 inherited.

4. **No SuperJSON transformer.** Open `apps/web/lib/trpc-client.ts`. There should be no `transformer:` key in the `createTRPCNext` / `createTRPCReact` config — the server (in `packages/api/src/trpc.ts`) doesn't set one either, so they must match. If the client sets `transformer: superjson` but the server doesn't, every mutation will fail at runtime. (Inverse is also a fail.)

5. **`TippingNudge` is non-numeric.** Open `apps/web/components/TippingNudge.tsx`. Render output should match DESIGN-006 §4.8's exact copy — no `$`, no digit 0-9, no percent sign. The unit test asserts this directly.

6. **`ApproveRejectButtons` is Approve-only in walking skeleton.** Open `apps/web/components/ApproveRejectButtons.tsx`. Only the Approve `<Button>` should be rendered (no disabled Reject button, no commented-out Reject JSX). PLAN-010 adds Reject; you're not validating PLAN-010 here.

7. **Role-gating is server-side first.** Spot-check `apps/web/app/moderation-queue/page.tsx`: there should be a server-side session fetch + `redirect('/')` (or render-403) if `session.user.role` isn't `Moderator` or `Admin`. The page should NOT lean exclusively on the client-side `RoleAwareNav` hiding the link — a directly-navigated `/moderation-queue` as an Active must redirect, not render an empty page or call tRPC and 403.

8. **`ConfirmReceivedButton` handles `alreadyClosed`.** Open `apps/web/components/ConfirmReceivedButton.tsx`. The `onSuccess` callback for `trpc.jobs.confirmReceipt.useMutation` should treat both `{ alreadyClosed: false }` and `{ alreadyClosed: true }` as the success path (loop is closed; UI shows `closed`). If the button shows an error toast on `alreadyClosed: true`, the race semantics in PRD-006 R-04 are misimplemented in the UI.

9. **Playwright specs use testcontainers Postgres, NOT a separate DB.** Open `apps/web/e2e/walking-skeleton/*.spec.ts` + the helpers they import. They should reuse `__e2e__/support/db.ts` from PLAN-004 (or a similar helper that points at the same testcontainers PG). If a spec spins up its own DB or mocks the tRPC client, that violates the test-DB rule + isn't a real e2e.

10. **Auth e2e regression.** Run `pnpm --filter web e2e -- __e2e__/auth/` explicitly. PLAN-004 landed 9 specs (`sso-happy-path`, `sso-no-name-claim`, `hd-restriction`, `invite-signup-happy-path`, `no-token-signup`, `signup-no-display-name`, `no-oidc-config`, `bootstrap-admin`, `account-linking`). 6 are expected to be `test.fixme(true, '...')` blocked on PLAN-008 (SSO ones + a couple others — check git log on the auth spec commits to confirm). The remaining specs should pass. If any regress because of the new root layout (e.g., a header navigation broke a link, or a redirect chain changed), the fix lives in the new layout, not in the auth specs.

## If a gate fails

1. **Mechanical fix (allowed):** missing import, wrong file path, Tailwind class typo, Vitest snapshot mismatch from a copy-paste — fix the implementation in `apps/web/*`, re-run the gate, create a `fix(web): …` commit.
2. **Cross-plan invariant regression (FIX, do not allowlist):** if PLAN-003's test fails because a `apps/web/` file writes to `jobs.state` / `users.role` / one of the audit tables directly, the fix is to route through the appropriate tRPC procedure. Do NOT add `apps/web/` to the IGNORE_DIRS allowlist.
3. **Auth e2e regression (FIX, do not skip):** if the new root layout broke a PLAN-004 auth spec, the fix is in the layout (e.g., ensure the SSO POST `<form>` still renders with the right action attribute; ensure the redirect-after-signin flow doesn't get intercepted by the new `app/page.tsx` role-redirect logic). Do NOT mark the auth spec as `test.fixme`.
4. **Test reveals an upstream design problem (escalate):** do not edit the design — surface to the user. Likely candidates: a PRD AC that can't be expressed in the walking-skeleton subset (e.g., the UI needs a tRPC field that doesn't exist); a Next.js 16 contract that breaks the design's redirect pattern.

## If you get stuck

Escalate with: gate name, exact error output, what you tried, your lean. Do not invent.

Begin.
