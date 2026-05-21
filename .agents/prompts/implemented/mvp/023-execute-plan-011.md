# Prompt for Claude Code agent — Execute PLAN-011 (Admin view UI)

You are a fresh Claude Code agent. You have no prior conversation context. Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). **Current state:** PLAN-001..010 are committed, green, and **deployed** at `https://todos-for-dues.haynesops.com`. PLAN-010 just landed the MVP job-loop UI (rejection / reschedule / cancel / unenroll / revert / dispute / list views); PLAN-011 builds the `/admin/*` route tree DESIGN-006 §3 specifies: Admin-only layout shell, Dashboard with state aggregates, Disputes drill-in with in-place resolution actions (PRD-006 R-08/R-09/R-10 from the Admin side), per-job audit log timeline, per-field save-on-blur Settings form, and a Users sub-route shell that PLAN-012 will fill in.

The project is on **PR-flow + release-please**: `main` is branch-protected, every code change lands via PR after CI green (`lint-and-typecheck` + `test`), conventional commit prefixes drive release-please SemVer bumps, and merging a release PR creates the next `vX.Y.Z` tag.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Execute `docs/plans/011-admin-view-ui.md` end-to-end (Steps 1 → 7), then verify against `docs/plans/011-admin-view-ui-validation.md` §6 pass/fail gates. You produce:

- **One Admin-only layout** at `apps/web/app/admin/layout.tsx` with a server-side Admin role gate + a 5-entry left-nav (Dashboard / Disputes / Settings / Audit log / Users), Disputes nav entry carrying a live count badge.
- **Five `/admin/*` routes:** `apps/web/app/admin/page.tsx` (Dashboard), `disputes/page.tsx` (drill-in list + resolve modals), `settings/page.tsx` (save-on-blur form), `audit-log/page.tsx` (find-by-job-ID), `jobs/[jobId]/page.tsx` (per-job audit log + JobDetailView), `users/page.tsx` (shell only — PLAN-012 fills it).
- **Six new React components** under `apps/web/components/`: `AggregateCountsCards`, `DisputeCardList`, `ResolveDisputeModal`, `SettingsForm`, `AuditLogTable`, plus any small accessible primitives you need (reuse `ui/modal` from PLAN-010 for the resolution-note dialogs).
- **Six Vitest component tests** under `apps/web/__tests__/components/` (per VALIDATION-011 §4): `AdminLayout`, `AggregateCountsCards`, `DisputeCardList`, `ResolveDisputeModal`, `SettingsForm`, `AuditLogTable`.
- **Nine Playwright specs** under `apps/web/e2e/admin/` (per VALIDATION-011 §5): `layout-shell`, `dashboard`, `disputes-list`, `dispute-resolve-closed`, `dispute-resolve-cancelled`, `dispute-resolve-false-alarm`, `audit-log`, `audit-log-search`, `settings-save`, `users-shell`. (That's 10; the four resolve specs are distinct.)
- **Possibly small extensions to `admin.listDisputed`** in `packages/api/src/routers/admin.ts` to project the age-of-dispute (latest `to_state: disputed` `created_at` from `job_state_transitions`) — PLAN-011 §7 Risk option (a). SELECT-only; no FSM writes added. +1–2 integration tests if you take this path.
- **Possibly a small extension to `apps/web/app/jobs/page.tsx`** to parse the `?state=<state>` query param so the AggregateCountsCards click-through works — PLAN-011 §7 Risk.
- **One feature PR** with conventional-commit title `feat(web): Admin view UI — Dashboard / Disputes (resolve) / Settings / Audit log / Users shell per PRD-007 + DESIGN-006`. **No direct push to `main`** — branch protection rejects it.

## What to read FIRST (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — user's auto-memory. Honour every feedback memory (ask-don't-invent, brief responses, doc conventions).
2. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md` — root project context. **`## Pull-request flow (NORMATIVE)`** + **`## Release versioning (release-please)`** sections are load-bearing. `feat:` prefix triggers a minor bump on the next release PR.
3. `/Users/thaynes/src/projects/todos-for-dues/apps/web/AGENTS.md` (one line) — "This is NOT the Next.js you know." Every App Router page (5 new routes + 1 dynamic) is a server component with `'use client'` islands only where needed (the SettingsForm field state, the ResolveDisputeModal mutations, the audit-log-search submit handler). **Read `node_modules/next/dist/docs/` for the App Router data-fetching idiom** that PLAN-006 + PLAN-010 already established.
4. `docs/plans/011-admin-view-ui.md` — the plan. §3 Outputs (the full file list), §4 Steps 1–7, §5 Verification, §7 Risks (the disputes-count badge fetch, age-of-dispute projection, save-on-blur debounce, `/jobs?state=` extension), §9 Q-PLN-NN (resolved leans).
5. `docs/plans/011-admin-view-ui-validation.md` — gates, the 9-spec Playwright list, the 6 Vitest tests, the coverage matrix mapping every PRD-007 AC to a spec.
6. `docs/designs/006-ui-components.md` §3 (the `/admin/*` route tree), §4.3 (component sketches for `AggregateCountsCards`, `AuditLogTable`, `SettingsForm`), §4.6 (`stateDisplayName`), §4.7 (`formatChapterLocal`).
7. **PRDs to anchor the AC mappings:** `docs/prds/007-admin-view-and-audit-log.md` §5 R-01..R-10 + §5.1 AC-01..AC-11 + §6 UX rules; `docs/prds/006-loop-closure-and-dispute.md` §5 R-08/R-09/R-10 + AC-08/AC-09/AC-10/AC-11 + AC-13.
8. **DESIGN-003 tRPC surface** for the procedures the UI calls: §4.4 (`jobs.resolveDisputeAs{Closed,Cancelled,PaymentSent}`, `jobs.getHistory`), §4.6 (`settings.list`, `settings.set`, the `SETTING_VALIDATORS` map), §4.7 (`admin.getAggregateCounts`, `admin.listDisputed`).
9. **PLAN-006 + PLAN-010 component idioms to mirror:** read `apps/web/components/{JobDetailView,RejectModal,CancelJobModal,DisputeJobModal,RoleAwareNav,JobStateBadge}.tsx` for the team's prop shape, `useMutation` + toast pattern, server-side role-gate redirect pattern (the pattern lives at the top of `/my-postings/page.tsx` + `/my-enrollments/page.tsx` from PLAN-010 — copy that).
10. **PLAN-010's e2e/mvp helpers** at `apps/web/e2e/mvp/support.ts` — `seedCast(pool, suffix)` returns `{ alumni, mod, active, admin }`; `postJob` / `approveAsMod` / `enrollAsActive` / `lockAsAlumni` / `completeAsAlumni` / `markPaymentSentAsAlumni` are the existing chain. You'll likely add `disputeAsActive`, `cancelAsAlumni`, `rejectAsMod`, and `confirmReceivedAsActive` to drive jobs into all the states the dashboard counts assert against.
11. ADR-010 (per-instance settings storage) — the 5 MVP keys (`admin_recipient_email`, `treasurer_recipient_email`, `moderators_recipient_email`, `chapter_timezone`, `chapter_display_name`) + their validation rules.

**What's already in the repo you can rely on:**
- `lib/trpc-client.ts` — the React Query / tRPC client. Components do `trpc.X.Y.useMutation()` / `.useQuery()`.
- `lib/formatters.ts` — `stateDisplayName` + `formatChapterLocal`.
- shadcn/ui primitives — `Dialog`, `Button`, `Textarea`, `Input`. Reuse them; reuse the `components/ui/modal.tsx` primitive PLAN-010 added if it fits.
- `packages/auth` — `getSession()` server-side helper for the layout's role-gate redirect.
- PLAN-010's `apps/web/components/JobDetailView.tsx` already handles every state×viewer combo, including Admin viewing a `disputed` job (renders `<DisputedJobBanner reason={isAdmin ? job.disputeReason : undefined} />`). **The per-job admin view (`/admin/jobs/[jobId]`) renders `<JobDetailView>` and `<AuditLogTable>` stacked — do NOT duplicate the role-conditional render logic; let `JobDetailView` do its job.**

## What you do NOT do

- **Do not push directly to `main`** — branch protection rejects it. Open a PR; wait for CI green; the user merges.
- Do not modify anything under `docs/` (PRDs, ADRs, designs, plans, DDD). If a design ambiguity blocks a step, **escalate to the user** — do not improvise.
- Do not modify `packages/db/` or `packages/domain/` source. The ONLY procedure-body exceptions in `packages/api/`: (a) extending `admin.listDisputed` to project the age-of-dispute via a `LEFT JOIN LATERAL` against `job_state_transitions`; (b) verify the existing return shape first — fields may already be projected.
- Do not add Playwright to CI — that's PLAN-013's scope (PLAN-013 §3.1 backlog "Playwright-in-CI"). Your Playwright specs run LOCALLY only.
- Do not bypass branch protection with `gh pr merge --admin` or `--no-verify`. The `enforce_admins: false` setting is for the coordinator's break-glass, not for execution agents.
- Do not add real Users list / role-grant UI under `/admin/users` — that's PLAN-012 scope. Your `users/page.tsx` is a placeholder `<div>Users list — implemented in PLAN-012</div>` behind the layout's role gate.
- Do not add charts, bulk-edit settings, audit-log search-by-actor, or polling badges — PRD-007 §7.1 non-goals.
- Do not commit until all PLAN-011 §5 + VALIDATION-011 §6 gates are green locally.
- Do not change the test DB engine — PG16 via testcontainers per ADR-004.

## Specific traps to watch for

**Trap 1 — `pageerror` listener in every new spec.**
VALIDATION-010 flagged a deviation: PLAN-010's MVP specs never installed a `pageerror` listener (PLAN-006's pattern at `apps/web/e2e/walking-skeleton/` had it). Don't repeat. **Every spec under `e2e/admin/` MUST install a `pageerror` listener** that fails the test on any uncaught console error from the browser. Lift the pattern into a shared `e2e/admin/support.ts` helper (`installPageerrorListener(page)`) so each spec calls it once at `beforeEach`. Reuse the PLAN-006 pattern verbatim — read `e2e/walking-skeleton/support/` to see how they did it.

**Trap 2 — Server-side role gate on the layout, NOT client-side.**
`apps/web/app/admin/layout.tsx` is a server component. The role check runs server-side before any tRPC call so unauthorized data never reaches the browser:
```ts
const session = await getSession();
if (!session) redirect('/login');
if (session.user.role !== 'Admin') redirect('/');
```
Test via Playwright: sign in as Active/Alumni/Moderator → navigate to `/admin/*` → expect redirect to `/` (or 403 if you implement the Forbidden page per DESIGN-006 §7). If the gate is client-side (`useEffect` redirect), data leaks on slow networks — **escalate**.

**Trap 3 — Disputes nav badge fetch happens on every page render.**
Per PRD-007 §6 UX rule "Disputes section badges the count." Fetch the count server-side in the layout. At MVP scale this is fine; **don't add caching, polling, or websockets** (out of scope). The simplest correct approach: server-side `await trpc.admin.listDisputed.query({})` from the layout, take `result.length`. If the count is 0, the design lean is "absent" (per VALIDATION-011 §5 `layout-shell.spec.ts` — verify by reading the spec).

**Trap 4 — `admin.listDisputed` projection extension (Q-PLN-01-style).**
The dispute card row needs the age-of-dispute (how long the job has been in `disputed`). Two options:
- **(a) Extend `admin.listDisputed`'s return shape** — add a `disputedAt: string` field projected from `LEFT JOIN LATERAL (SELECT created_at FROM job_state_transitions WHERE job_id = jobs.id AND to_state = 'disputed' ORDER BY created_at DESC LIMIT 1)`. SELECT-only; respects PLAN-003's `no-direct-state-writes` invariant.
- **(b) Fetch lazily per row** — the row component does a separate `jobs.getHistory({ jobId })` query. N+1 problem; avoid.

**Lean: option (a).** +1–2 integration tests in `packages/api/__tests__/integration/admin.test.ts` (or wherever `admin.listDisputed`'s tests live) for the new field.

**Trap 5 — `/jobs?state=<state>` query-param extension.**
`AggregateCountsCards` cards link to `/jobs?state=payment_sent` (etc.). PLAN-006's `apps/web/app/jobs/page.tsx` may not currently parse the `state` query param. Extend it: read `searchParams?.state`, validate against `JOB_STATES`, and filter the server-side `jobs.list` (or whatever procedure that page calls) by that state. **The page is role-aware from PLAN-006**, so the projection rules already work — you just narrow the filter.

**Trap 6 — `SettingsForm` per-field save-on-blur + debounce.**
Per PRD-007 §6 UX rule "Save on blur, with toast." Each of the 5 fields:
- Has the appropriate input type (`email` for the 3 recipient emails; plain `text` for `chapter_timezone` + `chapter_display_name`).
- On blur, runs the Zod schema from `SETTING_VALIDATORS` (DESIGN-003 §4.6). Invalid → render field-level error message (`<p role="alert">`); do NOT call the mutation.
- Valid → `trpc.settings.set.useMutation({ key, value })`; success → toast "Saved." (use whichever toast lib PLAN-006/010 set up — check `apps/web/components/ui/` for the sonner / shadcn `useToast` integration).
- **Debounce by ~200ms** on rapid blur events (Tab navigation). Cancel pending blur-save if the user re-focuses the field within the debounce window. Test this in the spec by Tab'ing between fields rapidly and asserting only the final blur fires a mutation per field.
- **No "Save changes" button** per the same PRD §6 UX rule.

Make the Zod validators identical (literally re-export from the API package if possible) — client + server must agree to avoid double-validation surprises. Per VALIDATION-010 §6 modal-disable rule, treat trimmed-empty as invalid.

**Trap 7 — `AuditLogTable` timestamp format.**
PRD-007 §6 UX rule: "Audit log timestamps chapter-local with UTC tooltip." Render each row's timestamp as:
```tsx
<time
  dateTime={transition.createdAt.toISOString()}
  title={transition.createdAt.toISOString()}
>
  {formatChapterLocal(transition.createdAt)}
</time>
```
The `<time datetime>` carries the UTC ISO for screen readers / tooltips. `formatChapterLocal` displays the chapter-local time. Verify the spec at `audit-log.spec.ts` checks BOTH the visible chapter-local text AND the `datetime` attribute value.

Sort order: chronological, **oldest first** (matches the natural "story of this job" reading direction). If PRD-007 says otherwise, follow the PRD.

**Trap 8 — `/admin/jobs/[jobId]` reuses `<JobDetailView>`.**
PLAN-011 Q-PLN-01 lean: combine `<JobDetailView>` + `<AuditLogTable>` on this route. **Do not duplicate the role-conditional render** that lives inside `JobDetailView` — pass `viewer={{ id: session.user.id, role: 'Admin' }}` and let `JobDetailView` decide. The Admin sees: terminal-state banner if applicable (RejectedJobBanner / CancelledJobBanner / DisputedJobBanner with reason visible because `isAdmin = true` / ClosedJobBanner), plus the Active-side `CompletedJobActiveView` does NOT render (gated on `viewer.role === 'Active'`), plus the action affordances appropriate for Admin (Admin's resolve-dispute actions live on `/admin/disputes` per PLAN-010 spec — `JobDetailView` does NOT show them here).

Beneath the `JobDetailView`, render `<AuditLogTable transitions={history} />` from `jobs.getHistory({ jobId })`.

**Trap 9 — `ResolveDisputeModal` 3 buttons → 3 sub-modals.**
Per PRD-007 R-05 + PRD-006 R-08/R-09/R-10: Admin opens the modal → sees 3 primary buttons {Mark closed, Mark cancelled, Mark false-alarm}. Clicking each opens a sub-`<Dialog>` with a textarea for the resolution note. Submit disabled until `value.trim().length >= 1` (per PRD-006 AC-09). On submit → call `jobs.resolveDisputeAs{Closed,Cancelled,PaymentSent}` (the "false-alarm" button maps to `resolveDisputeAsPaymentSent` — the job goes back to `payment_sent` so the Active can re-confirm or re-dispute).

On success: close both modals, show a toast, invalidate `admin.listDisputed` so the row disappears.

**Trap 10 — Conventional-commit message + PR title for release-please.**
PLAN-011 §3 specifies `feat(web): Admin view UI — Dashboard / Disputes (resolve) / Settings / Audit log / Users shell per PRD-007 + DESIGN-006`. `feat:` is load-bearing — release-please will bump minor on the next release PR. PR **title** is what release-please reads on squash-merge.

**Trap 11 — Playwright spec test data + isolation.**
Same precedent as PLAN-008/010: per-spec UUID-suffixed identifiers + scoped assertions. The dashboard spec needs jobs in many states; build a `seedJobsInStates(pool, suffix, count_by_state)` helper that drives jobs through the FSM via the existing helpers (`postJob` → `approveAsMod` → `enrollAsActive` → `lockAsAlumni` → `completeAsAlumni` → `markPaymentSentAsAlumni` → `confirmReceivedAsActive`). For `rejected` jobs, drive a freshly-posted job to `awaiting_moderation` then reject. For `cancelled` jobs, cancel from `enrollment_open` or `locked`. For `disputed` jobs, drive to `payment_sent` then dispute.

Don't share fixtures across specs — that causes flake under `--workers > 1`.

**Trap 12 — Cross-plan invariants (the ones you must not break).**
After your work:
- `pnpm --filter @app/domain test no-direct-state-writes` MUST still exit 0; **IGNORE_DIRS unchanged**. Your changes are UI components + 5 routes + possibly a SELECT projection extension in `admin.listDisputed`; no INSERT/UPDATE/DELETE on state-machine tables outside `packages/domain/`.
- `pnpm --filter @app/api test` MUST still exit 0 (≥115 tests now; possibly +1-2 if you added projection tests).
- `pnpm --filter web e2e -- e2e/walking-skeleton/` MUST still pass (PLAN-006's 7 per-page specs).
- `pnpm --filter web e2e -- --grep walking-skeleton.spec.ts` MUST still pass (PLAN-008's chained spec) — 5x no-flake gate from VALIDATION-008.
- `pnpm --filter web e2e -- --grep sso.spec.ts` MUST still pass if SSO specs are present.
- `pnpm --filter web e2e -- e2e/mvp/` MUST still pass — PLAN-010's 9 specs.
- `pnpm --filter @app/notifications test` + `pnpm --filter @app/settings test` MUST still exit 0.
- `unset DATABASE_URL && pnpm --filter web build` MUST succeed (PLAN-002 lazy Proxy intact).
- `pnpm -r typecheck` MUST exit 0.

## PR-flow specifics

1. `git checkout -b plan-011-admin-view-ui` (or a descriptive name).
2. Commit your work in whatever shape makes sense locally — squash-merge will collapse them.
3. Run all gates locally (every Vitest suite + every Playwright spec 3× no-flake + `pnpm --filter web build` + `pnpm -r typecheck`).
4. `git push -u origin plan-011-admin-view-ui`.
5. `gh pr create --base main --head plan-011-admin-view-ui --title 'feat(web): Admin view UI — Dashboard / Disputes (resolve) / Settings / Audit log / Users shell per PRD-007 + DESIGN-006' --body '<PR body with summary + test plan>'`.
6. Wait for CI green (`lint-and-typecheck` + `test`). Playwright is NOT in CI (documented gap; PLAN-013 §3.1 backlog).
7. Report back with the PR URL + commit hash + cross-plan-invariant confirmations.

**Do not merge the PR yourself.** Leave it to the user.

## Definition of done

Every box in VALIDATION-011 §6 green:

- [ ] All Vitest component tests pass: `pnpm --filter web test` exit 0 (covers the 6 new component tests).
- [ ] All Playwright admin specs pass: `pnpm --filter web e2e -- e2e/admin/` exit 0; run 3× no flake.
- [ ] **`pageerror` listener installed in every new admin spec** (the VALIDATION-010 deviation does NOT repeat).
- [ ] DB state after dispute-resolve specs shows the expected `job_state_transitions` rows with resolution notes.
- [ ] DB state after settings-save spec shows the `chapter_settings` row updated with `updatedBy = <admin user uuid>`.
- [ ] No `console.error` during Playwright runs.
- [ ] `pnpm --filter web build` exits 0 (no `DATABASE_URL` needed).
- [ ] `pnpm -r typecheck` exits 0.
- [ ] One PR opened with conventional-commit title (`feat(web): …`); body summarises changes + test plan.
- [ ] CI green on the PR (`lint-and-typecheck` + `test` pass).
- [ ] **Cross-plan invariants:** PLAN-003 static check + PLAN-005 integration + PLAN-006 per-page Playwright + PLAN-007 notifications + PLAN-008 chained walking-skeleton + 4 SSO specs + PLAN-010 MVP specs all pass locally. Confirm in your report.
- [ ] If you extended `admin.listDisputed`, the projection respects PRD-007 R-04 (no role-leak — Admin-only procedure already; just don't break the existing return shape).

Report back (under 350 words): PR URL, commit hash, any escalations, **what you extended in `admin.listDisputed` (with the new field name)**, **whether you extended `apps/web/app/jobs/page.tsx` for the `?state=` query param**, and **explicit confirmation of each cross-plan invariant**.

## If you get stuck

Escalate with: (1) which step, (2) exact error, (3) what you tried, (4) your lean. Do not invent product or architectural decisions. Do not modify any design or upstream plan.

Particular escalation candidates:
- `admin.listDisputed` projection extension reveals a missing index that would make the JOIN slow — flag, propose the index, don't add it (DB changes are out of scope here).
- The audit-log page's combined `<JobDetailView>` + `<AuditLogTable>` render reveals a JobDetailView bug for Admin viewers on a non-terminal state — flag, propose the fix in a follow-up `fix(web):` PR; don't conflate with PLAN-011.
- The dashboard counts spec is flaky because the seeded jobs cross test boundaries — investigate the cleanup hook; do not insert sleeps.
- `SettingsForm`'s 200ms debounce makes Playwright assertions flaky — bump the debounce to 100ms OR insert a deterministic `await page.waitForResponse(/settings\.set/)` per assertion; don't insert blind sleeps.

Begin.
