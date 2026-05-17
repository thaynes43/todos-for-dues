# Prompt for Claude Code agent — Execute PLAN-010 (MVP job-loop UI completion)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). **Current state:** PLAN-001..009 are committed, green, and **deployed to production** at `https://todos-for-dues.haynesops.com` (image `ghcr.io/thaynes43/todos-for-dues:v0.2.2`). PLAN-006 landed the walking-skeleton UI happy-path; PLAN-010 fills out the rest of the MVP job-loop UI (rejection / reschedule / cancel / unenroll / revert / dispute / list views per DESIGN-006).

The project is on **PR-flow + release-please**: `main` is branch-protected, every code change lands via PR after CI green (`lint-and-typecheck` + `test`), conventional commit prefixes drive release-please SemVer bumps, and merging a release PR creates the next `vX.Y.Z` tag which CI's `build-image` job picks up.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/010-mvp-job-loop-ui-completion.md` end-to-end (Steps 1 → 8), then verify against `docs/plans/010-mvp-job-loop-ui-completion-validation.md` §6 pass/fail gates. You produce:

- **~13 new React components** under `apps/web/components/` per DESIGN-006 §3 (RejectModal sub-component + RejectedJobBanner + CancelledJobBanner + DisputedJobBanner + ClosedJobBanner + UnenrollButton + RescheduleButton + CancelJobModal + RevertCompletionButton + DisputeJobModal + CompletedJobActiveView + extensions to ApproveRejectButtons + RoleAwareNav).
- **~12 Vitest component tests** under `apps/web/__tests__/components/` (one per new component + JobDetailView snapshot tests).
- **~9 Playwright specs** under `apps/web/e2e/mvp/` (one per VALIDATION-010 §5 test).
- **Two new routes:** `apps/web/app/my-postings/page.tsx` + `apps/web/app/my-enrollments/page.tsx`.
- **Possibly a small `jobs.getById` projection extension** in `packages/api/src/routers/jobs.ts` to return `closedByDisplayName` + the viewing Active's `confirmedAttendee` + `dues_credit` if state is `completed`/`payment_sent`/`closed` (PLAN-010 §7 Risk + Q-PLN-01).
- **One feature PR** with conventional-commit title `feat(web): MVP job-loop UI completion — rejection / reschedule / cancel / unenroll / revert / dispute / list views per DESIGN-006`. **No direct push to `main`** — branch protection rejects it.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Honour every feedback memory (ask-don't-invent, brief responses, doc conventions).
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root project context. **Read the `## Pull-request flow (NORMATIVE)` section** added during PLAN-009: branch → commit → PR → wait for CI green → squash-merge. Direct push to `main` is rejected. **Read the `## Release versioning (release-please)` section** for the conventional-commit conventions: `feat:` triggers a minor bump on the next release PR.
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — "This is NOT the Next.js you know." For every App Router page (the two new routes) or Server Action change, **read `node_modules/next/dist/docs/` first** rather than relying on training-data Next.js conventions. The two new routes are server components with `'use client'` islands only where needed (form state, mutations).
4. `docs/plans/010-mvp-job-loop-ui-completion.md` — the plan. §3 Outputs (the file list), §4 Steps 1–8, §5 Verification, §7 Risks (the role-conditional JobDetailView trap; the `jobs.getById` projection extension; the no-prefill rule on the post-new-job CTA), §9 Q-PLN-NN (resolved leans).
5. `docs/plans/010-mvp-job-loop-ui-completion-validation.md` — validation gates, including the per-component Vitest tests + 9 Playwright specs (no flake on 3× runs) + the JobDetailView snapshot tests covering state×viewer combinations.
6. `docs/designs/006-ui-components.md` §3 (component list), §4.3 (role-conditional JobDetailView pattern — extend this; do NOT rewrite the dispatcher), §4.6 (`stateDisplayName`), §4.7 (date formatter), §4.8 (TippingNudge).
7. **PRDs to anchor the AC mappings:** `docs/prds/002-job-posting-and-moderation.md` §5 R-08..R-11 + AC-10..AC-14; `docs/prds/004-enrollment-lock-reschedule.md` §5 R-03..R-11; `docs/prds/005-completion-and-payment-sent.md` §5 R-05 + §6 Active-side completed view; `docs/prds/006-loop-closure-and-dispute.md` §5 R-05 + §6 Active-side disputed view.
8. **Existing PLAN-006 component patterns** to mirror: `apps/web/components/{ApproveRejectButtons,EnrollButton,LockJobForm,CompleteJobForm,MarkPaymentSentButton,ConfirmReceivedButton,JobDetailView,JobStateBadge,RoleAwareNav,ChapterHeader}.tsx`. Read these to understand the team's component idioms (props shape, `useMutation` + toast pattern, role gates).
9. **Existing tRPC procedures these components call** — every one is implemented + integration-tested in PLAN-005. `packages/api/src/routers/jobs.ts` has `jobs.reject`, `jobs.unenroll`, `jobs.reschedule`, `jobs.cancel`, `jobs.revertCompletion`, `jobs.dispute`, `jobs.listMyPosted`, `jobs.listMyEnrolled`, `jobs.getById`. Read their input schemas + return shapes before writing the calling components.
10. **DESIGN-006 §7** (the global "Already closed by …" toast pattern for `alreadyClosed` responses from `jobs.confirmReceipt`) — relevant for the `confirm-race.spec.ts` Playwright test in §5.

**What's already in the repo you can rely on:**
- `lib/trpc/client.ts` — the React Query / tRPC client (PLAN-006). Components do `trpc.jobs.X.useMutation()`.
- `lib/formatters.ts` — `stateDisplayName` from DESIGN-006 §4.6.
- shadcn/ui primitives — `Dialog`, `Button`, `Textarea`, `Toast`. Don't write custom modal primitives; extend the shadcn ones.
- `packages/auth` — `getSession()` server-side helper for the two new routes' role-gating redirects.
- The bootstrap-admin spec is `test.skip(true, …)` (per PLAN-008 deviation); other Playwright specs are stable.

## What you do NOT do

- **Do not push directly to `main`** — branch protection rejects it. Open a PR; wait for CI green; the user merges (or self-merges if explicitly authorized).
- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans, DDD). If a design ambiguity blocks a step, **escalate to the user** — do not improvise.
- Do not modify `packages/db/`, `packages/domain/`, or the existing tRPC procedure bodies in `packages/api/`. The ONLY exception: extending `jobs.getById`'s field projection to include `closedByDisplayName` + the viewing Active's `confirmedAttendee` + dues_credit if needed (PLAN-010 §7 Risk; verify the existing return shape first — fields may already be projected). If the procedure needs a schema change, that's a separate concern; flag.
- Do not add Playwright to CI — that's PLAN-013's scope (see PLAN-013 §3.1 backlog "Playwright-in-CI"). Your Playwright specs run LOCALLY only.
- Do not bypass branch protection with `gh pr merge --admin` or `--no-verify`. The `enforce_admins: false` setting is for the coordinator's break-glass, not for execution agents.
- Do not add the resolve-dispute affordances to `JobDetailView` — they live on `/admin/disputes` (PLAN-011 scope). When an Admin views a `disputed` job from `/jobs/[jobId]`, render the same `<DisputedJobBanner />` as Actives see.
- Do not pre-fill the post-job form when the Alumni clicks "Post a new job" from a rejected-job banner (PRD-002 Q-01 / §7.1 non-goal). Plain `<Link href="/jobs/new">`, no query params.
- Do not commit until all PLAN-010 §5 + VALIDATION-010 §6 gates are green locally.
- Do not change the test DB engine — PG16 via testcontainers per ADR-004.

## Specific traps to watch for

**Trap 1 — Next.js 16 server component → client island boundary.**
The two new routes (`/my-postings`, `/my-enrollments`) are server components. They fetch via `trpc.jobs.listMyX.query({})` from the **server-side tRPC caller**, not via the React Query hook. The role-gate redirect (`redirect('/login')` for unauthenticated, `redirect('/')` for wrong-role) is server-side; happens at the top of the page component before fetching. **Read `node_modules/next/dist/docs/` for the App Router data-fetching idiom that PLAN-006 already established** — your two new routes mirror that idiom.

The component children that need interactivity (clicking a row → navigate; sort/filter if you add them) are `'use client'` islands wrapped around the server-fetched data. Don't make the entire page `'use client'` — you'd lose server-side role-gating.

**Trap 2 — `jobs.getById` field projection.**
`ClosedJobBanner` needs the display name of the actor who closed the job. `CompletedJobActiveView` needs the viewing Active's `confirmedAttendee` status + their per-Active dues credit. The existing `jobs.getById` may NOT project these. Two options:
- **Extend the existing procedure's return shape** (small change inside `packages/api/src/routers/jobs.ts`): add a `closedBy: { displayName: string | null }` field projected from the last `job_state_transitions` row when state is `closed`; add a `viewerCredit: { confirmed: boolean; amount: number | null }` field when state is `completed`/`payment_sent`/`closed` AND the caller's role is Active. PLAN-005's integration tests cover the existing fields; you'll add ~2 tests for the new ones.
- OR create a new procedure (`jobs.getViewerDuesContext`) — heavier; avoid unless the projection extension is awkward.

**Lean: extend the existing procedure.** Be careful not to break the `no-direct-state-writes` invariant — the projection is a SELECT, not an INSERT/UPDATE, so it's fine. Make sure the projection respects the role-projection rules from PRD-004 R-05 (non-enrolled Actives see roster counts only, not names).

**Trap 3 — `JobDetailView` role-conditional growth.**
PLAN-010 §7 Risk: with these additions, `JobDetailView` becomes ~200 lines of conditional rendering. **Refactor each viewer×state combo into a small sub-component** if any single branch grows past ~20 lines. Keep the outer `JobDetailView` a dispatcher: a `switch (state)` or a flat IIFE that picks the right sub-component based on viewer + state. Sub-components live alongside `JobDetailView.tsx` or under `components/job-detail-view/` if you want them grouped.

DESIGN-006 §4.3 specifically allows this refactor; the contract is "the outer component is a dispatcher; sub-components handle the role-conditional render."

**Trap 4 — Modal submit-disabled rule MUST match server-side EARS.**
The 4 modals with `<textarea>` reasons (Reject, Cancel, Dispute — Reschedule has no reason field; it's a plain confirm) MUST disable the submit button until the textarea has ≥1 non-whitespace character. The check is `value.trim().length >= 1`. This matches the server-side validation in PLAN-005's procedures; client + server must be identical to avoid double-validation surprises.

Test the empty-reason case explicitly in each Playwright spec — submit-disabled is part of the AC for every "reason required" gate (PRD-002 AC-11, PRD-004 AC-14, PRD-006 AC-06).

**Trap 5 — "Already closed by …" toast race.**
`apps/web/e2e/mvp/confirm-race.spec.ts` runs two browser contexts concurrently and asserts the late-clicker sees a toast. The mechanism: `jobs.confirmReceipt` returns `{ alreadyClosed: true, closedBy: '<display name>' }` instead of throwing when the job is already closed (DESIGN-003 §4.4's idempotent response pattern from PLAN-005). The client checks this in the `onSuccess` handler and shows a toast via shadcn's `useToast()` or sonner (whichever PLAN-006 set up — check `apps/web/components/ui/`).

The Playwright spec needs:
- Two `browser.newContext()` calls (two independent sessions).
- Sign each in as a different Active (or one as Active + one as Admin).
- Use `Promise.all` to fire both `confirm-received` clicks simultaneously.
- Assert exactly one transition row in `job_state_transitions`; the late clicker's UI shows the toast.

**Trap 6 — Conventional-commit message + PR title for release-please.**
PLAN-010 §3 specifies the commit message `feat(web): MVP job-loop UI completion — rejection / reschedule / cancel / unenroll / revert / dispute / list views per DESIGN-006`. The `feat:` prefix is load-bearing — release-please will bump the minor version on the next release PR (e.g., `v0.2.x → v0.3.0`). If you accidentally use `chore:` or `refactor:`, no version bump; users would notice when their next deploy doesn't include this work.

When opening the PR, the **PR title** is what release-please reads (since branch protection enforces squash-merge and the squash commit takes the PR title). So the PR title must start with `feat(web):` — not the per-commit-on-branch titles (those get squashed away).

**Trap 7 — Playwright spec test data + isolation.**
PLAN-008 set the precedent: per-spec UUID-suffixed identifiers + scoped assertions (no truncation). Each new MVP spec generates its own users + jobs with UUID suffixes; assertions filter by those identifiers. **Don't share fixtures across specs** — that causes flake under `--workers > 1`.

The personas pattern from `apps/web/e2e/fixtures/personas.ts` (PLAN-008) is the helper to use. Read it before writing your specs; mirror its `loginAs(role, suffix)` shape.

**Trap 8 — Server-side role gates on the two new routes.**
`/my-postings` is for Alumni / Moderator / Admin (everyone with posting capability). `/my-enrollments` is for Active only. The gate runs server-side at the top of the page component:
```ts
const session = await getSession();
if (!session) redirect('/login');
const role = session.user.role;
if (route === 'my-postings' && !['Alumni', 'Moderator', 'Admin'].includes(role)) redirect('/');
if (route === 'my-enrollments' && role !== 'Active') redirect('/');
```
Test the gate via Playwright: sign in as wrong role → navigate to the route → expect redirect to `/`.

**Trap 9 — Cross-plan invariants (the ones you must not break).**
After your work:
- `pnpm --filter @app/domain test no-direct-state-writes` MUST still exit 0; **IGNORE_DIRS unchanged**. Your changes are UI components + 2 routes + possibly a SELECT projection in `jobs.getById`; no INSERT/UPDATE/DELETE on state-machine tables outside `packages/domain/`.
- `pnpm --filter @app/api test` MUST still exit 0 (111+ tests; possibly +2 if you added projection tests).
- `pnpm --filter web e2e -- e2e/walking-skeleton/` MUST still pass (PLAN-006's 7 per-page specs).
- `pnpm --filter web e2e -- --grep walking-skeleton.spec.ts` MUST still pass (PLAN-008's chained spec) — 5x no-flake gate from VALIDATION-008.
- `pnpm --filter web e2e -- --grep sso.spec.ts` MUST still pass (PLAN-008's 4 SSO specs, serial).
- `pnpm --filter @app/notifications test` + `pnpm --filter @app/settings test` MUST still exit 0.
- `pnpm --filter web build` MUST succeed without `DATABASE_URL` (PLAN-002 lazy Proxy intact).
- `pnpm -r typecheck` MUST exit 0.

**Trap 10 — `Q-PLN-01` lean: non-confirmed Active sees "You weren't confirmed."**
`CompletedJobActiveView` for a viewing Active who enrolled but wasn't on the confirmed attendees list renders: "You weren't confirmed for this job; no dues credit recorded." PRD-005 doesn't explicitly spec this; the lean is documented in PLAN-010 §9. Implement it; flag in the PR description that it's a Q-PLN-01 product lean.

## PR-flow specifics (since this is the first feature plan under branch protection)

The cycle:
1. `git checkout -b plan-010-mvp-job-loop-ui` (or a descriptive name).
2. Commit your work in whatever shape makes sense locally — multiple commits are fine since the PR squash-merges. Each individual commit message should be conventional-commit prefixed if you care about clean local history; the squash commit is what release-please reads.
3. Run all gates locally (every Vitest suite + every Playwright spec 3× no-flake + `pnpm --filter web build` + `pnpm -r typecheck`).
4. `git push -u origin plan-010-mvp-job-loop-ui`.
5. `gh pr create --base main --head plan-010-mvp-job-loop-ui --title 'feat(web): MVP job-loop UI completion — rejection / reschedule / cancel / unenroll / revert / dispute / list views per DESIGN-006' --body '<PR body with summary + test plan>'`.
6. Wait for CI green (`lint-and-typecheck` + `test`). The `test` job runs all vitest suites; **Playwright is NOT run in CI** — that's a documented gap (PLAN-013 §3.1 backlog).
7. Report back to the user with the PR URL + the commit hash on the branch + the cross-plan-invariant confirmations.

**Do not merge the PR yourself.** Even with the user's authorization for self-merge, leave it to the user unless explicitly told otherwise — they have downstream context (release timing, coordinated deploys).

## Definition of done

Every box in VALIDATION-010 §6 green:

- [ ] All Vitest component tests pass: `pnpm --filter web test` exit 0 (covers the ~12 new component tests).
- [ ] All Playwright MVP specs pass: `pnpm --filter web e2e -- e2e/mvp/` exit 0; run 3× no flake.
- [ ] No `console.error` during Playwright runs (PLAN-006's pattern: pageerror listener).
- [ ] `pnpm --filter web build` exits 0 (the extended `JobDetailView` must compile).
- [ ] `pnpm -r typecheck` exits 0.
- [ ] One PR opened on the branch with the correct conventional-commit title (`feat(web): …`); body summarises the changes + test plan.
- [ ] CI green on the PR (`lint-and-typecheck` + `test` pass).
- [ ] **Cross-plan invariants:** PLAN-003 static check + PLAN-005 integration + PLAN-006 per-page Playwright + PLAN-007 notifications + PLAN-008 chained walking-skeleton + 4 SSO specs all pass locally. Confirm in your report.
- [ ] Q-PLN-01 lean ("You weren't confirmed" copy for non-confirmed Active) implemented and flagged in PR body.

Report back (under 350 words): PR URL, commit hash on the branch, any escalations, **anything in `jobs.getById` you extended (with the new field names)**, **explicit confirmation of each cross-plan invariant**, and how you handled the `JobDetailView` role-conditional refactor (kept inline vs. extracted sub-components).

## If you get stuck

Escalate with: (1) which step, (2) exact error, (3) what you tried, (4) your lean. Do not invent product or architectural decisions. Do not modify any design or upstream plan.

Particular escalation candidates:
- `jobs.getById` projection extension reveals that PLAN-005's role-projection (PRD-004 R-05 — non-enrolled Actives see counts only) needs nuanced handling for the viewer's own row. Flag the case; don't improvise the projection.
- A Vitest snapshot test for `JobDetailView` reveals an existing role-conditional bug from PLAN-006 (e.g., happy-path was overly permissive). Flag, propose the fix; the user decides whether it lands here or in a separate `fix(web):` PR.
- A Playwright spec hits a tRPC error that suggests the procedure's input schema is too strict (e.g., `jobs.dispute` requires a `reason` field that the modal isn't sending). Read the procedure source first; if your client is wrong, fix the client. If the procedure is wrong, flag.
- The race spec for `confirm-race.spec.ts` doesn't reliably trigger the race condition. Don't insert sleeps; use `Promise.all` with `page.evaluate` to dispatch the click at the same browser tick.

Begin.
