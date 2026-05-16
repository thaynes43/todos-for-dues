# Prompt for Claude Code agent — Execute PLAN-006 (walking-skeleton UI)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). **Current state:** PLAN-001 (scaffolding), PLAN-002 (DB schema + lazy `db` Proxy + Better Auth tables), PLAN-003 (FSM helpers), PLAN-004 (Better Auth + Workspace OIDC + invite tokens + 3 Server Actions for signup/login/forgot-password — already wired in `apps/web/app/{signup,login,forgot-password}/`), and PLAN-005 (all 5 tRPC routers — `jobs`, `users`, `settings`, `admin`, `invites`, fully wired into `apps/web/app/api/trpc/[trpc]/route.ts`) are committed. PLAN-006 lands the walking-skeleton subset of DESIGN-006 §4.2 — the ~5 routes + ~12 components needed to click through the full happy-path job loop (signup → post → approve → enroll → lock → complete → mark payment-sent → confirm received → `closed`).

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/006-walking-skeleton-ui-implementation.md` end-to-end, then verify against `docs/plans/006-walking-skeleton-ui-validation.md` §6 pass/fail gates. You produce: a real root `app/layout.tsx` with `ChapterHeader` + `RoleAwareNav` + `Footer`; the tRPC React provider + React Query setup in `apps/web/lib/trpc-client.ts`; the `lib/formatters.ts` helpers (`stateDisplayName` + `formatChapterLocal`); the walking-skeleton component set listed in PLAN-006 §3; the 5 new pages (`app/page.tsx` role-redirect, `app/jobs/page.tsx`, `app/jobs/new/page.tsx`, `app/jobs/[jobId]/page.tsx`, `app/moderation-queue/page.tsx`); and the Vitest component tests in `apps/web/__tests__/` per VALIDATION-006 §4 plus the per-page Playwright specs under `apps/web/e2e/walking-skeleton/` per VALIDATION-006 §5.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Honour every feedback memory (ask-don't-invent, brief responses, doc conventions, **test-DB rule: PG16 via testcontainers, no SQLite or MySQL substitution**, skip-confirm-when-strong).
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root project context. The **"Domain invariant — FSM-only state writes"** section is still load-bearing: UI never bypasses tRPC; tRPC routes through `@app/domain`. PLAN-003's `no-direct-state-writes.test.ts` MUST stay green.
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one paragraph) — load-bearing reminder: **"This is NOT the Next.js you know."** Before writing any App Router / Server Component / Server Action code, read the relevant guide in `node_modules/next/dist/docs/`. Do NOT rely on training-data Next.js conventions — Next.js 16 has breaking changes (e.g., `params` and `searchParams` are `Promise<...>`, see the existing `app/login/page.tsx` for the pattern).
4. `docs/plans/006-walking-skeleton-ui-implementation.md` — the plan. §3 Outputs, §4 Steps 1–7, §5 verification, §8 resume points.
5. `docs/plans/006-walking-skeleton-ui-validation.md` — the validation gates and per-component / per-page test inventory.
6. `docs/designs/006-ui-components.md` — full design. §3 file/folder layout, §4.1 routing + access control, §4.2 walking-skeleton subset table, §4.3 component sketches (`JobDetailView`, `PostJobForm`, `MinAdminErrorBanner`, `AggregateCountsCards` — note: `MinAdminErrorBanner`/`AggregateCountsCards` are PLAN-011/012 scope, NOT yours), §4.4 form pattern, §4.5 loading/error/empty, §4.6 `stateDisplayName` (load-bearing — read carefully), §4.7 chapter-local date format, §4.8 `TippingNudge`.
7. PRD §6 UX rules for the slice you're realising: PRD-002 §6, PRD-004 §6, PRD-005 §6, PRD-006 §6 (just the "Confirm received is single click" rule).
8. `docs/designs/003-trpc-api-surface.md` §4.4 (jobs router signatures), §4.4.1 (`computeDuesSplit` — you don't reimplement it but `CompleteJobForm` shows its preview), §7 (tRPC error code mapping — your client-side error handling consumes these).

## What's already in the repo you can rely on

**Existing (do NOT recreate):**
- `apps/web/app/api/auth/[...all]/route.ts` — Better Auth catch-all (PLAN-004).
- `apps/web/app/api/trpc/[trpc]/route.ts` — tRPC fetch adapter wiring `appRouter` from `@app/api` (PLAN-005). Bare `fetchRequestHandler`; **no SuperJSON transformer** — your tRPC client must mirror this (no `transformer:` option, plain JSON).
- `apps/web/app/{signup,login,forgot-password}/page.tsx` + `*-form.tsx` + `actions.ts` — Server-Action-backed auth flows (PLAN-004). The login page already shows the "Sign in with Google" button (conditional on `oidcEnabled` from `@app/auth`); the button is a POST `<form>` per the 7daab1c fix — **do not rewrite it.**
- `apps/web/app/layout.tsx` — minimal root layout. You REPLACE this with the full layout (header + nav + tRPC provider + footer).
- `apps/web/app/page.tsx` — minimal landing. You replace this with the role-aware redirect.
- `apps/web/components/ui/button.tsx` — shadcn primitive already there. Add more shadcn primitives (`Input`, `Textarea`, `Card`, `Skeleton`, `Badge`, etc.) as you need them via `pnpm dlx shadcn@latest add <name>` — the install command for Next.js 16 + Tailwind v4 may differ from training data; check `node_modules/shadcn/` or `apps/web/components/ui/button.tsx` for the existing pattern before adding more.
- `apps/web/lib/utils.ts` — shadcn `cn()` helper.
- Tailwind v4 — **no `tailwind.config.*`**, only the PostCSS plugin. Theme tokens are CSS custom properties in `apps/web/app/globals.css`.

**Imports you can rely on:**
- `import { auth, getServerSession, oidcEnabled, type Session } from '@app/auth';` — Better Auth instance + session helper + SSO availability flag.
- `import { db } from '@app/db';` — Drizzle Proxy (lazy `Pool`). **You should not need direct DB access from the web app** — every read + write goes through tRPC. If you reach for `db` from a Server Component, stop and use the tRPC server-side caller instead (`appRouter.createCaller(ctx)` pattern, see `packages/api/__tests__/e2e/walking-skeleton.test.ts` for usage).
- `import { type AppRouter } from '@app/api';` — typed router definition for the tRPC client.
- The tRPC procedures you'll consume from the UI: `jobs.list` (role-aware listing), `jobs.listModerationQueue` (Mod-only), `jobs.getById`, `jobs.post`, `jobs.approve`, `jobs.enroll`, `jobs.lock`, `jobs.complete`, `jobs.markPaymentSent`, `jobs.confirmReceipt`. See `packages/api/src/routers/jobs.ts` for input/output shapes — your client mutations / queries should mirror them exactly via inferred types.

## What you do NOT do

- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans, DDD). If a design ambiguity blocks a step, **escalate to the user** — do not improvise.
- Do not modify `packages/api/`, `packages/domain/`, `packages/db/`, `packages/auth/`. PLAN-005 finished those — if you discover a missing procedure or wrong shape, escalate. (Plausible escalation: PRD-002 R-11 "my-postings list" needs `jobs.listMyPosted`; verify it exists in `packages/api/src/routers/jobs.ts` before reaching for it — if it doesn't, escalate, don't add it.)
- **Do not write any direct DB query from `apps/web/`.** Every read + write goes through tRPC. PLAN-003's `no-direct-state-writes.test.ts` is allowed to evolve its IGNORE_DIRS list but **must not** add `apps/web/` paths.
- Do not skip ahead into PLAN-010+ scope. **OUT of walking-skeleton:** Reject (only Approve in walking-skeleton — see DESIGN-006 §4.2 footnote), Unenroll, Cancel, Reschedule, RevertCompletion, Dispute, ResolveDispute, Admin view (`/admin/*`), Role-management UI, Settings UI, MinAdminErrorBanner, AggregateCountsCards. If any of these surface in your components, you've over-reached.
- Do not rewrite the existing PLAN-004 Server-Action-backed auth pages (`signup`, `login`, `forgot-password`). You add a Reset Password form per Better Auth's reset flow only if PLAN-004 didn't (check `app/reset-password/` first — likely not present; if missing and the walking-skeleton needs it, escalate rather than guess at Better Auth's flow).
- Do not substitute the test DB engine. PG16 via testcontainers per ADR-004. Playwright must run against `pnpm dev` backed by the SAME testcontainers Postgres the integration tests use — the existing `apps/web/playwright.config.ts` and `__e2e__/support/db.ts` show the pattern from PLAN-004; follow it.
- Do not commit until PLAN-006 §5 + VALIDATION-006 §6 gates are all green.
- Do not push to remote — the user pushes. (Branch protection lands in PLAN-009; you're still pushing to `main` directly for now.)

## Specific traps to watch for

**Trap 1 — Next.js 16 breaking changes vs. training data.**
Read `apps/web/AGENTS.md` first and the App Router docs under `node_modules/next/dist/docs/` second. Confirmed gotchas already in this repo:
- `params` and `searchParams` props are `Promise<{ ... }>` — must `await` them. See `apps/web/app/login/page.tsx:8-9` for the pattern.
- `headers()` and `cookies()` return promises — must `await`. Existing usage: `auth.api.getSession({ headers: await headers() })`.
- Server components are the default; opt into client with `'use client'`. Mutations + React Query hooks require client components; the page route itself stays server.

**Trap 2 — tRPC React client must mirror server's no-transformer config.**
`apps/web/app/api/trpc/[trpc]/route.ts` uses bare `fetchRequestHandler` with no `transformer`. The api's `initTRPC.context<TRPCContext>().create({ errorFormatter })` also has no transformer. Your `lib/trpc-client.ts` must therefore **not** set `transformer: superjson`. If you do, every mutation will fail with a `Cannot find module 'superjson'`-shaped runtime error and the walking-skeleton Playwright will burn. (You may add SuperJSON later as a separate plan if Date/BigInt serialization becomes a real issue; not in scope here.)

**Trap 3 — `stateDisplayName` is a literal map, NOT a regex.**
DESIGN-006 §4.6 spells out *why*: PRD-001 R-07 mixes spaces and hyphens (`"awaiting moderation"` with a space; `"enrollment-open"`, `"payment-sent"` with hyphens). A `.replace('_', '-')` or `.replace('_', ' ')` will be wrong for at least one state. Copy the explicit `JOB_STATE_DISPLAY` map from DESIGN-006 §4.6 verbatim into `apps/web/lib/formatters.ts` and unit-test every state per VALIDATION-006 §4 `lib/formatters.test.ts`.

**Trap 4 — `formatChapterLocal` reads timezone from `chapter_settings`, but the settings UI doesn't exist yet.**
Per PLAN-006 §3: hardcode `America/New_York` as the timezone for the walking skeleton. Wire the helper signature to take a timezone string (`formatChapterLocal(utcIso: string, timezone: string)`), then have callers in walking-skeleton pages pass the hardcoded value. PLAN-010 / PLAN-011 / PLAN-012 (when they ship) will replace the hardcoded value with a tRPC `settings.list` lookup. Do NOT call `settings.list` from the walking skeleton — the settings UI lives later and the dependency adds noise.

**Trap 5 — `JobDetailView` walking-skeleton subset is MUCH smaller than DESIGN-006 §4.3's full sketch.**
DESIGN-006 §4.3 shows the full MVP `JobDetailView` with Reject/Cancel/Reschedule/Dispute/ResolveDispute/RevertCompletion buttons. For the walking skeleton you render ONLY:
- EnrollButton (Active, state == `enrollment_open`, not enrolled)
- LockJobForm (Alumni-poster, state == `enrollment_open`, has ≥1 enrollee)
- CompleteJobForm (Alumni-poster, state == `locked`)
- MarkPaymentSentButton (Alumni-poster, state == `completed`)
- ConfirmReceivedButton (enrolled Active OR Admin, state == `payment_sent`)
- TippingNudge (state ∈ {`payment_sent`, `closed`})
- Read-only sections for description / dues / recommended count / work date / roster (role-projected per Trap 6) / state badge.

The component file should be structured so PLAN-010 / PLAN-011 / PLAN-012 can extend it without rewriting — but **only ship the walking-skeleton subset**. Use TODO comments sparingly — and only when WHY isn't obvious. Don't write speculative `// later: add UnenrollButton` markers; the design is the source of truth.

**Trap 6 — Roster visibility is server-projected on `jobs.getById`, NOT a client-side filter.**
PRD-004 R-05 + AC-06/AC-07: enrolled Actives + Alumni-poster + Moderators + Admins see full roster (display names); non-enrolled Actives see only the count. PLAN-005 already implements this projection in `jobs.getById` — the procedure returns either `{ roster: [{ id, displayName }, ...] }` or `{ enrollmentCount: number }` based on the caller's role + enrollment. Your `JobDetailView` consumes whichever field is present; you do NOT receive the full roster and filter in the client (that would leak names).

**Trap 7 — `ApproveRejectButtons` is Approve-only in walking skeleton.**
DESIGN-006 §4.2 explicitly says "approve only — rejection flow lands later in MVP." The component file name stays `ApproveRejectButtons.tsx` (per PLAN-006 §3) but the rendered JSX has only the Approve button. PLAN-010 will add Reject + the rejection-reason modal. Don't pre-build the reject affordance even disabled.

**Trap 8 — `TippingNudge` is static text, never numeric.**
PRD-001 §6 Q-06 specifically calls this out. Render the literal copy in DESIGN-006 §4.8:
> *"Tipping is encouraged when work goes above and beyond. (Send directly to the Active via Venmo or other channel.)"*
Do NOT compute a suggested tip amount, percentage, or anything else numeric. VALIDATION-006's `TippingNudge.test.tsx` checks that no `$` or digit appears in the rendered text.

**Trap 9 — Mutation race + idempotent confirmReceipt 200.**
`jobs.confirmReceipt` returns `{ state: 'closed', alreadyClosed: true | false, closedBy: <actorId | null> }` (per PRD-006 R-04 + the PLAN-005 implementation in `packages/api/src/routers/jobs.ts`). Your `ConfirmReceivedButton` mutation `onSuccess` should treat `alreadyClosed: true` as a success path (the loop is closed; UI updates to `closed`), NOT as an error. A `409 CONFLICT` from any OTHER mutation surfaces a toast: "Someone else just acted on this job — refresh to see the latest." (DESIGN-006 §7.)

**Trap 10 — Playwright specs need testcontainers Postgres + seeded users.**
The existing PLAN-004 specs under `apps/web/__e2e__/auth/` use `__e2e__/support/db.ts` to talk to the same testcontainers PG instance the dev server uses. Mirror that pattern for `apps/web/e2e/walking-skeleton/*.spec.ts`. Use Playwright `storageState()` to switch personas across specs (per VALIDATION-006 §5 footnote) so each spec doesn't redo signup. **Do NOT introduce a separate test DB or mock the tRPC layer in Playwright** — the whole point is real-end-to-end.

**Trap 11 — Role-gated routes must redirect server-side.**
DESIGN-006 §4.1: "Never trust client-side role checks for gating — they're for UI affordance only." Implement route gating in the page's server component via `await getServerSession(await headers())` + `redirect()` from `next/navigation`. The client component's role-aware affordance hiding is secondary belt-and-suspenders; the tRPC procedure itself is the authoritative authorization layer (PLAN-005 middleware).

**Trap 12 — Cross-plan invariant.**
After your work: `pnpm --filter @app/domain test no-direct-state-writes` MUST still exit 0. If it fails because something in `apps/web/` writes directly to `jobs.state` / `users.role` / one of the audit tables, the fix is to route through the appropriate tRPC procedure — NEVER add `apps/web/` to the IGNORE_DIRS allowlist.

## Definition of done

Every box in VALIDATION-006 §6 green:

- [ ] All Vitest component tests in VALIDATION-006 §4 pass (`pnpm --filter web test` exit 0).
- [ ] All Playwright specs in VALIDATION-006 §5 pass against `pnpm dev` — run 3x, no flake.
- [ ] `pnpm --filter web build` succeeds.
- [ ] No `console.error` calls during the happy-path Playwright run (Playwright `page.on('pageerror')` listener clean).
- [ ] Repo-wide `pnpm -r typecheck` clean (you'll touch `@app/web` only; no other package types should change).
- [ ] `pnpm --filter @app/domain test no-direct-state-writes` exit 0 — allowlist unchanged.
- [ ] One commit matching PLAN-006 §3's commit message (`feat(web): walking-skeleton UI per DESIGN-006 §4.2`).
- [ ] No `docs/` files touched. No `packages/` files touched (except `pnpm-lock.yaml`).

Report back (under 200 words): commit hash, anything escalated, any open Q-PLN-NN with your lean, explicit confirmation that PLAN-003's static-analysis test still passes, and confirmation that the existing PLAN-004 auth pages still work (the e2e auth specs under `__e2e__/auth/` should still pass — run them as a regression check).

## If you get stuck

If a step's verification fails AND it's not obviously a copy-paste fix, **escalate to the user** with: (1) which step, (2) the exact error, (3) what you tried, (4) your lean. Do not invent product or architectural decisions. Do not modify any design or upstream plan.

Particular escalation candidates to watch for (anything in this list, stop and ask):
- A tRPC procedure shape doesn't match what PRD-NNN R-NN expects (e.g., `jobs.list` doesn't return the right fields for the walking-skeleton card view) — this is a PLAN-005 gap; escalate.
- Next.js 16's App Router has removed an API the design assumes (e.g., the role-redirect pattern in `app/page.tsx` doesn't compile under the new Server Component contract) — escalate; the user decides whether to amend the design or work around.
- shadcn/ui's `pnpm dlx shadcn@latest add` writes a component that doesn't compose with Tailwind v4 (missing config file etc.) — escalate; this would be a real cross-tooling gap.
- Playwright's `storageState()` pattern doesn't survive Better Auth's session cookie rotation — try a fresh login per spec first; escalate only if both refuse.

Begin.
