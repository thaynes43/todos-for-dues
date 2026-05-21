# Prompt for Claude Code agent — Execute UI polish bundle (MVP-FIX-B: items #3 + #6 + #7)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent — load `.agents/profiles/developer.md` first.** Read this prompt, then begin.

> **Sequencing:** This prompt assumes prompt **036** (stale-UI fix) has been merged into `main`. If `main` does not yet show that `EnrollButton.tsx` / `UnenrollButton.tsx` / `ApproveRejectButtons.tsx` call `router.refresh()` in their `onSuccess` handlers — STOP and tell the user prompt 036 needs to merge first. Don't attempt this work against a `main` that's missing the prerequisite.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). v0.7.x deployed to production; user's click-through surfaced a batch of small UI bugs. This PR bundles three of them — they're independent surfaces but each is small enough that batching is sensible.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task — three small fixes in one `fix(web):` PR

Each fix lands its own Playwright assertion (could be one spec with three scenarios, or three small specs — your call). All three fixes ship in one PR.

### Fix #3 — Moderation page header + nav active-state highlighting

User's report: "When I made a job I was immediately presented the moderation [queue] to approve it but nothing told me what page of the app I was on. There should be a header on the moderation page and the nav bar should show what page you are on in bold no matter what page you are on."

Two sub-fixes:
1. **Page header on `/moderation-queue`.** The page lacks an `<h1>` (or whatever heading convention the app uses). Add one: `Moderation queue` (sentence-case to match the project's existing conventions — check `/jobs`, `/my-postings`, `/admin` headings for the prevailing style). Same treatment may be missing on other pages — audit and fix consistently.
2. **Nav active-state highlight.** The main nav (`apps/web/components/AppShellNav.tsx`, `MainNav.tsx`, or whatever the project uses — grep for the nav component) renders the same style for the current page as for other pages. Use Next.js's `usePathname()` hook to detect the current route and apply a distinct style (typically `font-weight: bold` or a background highlight per the shadcn/ui convention). Conservative styling — don't over-design; mirror existing nav-link patterns.

### Fix #6 — `Confirmed Received` / `Dispute` buttons visible to Alumni after `payment_sent`

User's report: "The Confirmed Received / Dispute buttons show up for the Alumni after saying the payment was sent and the Active. This should only show up for the Active."

Audit `apps/web/components/JobDetailView.tsx` (and the two button components, `ConfirmReceivedButton.tsx` + `DisputeJobModal.tsx`). When the job state is `payment_sent`:
- The Alumni (job poster, role = Alumni or Admin acting as poster) should NOT see Confirm Received / Dispute trigger buttons. (They posted the job; they're waiting for the Active to confirm or dispute.)
- The Active (enrolled user) SHOULD see them. (They're the recipient of the dues; they confirm whether payment was actually received.)

The current rendering is likely a state-only check (`if (state === 'payment_sent')`); needs to also gate on user role / relationship to the job. Check whether the existing role-projection helpers (`packages/api/src/role-projection/` or similar — grep `roleProjection` / `viewerRelationship`) already expose what you need.

### Fix #7 — Lock-with-current-time silent fail

User's report: "I cannot lock a job in for the current time which is OK except it fails silently and does not show an error that the time is not in the future."

Audit `apps/web/components/LockJobForm.tsx`. The form likely calls `trpc.jobs.lock.useMutation()` and the tRPC procedure rejects past/current dates with a Zod or domain error. The error IS being thrown server-side; the UI is just not displaying it. Look for an `error.message` slot in the form (probably a `<p role="alert">` similar to `EnrollButton.tsx:32-36`) — populate it from `lockMutation.error?.message`.

Verify by submitting `new Date()` (current time) — the inline error should read whatever the Zod/domain message says (e.g., "Lock date must be in the future").

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — §1–§7 loop.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md`.
4. `apps/web/AGENTS.md` (Next.js 16 reminder).
5. **For Fix #3:**
   - `apps/web/app/moderation-queue/page.tsx` (the page that needs a header).
   - The main nav component — grep:
     ```sh
     grep -rln "AppShellNav\|MainNav\|<nav" apps/web/components/ apps/web/app/
     ```
     Read the file end-to-end before changing it.
   - One or two other pages with headers (`/jobs`, `/admin`) for style precedent.
6. **For Fix #6:**
   - `apps/web/components/JobDetailView.tsx` — the host. Read the conditional rendering block for `payment_sent` state.
   - `apps/web/components/ConfirmReceivedButton.tsx`, `DisputeJobModal.tsx` — the buttons themselves.
   - Role-projection / viewer-relationship helpers: `grep -rn "viewerRelationship\|isPoster\|isEnrolled" packages/api/src apps/web/components | head -20`.
7. **For Fix #7:**
   - `apps/web/components/LockJobForm.tsx` — the form.
   - `packages/api/src/routers/jobs.ts` — the `lock` procedure (find via `grep "lock:" packages/api/src/routers/jobs.ts`) — to see the exact validation error message that propagates.
   - `apps/web/components/EnrollButton.tsx:32-36` — the canonical error-display pattern; mirror it.
8. **Existing e2e patterns** (for your new test assertions):
   - `apps/web/e2e/mvp/lock.spec.ts` (or `lock-cancel.spec.ts`, whichever — grep `lock` in `apps/web/e2e/mvp/`) — for the lock-form flow.
   - `apps/web/e2e/walking-skeleton/post-job.spec.ts` (or similar) — for full happy-path enroll + complete + payment-sent flow if you need to drive a job to `payment_sent` state.

## What you do NOT do

- **Do not push directly to `main`** — branch protection rejects it.
- **Do not modify anything under `docs/`** (PRDs, ADRs, designs, plans, DDD). The coordinator updates docs after merge.
- **Do not modify `packages/db/`, `packages/domain/`, or `packages/db/migrations/`.** No schema or domain changes here.
- **Do not modify any tRPC procedure** (`packages/api/src/routers/`). The validations + role projections are correct server-side; only the UI surfaces are wrong.
- **Do not over-restyle the nav.** Minimal change — add active-state class to the matching link. Don't introduce new components or change overall layout.
- **Do not fold in any other bug from the user's list (#1, #2, #5).** Those are feature work; separate PRDs/plans.
- **Do not relax iteration-2 hardening** (`prewarmRoutes`, `expect.timeout: 15_000`, `networkidle`/`load` waits, `demoteAllOtherAdmins` signature, `invites.spec.ts` UUID assertion).
- **Do not bypass branch protection** (`gh pr merge --admin`, `--no-verify`).

## Specific traps to watch for

**Trap 1 — Audit the nav before assuming it's one component.**

The nav might be split across `app/layout.tsx` (top bar) + a separate page-context sub-nav. Or it might be one component used everywhere. Grep before assuming; mis-targeting the active-state could leave one nav unhighlighted while the other is correct.

**Trap 2 — `usePathname()` returns the exact route, but link `href`s may be patterns.**

E.g., `/jobs/abc-123` vs. `<Link href="/jobs">`. Active-state match: use `pathname === href` for exact match OR `pathname.startsWith(href + '/')` for nested-route highlight (e.g., `/jobs/abc-123` should still highlight the `Jobs` nav link). Pick consistently across all nav items.

**Trap 3 — Page header style consistency.**

Don't invent a new heading style. Find one existing page header (probably on `/jobs` or `/admin`) and replicate the same Tailwind classes + size. If the existing pages don't use a uniform style, pick the one closest to a shadcn `<h1 className="text-2xl font-semibold">` and apply that on the moderation-queue page.

**Trap 4 — Fix #6 role check should use the existing relationship helper, not a new one.**

The view layer should NEVER directly query who posted the job; that data is already projected through the tRPC `getById` response. Look for a field like `viewerRelationship`, `isPoster`, `canConfirmReceived`, or `currentUserIsEnrolled` on the `jobs.getById` output schema. If it doesn't exist, EITHER (a) add it on the server side (tiny addition to the procedure, NOT in `packages/api/src/routers/` per the "no tRPC procedure changes" rule — flag and escalate) OR (b) compute it client-side from existing fields (e.g., `job.posterId === viewer.id`). Lean is (b) for this PR's scope.

**Trap 5 — Fix #7 error display must come from `mutation.error`, not from form state.**

The validation runs server-side (Zod on the tRPC procedure). The client mutation's `error.message` carries the message back via tRPC's error formatter. Don't add client-side date validation that pre-empts the server — that creates two sources of truth. Just surface what comes back from `error.message` in the same pattern as `EnrollButton.tsx:32-36`.

**Trap 6 — Test wait shape for #7 specifically.**

To trigger the error, the spec needs to submit a lock with a current (or near-current) date. JavaScript `new Date().toISOString()` is good enough for the form input. Don't use a clock-mocked time — the validation is server-side and reads server time.

**Trap 7 — Cross-suite test safety (still in force).**

Per PR #35's pattern:
- UUID-suffix all seeded entities via `newSuffix()`.
- Filter assertions by data-attribute (the job ID for #6, the form's specific lock-error slot for #7), not by counts.
- New tests must pass 3× consecutively under DEFAULT workers as part of the full-suite run.

**Trap 8 — Audit, don't blanket-add headers.**

For Fix #3 (page headers), check which pages currently DON'T have a header before adding to "all pages." User-reported the moderation-queue gap; other pages may already have headers. Inventory before editing.

**Trap 9 — Cross-plan invariants.**

After your work:
- `pnpm -r typecheck` exits 0.
- `pnpm -r test` exits 0 (Vitest counts not regressed).
- `pnpm --filter @app/domain test no-direct-state-writes` exits 0.
- `unset DATABASE_URL && pnpm --filter web build` exits 0.
- `pnpm --filter web e2e` exits 0 across **3 consecutive runs** under DEFAULT workers.

**Trap 10 — PR title.**

Recommended: `fix(web): MVP polish — moderation header + active-nav + RBAC payment-sent buttons + lock validation surfacing`. `fix(web):` triggers a patch bump. Multiple sub-fixes in one PR; the title should signal that.

**Trap 11 — If any one of the three fixes is unexpectedly big, surface and split.**

Each is scoped as a small change. If, say, the nav refactor turns out to require restructuring `app/layout.tsx` substantially, STOP. Land the other two fixes in the PR; surface the third as needing its own scoped effort. Don't grow scope to fit; don't half-finish all three.

## PR-flow specifics

1. `git checkout main && git pull --ff-only origin main`.
2. **Verify the prompt 036 prerequisites are merged** — `git log --oneline -10` should show a `fix(web): router.refresh...` commit (or release-please bump that includes it). If not, STOP and tell the user.
3. `git checkout -b fix-web-ui-polish-bundle` off latest `origin/main`.
4. Implement Fix #3 first (it's pure layout — least risky). Add Playwright assertion. Run.
5. Implement Fix #6. Add Playwright assertion. Run.
6. Implement Fix #7. Add Playwright assertion. Run.
7. Run cross-plan invariants (Trap 9).
8. Run full `pnpm --filter web e2e` **3× consecutively** under DEFAULT workers. All 3 green.
9. Commit. Body lists the three fixes + the per-fix file/test changes.
10. `git push -u origin fix-web-ui-polish-bundle`.
11. `gh pr create --base main --head fix-web-ui-polish-bundle --title 'fix(web): MVP polish — moderation header + active-nav + RBAC payment-sent buttons + lock validation surfacing' --body '<PR body — see below>'`.
12. Wait for CI green.
13. **Gate 1 — STOP.** Report + await merge authorization.

**Do not merge the PR yourself.**

**PR body template:**

```
Bundles three small UX fixes from the post-deploy click-through.

### #3 — Moderation queue header + nav active-state
- Added `<h1>Moderation queue</h1>` to `/moderation-queue` page.
- [Other pages audited; any additional headers added.]
- Main nav now highlights the active route via `usePathname()` + `font-semibold` (or similar — match existing nav style).

### #6 — Confirm Received / Dispute role-gating
- `JobDetailView` now gates the Confirm Received / Dispute buttons on `viewer.role === 'Active' && viewer.isEnrolled` (or equivalent existing helper). Alumni / Admin no longer see these on `payment_sent` jobs.

### #7 — Lock validation error surfacing
- `LockJobForm` now displays `mutation.error?.message` inline (matching `EnrollButton` pattern). User submitting a current/past lock date now sees the validation reason instead of silent no-op.

### Verification
- `pnpm --filter web e2e` 3× consecutively under DEFAULT workers — 3/3 green.
- Cross-plan invariants — all green.
- New Playwright assertions cover all three fixes.
```

## Definition of done

- [ ] Moderation queue page has a header consistent with other pages.
- [ ] Main nav highlights the current route via `usePathname()`; verified on at least 3 routes.
- [ ] On `payment_sent` jobs, Confirm Received / Dispute buttons render only for the Active.
- [ ] LockJobForm displays the server validation error inline when submitted with a current/past date.
- [ ] Playwright assertions exist for each of the three fixes.
- [ ] `pnpm -r typecheck` exits 0.
- [ ] `pnpm -r test` exits 0; Vitest counts not regressed.
- [ ] `pnpm --filter @app/domain test no-direct-state-writes` exits 0.
- [ ] `unset DATABASE_URL && pnpm --filter web build` exits 0.
- [ ] `pnpm --filter web e2e` exits 0 across **3 consecutive runs** under DEFAULT workers.
- [ ] No production code touched outside `apps/web/components/*.tsx` + `apps/web/app/**/page.tsx` (and the new tests).
- [ ] No `docs/`, no `packages/`, no `packages/api/src/routers/` touched.
- [ ] PR open against `main` with `fix(web):` title; CI green.

## What to report back (under 350 words)

- PR URL + commit hash.
- For #3: which pages got headers, what nav component was modified, what styling convention you matched.
- For #6: which existing helper you used (or how you computed the role check client-side), and any place else in the codebase using the same pattern that you cross-checked.
- For #7: the exact error message the user now sees (quote from the spec assertion).
- Confirmation `pnpm --filter web e2e` ran 3× consecutively under DEFAULT workers — all green.
- Confirmation each cross-plan invariant green.
- Anything that turned out bigger than expected; whether you split-and-surfaced or proceeded.

## If you get stuck

Escalate with: (1) which fix, (2) exact error, (3) what you tried, (4) your lean.

Particular escalation candidates:
- **Nav component is structured such that active-state requires server-component → client-component handoff** (because `usePathname` is client-only). Lean: convert just the nav-link rendering to a small client component; keep the outer nav structure server-side. Surface if the refactor is bigger than ~20 lines.
- **Fix #6 — no existing `viewerRelationship` / `isEnrolled` field on the `jobs.getById` schema.** Lean: compute client-side from `job.posterId === viewer.id` and `job.enrollments.some(e => e.userId === viewer.id)`. If those fields aren't on the schema either, this becomes a server-side schema addition (out of scope per "no tRPC procedure changes") — escalate.
- **Fix #7 — the form already has an error slot, but `mutation.error` is `null` on validation failure** (which would mean the validation is happening client-side, not on the tRPC procedure). Investigate; surface; fix at the right layer.
- **One of the three fixes turns out to require a real domain/schema change** (e.g., adding a viewer-projection field). Land the other two; surface the third as needing its own scoped effort.

Begin.
