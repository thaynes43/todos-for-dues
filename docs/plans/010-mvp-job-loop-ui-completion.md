---
id: PLAN-010
title: MVP job-loop UI completion — rejection, reschedule, cancel, unenroll, revert, dispute, lists
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: L
related:
  prds: [PRD-002, PRD-004, PRD-005, PRD-006]
  adrs: [ADR-001]
  bounded_contexts: [BCC-02]
  aggregates: [ADC-01]
  designs: [DESIGN-006]
  plans:
    prerequisite: [PLAN-005, PLAN-006, PLAN-007]
    lateral: [VALIDATION-010]
  parent_plan: null
  supersedes: null
---

## 1. Goal

Build out every job-loop UI surface DESIGN-006 names but PLAN-006 explicitly deferred to "MVP follow-up." Specifically: the rejection flow (Moderator side + posting-Alumni read-back), Alumni-side reschedule + cancel + revert-completion, Active-side unenroll + dispute + completed-job credit display, and the two role-scoped list pages (my-postings, my-enrollments). All other MVP UI scope is owned elsewhere: Admin view in PLAN-011, role-management UI in PLAN-012, settings UI in PLAN-011.

**Why a new plan rather than extending PLAN-006:** PLAN-006 is intentionally walking-skeleton-only per DESIGN-006 §4.2 — the happy-path slice that proves the architecture. Stretching it to MVP scope would mute that signal and bundle a ~3× larger change into one PR. Splitting also lets the Admin / role-mgmt UI lands in parallel without coupling.

> **Produces:** the remaining job-loop UI components and routes from DESIGN-006 §3 that PLAN-006 deferred, wired to the tRPC procedures already implemented in PLAN-005 and notification helpers already implemented in PLAN-007.
> **Definition of success:** VALIDATION-010 passes — every PRD-002/004/005/006 AC that wasn't covered by PLAN-008's happy-path E2E is exercised by a passing Playwright spec against `pnpm dev` running this build.

## 2. Inputs

### 2.1 Documents the agent must read first

1. `docs/designs/006-ui-components.md` §3 (folder layout), §4.3 (key component sketches), §4.6 (`stateDisplayName`), §4.7 (date display), §4.8 (TippingNudge) — DESIGN-006 is the contract for everything in this plan.
2. `docs/prds/002-job-posting-and-moderation.md` §5 R-08, R-09, R-10, R-11 + corresponding ACs (rejection flow).
3. `docs/prds/004-enrollment-lock-reschedule.md` §5 R-03, R-04, R-06, R-10, R-11 + corresponding ACs (unenroll, my-enrollments, reschedule, cancel).
4. `docs/prds/005-completion-and-payment-sent.md` §5 R-05 + AC-06 (revert-completion); §6 UX rule "Active-side view of a `completed` or `payment-sent` job."
5. `docs/prds/006-loop-closure-and-dispute.md` §5 R-05, R-06 + AC-05, AC-06 (dispute UI — Active-side); §6 "Active-side view of a `disputed` job."
6. `docs/designs/003-trpc-api-surface.md` §4.4 — the procedures these UI components call (already implemented in PLAN-005).

### 2.2 Repo state assumed

- PLAN-005 complete: every tRPC procedure exists and integration-tested (`jobs.reject`, `jobs.unenroll`, `jobs.reschedule`, `jobs.cancel`, `jobs.revertCompletion`, `jobs.dispute`, `jobs.listMyPosted`, `jobs.listMyEnrolled`).
- PLAN-006 complete: walking-skeleton UI exists; root layout, ChapterHeader, RoleAwareNav, JobDetailView, JobStateBadge, EnrollButton, LockJobForm, CompleteJobForm, MarkPaymentSentButton, ConfirmReceivedButton are all in place. The components added by this plan extend or sit alongside those.
- PLAN-007 complete: notifications adapter + helpers exist (no UI dependency here — the Alumni-rejection email per PRD-002 fires automatically from the `reject` procedure's `afterCommit`).

### 2.3 External dependencies

- Same as PLAN-006: `pnpm dev`, Postgres reachable.

## 3. Outputs

After this plan completes, the following files exist (or are extended) per DESIGN-006 §3:

- `apps/web/components/UnenrollButton.tsx` — Active-only; visible when enrolled + state is `enrollment_open`. Calls `jobs.unenroll`. (PLAN-006 marks this as optional walking-skeleton scope; build it now.)
- `apps/web/components/RescheduleButton.tsx` — Alumni-poster; visible when state is `locked`. Calls `jobs.reschedule`. Modal confirmation showing "Existing enrollments will be preserved" per PRD-004 §6.
- `apps/web/components/CancelJobModal.tsx` — Alumni-poster; visible when state is `enrollment_open` or `locked`. Modal with `<textarea>` for reason; calls `jobs.cancel`.
- `apps/web/components/RevertCompletionButton.tsx` — Alumni-poster; visible when state is `completed`. Calls `jobs.revertCompletion`. Plain button with `<ConfirmDialog>` since the action clears the confirmed-attendees list.
- `apps/web/components/DisputeJobModal.tsx` — Active (enrolled) OR Admin; visible when state is `payment_sent`. Modal with `<textarea>` for reason (submit disabled until non-empty); calls `jobs.dispute`.
- `apps/web/components/ApproveRejectButtons.tsx` — **extended**: PLAN-006 implemented only the Approve action. This plan adds the Reject sibling button with a rejection-reason modal (textarea; submit disabled until non-empty); calls `jobs.reject`.
- `apps/web/components/RejectedJobBanner.tsx` (or render-inside-JobDetailView) — read-only display of `job.rejectionReason` when state is `rejected` per PRD-002 R-09 / AC-12 and the §6 UX rule on the rejected-posting view. Includes a "Post a new job" CTA linking to `/jobs/new` (blank form per PRD-002 Q-01 / §7.1 non-goal).
- `apps/web/components/CancelledJobBanner.tsx` — read-only display of `job.cancellationReason` when state is `cancelled` per PRD-004 R-11 §6 ("Reason is shown to enrolled Actives on the job's detail view").
- `apps/web/components/DisputedJobBanner.tsx` — Active-side view of a `disputed` job showing "This job is disputed. An Admin is reviewing." per PRD-006 §6.
- `apps/web/components/ClosedJobBanner.tsx` — Active-side view of a `closed` job showing "Loop closed. Closed by [Active or Admin name]." per PRD-006 §6.
- `apps/web/components/CompletedJobActiveView.tsx` — Active-side view of a `completed` or `payment_sent` job showing: own confirmed-attendee status, own per-Active dues credit, and "Look for this credit in the chapter dues books" message per PRD-005 §6.
- `apps/web/app/jobs/[jobId]/page.tsx` — **extended**: PLAN-006 wired the happy-path controls; this plan extends `JobDetailView` to render the new components conditional on state + viewer (per DESIGN-006 §4.3's existing role-conditional pattern).
- `apps/web/app/my-postings/page.tsx` — new route; Alumni list view per PRD-002 R-11. Calls `jobs.listMyPosted`. Most-recent-first; shows state badge for each row; includes rejected jobs so the Alumni can revisit the rejection reason (per AC-14).
- `apps/web/app/my-enrollments/page.tsx` — new route; Active list view per PRD-004 R-06. Calls `jobs.listMyEnrolled`. Ordered by work date when locked else by enrollment time (oldest-first).
- `apps/web/components/RoleAwareNav.tsx` — **extended**: add links to `/my-postings` (Alumni / Mod / Admin) and `/my-enrollments` (Active).
- One git commit: `feat(web): MVP job-loop UI completion — rejection / reschedule / cancel / unenroll / revert / dispute / list views per DESIGN-006`.

## 4. Steps

### Step 1 — Extend ApproveRejectButtons + rejection-reason modal

- **Action:**
  - In `apps/web/components/ApproveRejectButtons.tsx`, add a sibling `<RejectButton>` that opens a modal containing a labelled `<textarea>` for the rejection reason. Submit is disabled until the reason has ≥1 non-whitespace character (matches the server-side rule from PRD-002 R-08 + AC-11). Calls `trpc.jobs.reject.useMutation()` with `{ jobId, reason }`.
  - On success, dismiss the modal and let React Query invalidate `jobs.listModerationQueue`.
- **Verification:** Moderator clicks reject → modal opens → submits with empty reason → submit button stays disabled; submits with a reason → modal closes; the job disappears from the moderation queue; the job's state is now `rejected` (verify via direct DB or the my-postings route after Step 5).
- **Resume note:** ApproveRejectButtons now offers both actions; rejection writes the audit-log row via PLAN-005's `jobs.reject` calling `transitionJob` with `note=reason`.

### Step 2 — Build the read-only state banners (Rejected / Cancelled / Disputed / Closed)

- **Action:**
  - `RejectedJobBanner.tsx` — fetches the job's `rejectionReason` (already on the Job object returned by `jobs.getById`); displays it prominently with a "Post a new job →" CTA linking to `/jobs/new` (no pre-fill — PRD-002 §7.1 non-goal).
  - `CancelledJobBanner.tsx` — displays `cancellationReason`.
  - `DisputedJobBanner.tsx` — static "This job is disputed. An Admin is reviewing." text. Admin-resolution affordances are NOT here (those live in PLAN-011's `/admin/disputes` per PRD-007 R-05).
  - `ClosedJobBanner.tsx` — fetches the last `job_state_transitions` row's actor display name (`closed_by`) from the `jobs.getById` query result (extend the query to include this if not already exposed) or via a derived helper.
- **Verification:** unit/component tests render each banner with sample props; the rendered HTML contains the expected text + CTAs.
- **Resume note:** all four state banners exist; they're imported by `JobDetailView` in Step 6.

### Step 3 — Build the Alumni-poster post-approval action components

- **Action:**
  - `RescheduleButton.tsx` — calls `trpc.jobs.reschedule.useMutation({ jobId })`. Click opens a `<ConfirmDialog>`: "Reschedule this job? Existing enrollments stay on the roster — Actives can self-unenroll if the new date won't work for them. (You'll pick a new date by locking again.)" Per PRD-004 §6 UX rule on reschedule messaging.
  - `CancelJobModal.tsx` — modal with `<textarea>` for cancellation reason (submit disabled until ≥1 non-whitespace char per PRD-004 R-11 + AC-14); calls `trpc.jobs.cancel.useMutation({ jobId, reason })`. The procedure handles the `enrollment_open`-or-`locked` source-state selection internally (DESIGN-003 §4.4).
  - `RevertCompletionButton.tsx` — click opens a `<ConfirmDialog>`: "Revert completion? This clears the confirmed-attendees list — you'll need to re-confirm before marking payment-sent." (Per PRD-005 R-05 + §6 UX rule.) Calls `trpc.jobs.revertCompletion.useMutation({ jobId })`.
- **Verification:** unit tests for each component covering: (a) the disabled-while-pending button state; (b) error display when the mutation rejects (e.g., 409 CONFLICT on concurrent state change → toast per DESIGN-006 §7); (c) success path triggers `router.refresh()` or React Query invalidation.
- **Resume note:** all three Alumni-poster controls exist; wired into `JobDetailView` in Step 6.

### Step 4 — Build UnenrollButton + DisputeJobModal + CompletedJobActiveView

- **Action:**
  - `UnenrollButton.tsx` — Active-only; calls `trpc.jobs.unenroll.useMutation({ jobId })`. Plain button (no confirmation modal — PRD-004 §6 UX rule "Enroll/unenroll are one-click actions"). Disabled when state is not `enrollment_open`.
  - `DisputeJobModal.tsx` — modal with `<textarea>` for dispute reason (submit disabled until ≥1 non-whitespace char per PRD-006 R-05 + AC-06); calls `trpc.jobs.dispute.useMutation({ jobId, reason })`. Per PRD-006 §6 "Dispute requires a reason — a modal with a `<textarea>` for the reason."
  - `CompletedJobActiveView.tsx` — for the viewing Active, looks up their own row in the job's `confirmedAttendees`/`perActiveDuesCredit` (extend `jobs.getById` to return the viewing Active's confirmed-status + their credit amount if state is `completed` / `payment_sent` / `closed`). Displays: "Your dues credit: $XX.XX — look for this in the chapter dues books." Per PRD-005 §6 UX rule on Active-side completed-view.
- **Verification:** unit tests for each component; integration test that `CompletedJobActiveView` correctly extracts the viewing Active's credit from the job payload.
- **Resume note:** Active-side post-completion components exist.

### Step 5 — Build the two role-scoped list routes

- **Action:**
  - `apps/web/app/my-postings/page.tsx` — server component that fetches via `trpc.jobs.listMyPosted` (Alumni-only — server-side redirects non-Alumni to `/`). Renders a table or card list: description (truncated), state badge (via `stateDisplayName`), created-at, and a link to the job's detail page. Most-recent-first. Includes rejected jobs (per PRD-002 R-11 + AC-14).
  - `apps/web/app/my-enrollments/page.tsx` — server component that fetches via `trpc.jobs.listMyEnrolled` (Active-only — server-side redirects non-Active to `/`). Renders the same shape but ordered by `work_date` (when locked) else by enrollment time, oldest-first. Per PRD-004 R-06.
- **Verification:** server-side role gate works (signed-out → `/login`; wrong role → 403 page or redirect). The list view renders the expected rows for a seeded DB.
- **Resume note:** both list routes exist and are role-gated.

### Step 6 — Extend JobDetailView to render the new conditional sections

- **Action:** in `apps/web/components/JobDetailView.tsx`, extend the existing role-conditional block per DESIGN-006 §4.3:
  - When `job.state === 'rejected'` → render `<RejectedJobBanner reason={job.rejectionReason} canPostNew={viewer.role === 'Alumni' || isMod} />`. Suppress all other action affordances.
  - When `job.state === 'cancelled'` → render `<CancelledJobBanner reason={job.cancellationReason} />`. Suppress all other action affordances.
  - When `job.state === 'disputed'` AND viewer is NOT Admin → render `<DisputedJobBanner />`. (Admin sees the resolve-dispute modal — that affordance lives in PLAN-011's `/admin/disputes` per DESIGN-006 §4.3 + PRD-007 R-05.)
  - When `job.state === 'closed'` → render `<ClosedJobBanner closedByDisplayName={...} />`.
  - When viewer is the posting Alumni AND state is `enrollment_open` → in addition to the existing `<LockJobForm />`, render `<CancelJobModal />`.
  - When viewer is the posting Alumni AND state is `locked` → in addition to existing `<CompleteJobForm />`, render `<RescheduleButton />` AND `<CancelJobModal />`.
  - When viewer is the posting Alumni AND state is `completed` → in addition to existing `<MarkPaymentSentButton />`, render `<RevertCompletionButton />`.
  - When viewer is an enrolled Active AND state is `enrollment_open` → render `<UnenrollButton />` alongside existing controls.
  - When viewer is an enrolled Active OR an Admin AND state is `payment_sent` → in addition to existing `<ConfirmReceivedButton />`, render `<DisputeJobModal />`.
  - When viewer is an enrolled Active AND state is in `{completed, payment_sent, closed}` → render `<CompletedJobActiveView job={job} />`.
- **Verification:** snapshot tests for the most-frequent state/viewer combinations: posting-Alumni viewing `enrollment_open` shows lock + cancel; Active viewing `payment_sent` shows confirm + dispute; Active viewing `rejected` shows the rejection banner with no action affordances.
- **Resume note:** JobDetailView now covers all MVP states + viewers; PLAN-006's happy-path subset remains a strict subset of this fuller surface.

### Step 7 — Extend RoleAwareNav with the new list links

- **Action:** in `apps/web/components/RoleAwareNav.tsx`, add nav links:
  - "My postings" → `/my-postings` (visible to Alumni / Moderator / Admin per the `alumniProcedure` capability inclusion from DESIGN-003 §4.2)
  - "My enrollments" → `/my-enrollments` (visible to Active only)
- **Verification:** nav rendered with the appropriate role shows the new links; other roles do not see them.

### Step 8 — Commit

- **Action:** commit per Outputs.
- **Verification:** `git log -1` shows the commit; `pnpm --filter web build` succeeds.

## 5. Verification (end-to-end)

- [ ] VALIDATION-010 passes — every PRD-002/004/005/006 AC not covered by PLAN-008 has a passing Playwright spec.
- [ ] `pnpm --filter web typecheck && build` succeed.
- [ ] `pnpm dev` boots; manual click-through covers: Moderator rejects a job → posting Alumni sees the reason on `/my-postings` → opens the job → sees `<RejectedJobBanner>` with the "Post a new job" CTA; Alumni reschedules a locked job → Active sees the job back in `enrollment_open` (still enrolled); Active disputes a `payment_sent` job → the Active-side view shows the `<DisputedJobBanner>` (the Admin-resolve action is verified via PLAN-011).
- [ ] One commit on the current branch.

## 6. Out of scope

- Admin view UI (`/admin/*`) — PLAN-011 owns this; the dispute resolution affordances surfaced from the Admin side, the audit-log timeline, and the settings UI all live there.
- Role-management UI (profile dropdown, Admin Users list, MinAdminErrorBanner) — PLAN-012 owns this.
- Any backend changes — every procedure this UI calls already exists from PLAN-005.
- The Alumni rejection-reason email — PRD-002 §10 release-plan calls it MVP optional; the `afterCommit` hook hook-up is owned by PLAN-007 if/when it lands.
- Notification toast for "someone closed this before you" CONFLICT response — DESIGN-006 §7 spec'd; small enough to land here when the Dispute/Confirm components are built (see VALIDATION-010 §5 acceptance test).

## 7. Risks & gotchas

- **Risk:** `JobDetailView` is becoming the most role-conditional file in the codebase. With the additions from this plan, it's ~200 lines of conditional rendering. **Mitigation:** factor each viewer×state combo into a small sub-component if any one branch grows past ~20 lines. Keep the outer component a dispatcher.
- **Risk:** `jobs.getById` may need to return additional fields (closed-by display name, viewing Active's per-credit amount). **Mitigation:** extend the query response in this plan — small change inside the existing procedure (DESIGN-003 §4.4 left the field projection TBD).
- **Risk:** The "Post a new job" CTA on the `RejectedJobBanner` must NOT pre-fill the form (PRD-002 Q-01). **Mitigation:** plain `<Link href="/jobs/new">` with no query params; the post-job form starts empty.
- **Risk:** Dispute-modal submit is disabled until reason is non-empty — must match server-side EARS rule (PRD-006 R-05). **Mitigation:** client-side check is `value.trim().length >= 1`; server-side check is the same.

## 8. Resume points

- After Step 1: rejection action wired end-to-end through the UI.
- After Step 2: read-only state banners exist.
- After Step 3: Alumni-poster post-approval controls exist.
- After Step 4: Active-side dispute + unenroll + completed-view exist.
- After Step 5: both role-scoped list routes work.
- After Step 6: JobDetailView renders all MVP state×viewer combinations.
- After Step 7: nav exposes the list routes.
- After Step 8: committed.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Should `<CompletedJobActiveView>` show the credit amount for non-attendee enrolled Actives (who signed up but weren't confirmed)? PRD-005 doesn't explicitly say. Lean: **no** — show "You weren't confirmed for this job; no dues credit recorded" if `confirmedAttendee` is null on their row. | Implement the "not confirmed" message; flag for product confirmation. |
| Q-PLN-02 | The dispute-resolve actions for Admin viewers — should `JobDetailView` show them inline on `/jobs/[jobId]` when an Admin views a disputed job, OR only on `/admin/disputes`? **Lean: only on `/admin/disputes`** (PRD-007 R-05 + DESIGN-006 §4.3 both surface the resolve actions in the Admin view, not in the public job detail). | This plan does NOT add resolve actions to `/jobs/[jobId]`; PLAN-011 owns them. |
| Q-PLN-03 | Mobile responsiveness of `<CancelJobModal>` and `<DisputeJobModal>` — shadcn's `<Dialog>` on small viewports. Lean: **accept shadcn defaults** for MVP; design polish post-launch. | No action; revisit if launch chapter reports friction. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft from plan-decomposition pass. 8 steps to land the MVP job-loop UI completion — fills the rejection / reschedule / cancel / unenroll / revert / dispute / list-view gaps PLAN-006 explicitly deferred. Paired with VALIDATION-010. |
