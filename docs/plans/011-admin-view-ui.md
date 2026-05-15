---
id: PLAN-011
title: Admin view UI — Dashboard, Disputes, Settings, Audit log, Users shell
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: L
related:
  prds: [PRD-007, PRD-006, PRD-008]
  adrs: [ADR-001, ADR-010]
  bounded_contexts: [BCC-02]
  aggregates: [ADC-01]
  designs: [DESIGN-006]
  plans:
    prerequisite: [PLAN-005, PLAN-006, PLAN-007]
    lateral: [VALIDATION-011]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Build the `/admin/*` route tree that DESIGN-006 §3 describes and PLAN-006 explicitly deferred: Admin-only layout shell, Dashboard with state aggregates, Disputes section with in-place resolution actions (wired to PRD-006 R-08/R-09/R-10), Settings form with per-field save-on-blur, per-job audit log timeline (find-by-job-ID + drill-in from any job's detail page), and a Users sub-route shell that hosts PLAN-012's role-management components.

**Why a new plan rather than extending PLAN-006:** PRD-007 R-01 spans 4+1 named sections (Dashboard, Disputes, Settings, Audit log, plus the Users sub-route) — that's a substantial UI surface in its own right and lands cleanly as one PR. Decoupling from PLAN-006 also lets the walking-skeleton deploy (PLAN-009) ship without the Admin view, since PRD-007 §10 says the walking-skeleton version of this view is "audit log shows latest 50 rows for one job; no aggregates, no settings UI yet" — and PLAN-006's release plan already deferred all of those.

> **Produces:** every `/admin/*` route from DESIGN-006 §3 except `/admin/users` (which is a shell here, with the real role-management components landing in PLAN-012).
> **Definition of success:** VALIDATION-011 passes — every PRD-007 AC is verified by a Playwright spec, and the disputes-resolution flow (PRD-006 R-08/R-09/R-10 from the Admin side) is exercised end-to-end through the Admin UI.

## 2. Inputs

### 2.1 Documents the agent must read first

1. `docs/designs/006-ui-components.md` §3 (the `/admin/*` route tree) + §4.3 (component sketches incl. `AggregateCountsCards`, `AuditLogTable`, `SettingsForm`) + §4.6 (`stateDisplayName`) + §4.7 (chapter-local date display, used in `AuditLogTable`).
2. `docs/prds/007-admin-view-and-audit-log.md` §5 R-01..R-10 + §5.1 ACs + §6 UX rules (left-nav layout, dashboard landing, count badges, save-on-blur, chapter-local timestamps with UTC tooltip).
3. `docs/prds/006-loop-closure-and-dispute.md` §5 R-08/R-09/R-10 + AC-08..AC-11 (Admin resolution paths; PLAN-011 wires the UI; the backend was implemented in PLAN-005).
4. `docs/designs/003-trpc-api-surface.md` §4.7 (admin router) + §4.6 (settings router) + §4.4 (`jobs.getHistory`, `jobs.resolveDisputeAs*`) — the procedures this UI calls.
5. `docs/adrs/010-per-instance-settings-storage.md` — for the `chapter_settings` MVP-key list (`admin_recipient_email`, `treasurer_recipient_email`, `moderators_recipient_email`, `chapter_timezone`, `chapter_display_name`).

### 2.2 Repo state assumed

- PLAN-005 complete: `admin.getAggregateCounts`, `admin.listDisputed`, `settings.list`, `settings.set`, `jobs.resolveDisputeAs{Closed,Cancelled,PaymentSent}`, `jobs.getHistory` all exist + integration-tested.
- PLAN-006 complete: root layout, ChapterHeader, RoleAwareNav, JobStateBadge, formatters (`stateDisplayName`, `formatChapterLocal`) exist.
- PLAN-007 complete: chapter_settings rows exist with sane defaults (the env-var-bootstrap path means dev DBs come up with the 5 MVP keys populated per DESIGN-001 §5.5).

### 2.3 External dependencies

- Same as PLAN-006: dev server + Postgres.

## 3. Outputs

After this plan completes:

- `apps/web/app/admin/layout.tsx` — Admin-only layout shell per DESIGN-006 §3:
  - Server-side role check: redirects non-Admin to `/` (403 page if you prefer; aligned with DESIGN-006 §7 `FORBIDDEN` surface).
  - Left-nav with five named sections per PRD-007 R-01: Dashboard, Disputes, Settings, Audit log, Users.
  - Disputes nav entry shows a count badge (live SQL via `admin.listDisputed`'s row count) per PRD-007 §6 UX rule "Disputes section badges the count."
- `apps/web/app/admin/page.tsx` — Dashboard landing page per PRD-007 R-01/R-02 + DESIGN-006 §4.3 `AggregateCountsCards`.
- `apps/web/components/AggregateCountsCards.tsx` — the clickable grid component per DESIGN-006 §4.3. Each card links to `/jobs?state=<state>` (the filtered list view from PLAN-006 — extend if needed to accept a `state` query param).
- `apps/web/app/admin/disputes/page.tsx` — Disputes drill-in list per PRD-007 R-04. Calls `admin.listDisputed`. Each row uses `<DisputeCardList>` rendering: job description (truncated), disputer's display name + role, dispute reason (truncated), age in `disputed` state (computed from the latest `to_state: disputed` `created_at` via `jobs.getHistory` or extend `admin.listDisputed` to project it), and a link to the per-job admin route `/admin/jobs/<jobId>`.
- `apps/web/components/DisputeCardList.tsx` — list-item component per DESIGN-006 §3.
- `apps/web/components/ResolveDisputeModal.tsx` — Admin-only; shows 3 buttons {Mark closed, Mark cancelled, Mark false-alarm (revert to payment-sent)} per PRD-007 R-05 + PRD-006 R-08/R-09/R-10. Each button opens a sub-modal requiring a `<textarea>` resolution note (submit disabled until ≥1 non-whitespace char per PRD-006 AC-09); on submit calls the corresponding tRPC procedure (`jobs.resolveDisputeAsClosed` / `jobs.resolveDisputeAsCancelled` / `jobs.resolveDisputeAsPaymentSent`).
- `apps/web/app/admin/settings/page.tsx` — Chapter settings form per PRD-007 R-07/R-08.
- `apps/web/components/SettingsForm.tsx` — per-field save-on-blur form per DESIGN-006 §4.3 + PRD-007 §6 UX rule. One field per MVP setting (5 fields per ADR-010); each field has its own debounced save-on-blur + a toast confirming "Saved." Per-field Zod validation matches `settings.set`'s `SETTING_VALIDATORS` map from DESIGN-003 §4.6 (email format for the 3 recipient addresses; IANA tz regex for `chapter_timezone`; non-empty trimmed for `chapter_display_name`).
- `apps/web/app/admin/jobs/[jobId]/page.tsx` — Per-job audit log route per PRD-007 R-06 + DESIGN-006 §3. Renders `<JobDetailView>` (so an Admin sees the same role-conditional controls plus the audit-log table below) AND `<AuditLogTable>`.
- `apps/web/components/AuditLogTable.tsx` — chronological transitions table per DESIGN-006 §4.3. Columns: timestamp (chapter-local via `formatChapterLocal`; raw UTC ISO in the `<time datetime>` attribute per PRD-007 §6), `from_state → to_state` (via `stateDisplayName`), actor display name + role (or "system"), `note` field. Calls `jobs.getHistory({ jobId })`.
- `apps/web/app/admin/audit-log/page.tsx` — entry-point page per PRD-007 §6: "find by job ID" search input (no all-transitions-across-all-jobs view per the same §6 rule). On submit, navigates to `/admin/jobs/<jobId>`.
- `apps/web/app/admin/users/page.tsx` — **shell only**: server-side role-gates Admin; renders a placeholder `<div>Users list — implemented in PLAN-012</div>`. The real list + grant UI lands in PLAN-012; this plan owns the route + role-gate so PLAN-012 can drop the components in without route plumbing.
- One git commit: `feat(web): Admin view UI — Dashboard / Disputes (resolve) / Settings / Audit log / Users shell per PRD-007 + DESIGN-006`.

## 4. Steps

### Step 1 — Admin layout shell + role gate + nav

- **Action:**
  - `apps/web/app/admin/layout.tsx` — server component using `getServerSession`. If session is null → `redirect('/login')`. If `role !== 'Admin'` → render the `<Forbidden />` page (or redirect to `/`).
  - Inside the layout, render an Admin-only nav with five entries:
    - "Dashboard" → `/admin`
    - "Disputes" → `/admin/disputes` — fetch the count via a server-side `trpc.admin.listDisputed` call or a dedicated `admin.getDisputeCount` query (extend DESIGN-003 §4.7 with a small query if more efficient — though looping over `listDisputed`'s length is fine at MVP scale).
    - "Settings" → `/admin/settings`
    - "Audit log" → `/admin/audit-log`
    - "Users" → `/admin/users`
  - No regular-app nav elements show inside `/admin/*` per PRD-007 §6 ("No Active/Alumni nav elements anywhere in /admin/*").
- **Verification:** Admin can hit `/admin` → sees the nav. Non-Admin gets redirected or sees the Forbidden page. The disputes nav entry shows a numeric count badge when at least one job is in `disputed` state.

### Step 2 — Dashboard with aggregate counts

- **Action:**
  - `apps/web/app/admin/page.tsx` — server component that calls `trpc.admin.getAggregateCounts` and renders `<AggregateCountsCards counts={...} />`.
  - `apps/web/components/AggregateCountsCards.tsx` — per DESIGN-006 §4.3. Renders one clickable card per state from the response; each card label uses `stateDisplayName(state)`; clicking navigates to `/jobs?state=<state>` (extend `apps/web/app/jobs/page.tsx` to honour the `state` query param; the list is already role-aware from PLAN-006 — Admin sees all states).
- **Verification:** AC-03 from PRD-007: seeded DB with a known mix of jobs shows exact counts. AC-04: clicking a card filters the jobs list.

### Step 3 — Disputes drill-in + ResolveDisputeModal

- **Action:**
  - `apps/web/app/admin/disputes/page.tsx` — server-fetches `admin.listDisputed`; renders the rows via `<DisputeCardList>`. Each row links to `/admin/jobs/<jobId>` AND includes inline `<ResolveDisputeModal jobId={...} />` buttons.
  - `apps/web/components/DisputeCardList.tsx` — small list-item component; truncate description + reason to ~100 chars; show age as "Xd / Xh" via a short date-delta formatter.
  - `apps/web/components/ResolveDisputeModal.tsx` — three primary buttons (Mark closed / Mark cancelled / Mark false-alarm). Clicking each opens a sub-`<Dialog>` with a labelled `<textarea>` for the resolution note (submit disabled until non-empty). On submit, calls the matching mutation. On success, invalidate `admin.listDisputed` so the row disappears.
- **Verification:** AC-05 (Disputes list shape) + AC-06 (resolve action fires the right procedure, closes the modal, removes the row).

### Step 4 — Settings form with per-field save-on-blur

- **Action:**
  - `apps/web/app/admin/settings/page.tsx` — server-fetches `settings.list`; passes initial values to `<SettingsForm />`.
  - `apps/web/components/SettingsForm.tsx` — one `<Field>` per MVP key (5 total). Each field:
    - Has the appropriate input type (`email` for the three recipient fields; plain `text` for the timezone + display name).
    - Validates on blur using the same Zod schemas from `SETTING_VALIDATORS` (DESIGN-003 §4.6). Invalid input → shows the field-level error and does NOT call `settings.set`.
    - Valid input → calls `trpc.settings.set.useMutation({ key, value })`; on success, shows a brief toast "Saved." per PRD-007 §6 UX rule.
  - No "Save changes" button per the same UX rule.
- **Verification:** AC-08 (edit + save → DB row updated with new `updatedBy` and `updatedAt`); AC-09 (invalid email → rejection + existing value unchanged).

### Step 5 — Audit log entry point + per-job timeline

- **Action:**
  - `apps/web/app/admin/audit-log/page.tsx` — a server component with a search input "Job ID:" + a submit button. On submit, server-side navigate to `/admin/jobs/<jobId>` (or use a small client component for the form interactivity).
  - `apps/web/app/admin/jobs/[jobId]/page.tsx` — server-fetches the job via `jobs.getById` and the history via `jobs.getHistory`. Renders `<JobDetailView job={...} viewer={admin-context} />` (so an Admin sees all role-conditional controls — already supported by the JobDetailView extensions in PLAN-010) AND below it `<AuditLogTable transitions={history} />`.
  - `apps/web/components/AuditLogTable.tsx` — chronological table; columns: chapter-local timestamp (UTC ISO in `<time datetime>` for tooltip / screen readers), state transition, actor (display name + role, or "system"), note.
- **Verification:** AC-07 — a seeded job with 7 transitions shows all 7 rows in chronological order with the expected actor labels + notes.

### Step 6 — Users sub-route shell

- **Action:**
  - `apps/web/app/admin/users/page.tsx` — placeholder server component that renders `<div>Users list — implemented in PLAN-012</div>`. Inherits Admin gate from the parent layout (Step 1).
- **Verification:** Admin can hit `/admin/users` and sees the placeholder (PLAN-012 will replace this). Non-Admin sees the same redirect / Forbidden as other `/admin/*` routes.

### Step 7 — Commit

- **Action:** commit per Outputs.
- **Verification:** `git log -1` shows the commit; `pnpm --filter web build` succeeds.

## 5. Verification (end-to-end)

- [ ] VALIDATION-011 passes — every PRD-007 AC has a passing Playwright spec; the dispute-resolve flow (PRD-006 R-08..R-10 from the Admin side) is exercised end-to-end.
- [ ] `pnpm --filter web typecheck && build` succeed.
- [ ] Manual click-through: as Admin, open `/admin` → see Dashboard counts → click `payment_sent` card → see filtered list; navigate to Disputes → resolve a disputed job as "closed" with a resolution note → the row disappears, the job's state becomes `closed`, the audit log on `/admin/jobs/<id>` shows the resolution row; edit `treasurer_recipient_email` on `/admin/settings` → "Saved." toast → DB row updated.
- [ ] One commit on the current branch.

## 6. Out of scope

- The Users list + role-grant components — PLAN-012 owns them; this plan only owns the `/admin/users` route shell.
- The `MinAdminErrorBanner` — PLAN-012 owns this since it's the UI for the min-Admin invariant which is a role-management concern.
- Real-time / polling badges (the disputes count refreshes on page navigation, not every N seconds — DESIGN-006 Q-DSG-03 leans "on page load + after any mutation"; revisit post-MVP).
- Charts / visualisations — PRD-007 §7.1 non-goal.
- Bulk-edit / import settings — PRD-007 §7.1 non-goal.
- Audit-log search by actor / note text — PRD-007 §7.1 non-goal (find-by-job-ID is the only search affordance).

## 7. Risks & gotchas

- **Risk:** The disputes count badge in the layout requires fetching on every page render. **Mitigation:** at MVP scale (chapter-wide queries return < 100 rows) this is fine; cache via Next.js `cache()` if it becomes hot.
- **Risk:** The age-of-dispute computation needs the timestamp of the latest `to_state: disputed` transition. **Mitigation:** either (a) extend `admin.listDisputed` to project this from `job_state_transitions` in the same query, or (b) the row component fetches `jobs.getHistory` lazily — option (a) is one extra `LEFT JOIN LATERAL` against `job_state_transitions` indexed on the partial-index from DESIGN-001 §4.6.
- **Risk:** `SettingsForm` save-on-blur may fire on rapid Tab navigation. **Mitigation:** debounce by ~200ms; cancel pending blur-save if the user re-focuses the field within the debounce window.
- **Risk:** The `/jobs?state=<state>` filter on PLAN-006's jobs page may not yet honour the query param (PLAN-006's `/jobs` is role-aware but may not parse query params). **Mitigation:** extend `apps/web/app/jobs/page.tsx` here to read the query param; small change.

## 8. Resume points

- After Step 1: Admin shell + role gate.
- After Step 2: Dashboard renders.
- After Step 3: Disputes drill-in + resolution actions work.
- After Step 4: Settings save-on-blur works.
- After Step 5: Audit log timeline renders.
- After Step 6: Users shell present.
- After Step 7: committed.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Should `/admin/jobs/<jobId>` page combine `<JobDetailView>` + `<AuditLogTable>` OR be audit-log only with a "Open job" link to `/jobs/<jobId>`? Lean: **combine** — Admin needs both context and history in one view. | Implement combined; revisit if the page becomes overwhelming. |
| Q-PLN-02 | Disputes nav badge: include or exclude jobs an Admin has already "resolved as payment-sent" (false-alarm) that have re-disputed? Lean: **include** — they're back in `disputed` state and need attention again. The query is just `state = 'disputed'`. | No special handling needed. |
| Q-PLN-03 | "Longest-stalled job" stat on the Dashboard (PRD-007 Q-05 lean yes) — include in this plan or defer? Lean: **defer** to a small follow-up plan if launch-chapter Admin asks for it. | Out of scope here; flag for post-PLAN-011 follow-up. |
| Q-PLN-04 | Settings field for `moderators_recipient_email` — should it have a helper text "This is where new-posting notifications go (PRD-002 R-12)" so the Admin knows? Lean: **yes** — short helper text under each field, also matches the chapter-display-name's intent. | Add helper text to each field in Step 4. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft from plan-decomposition pass. 7 steps to land the full `/admin/*` route tree minus the Users list (which PLAN-012 lands). Wires PLAN-005's admin/settings/disputes-resolve procedures into the UI per PRD-007 + DESIGN-006. Paired with VALIDATION-011. |
