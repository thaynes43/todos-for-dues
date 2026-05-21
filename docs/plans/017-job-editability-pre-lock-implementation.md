---
id: PLAN-017
title: Job editability before lock — implementation
status: Proposed
author: Coordinator
created: 2026-05-20
last_updated: 2026-05-20
related:
  prds: [PRD-011]
  adrs: [ADR-003, ADR-004, ADR-005, ADR-008, ADR-009]
  designs: [designs/002-fsm-module.md, designs/006-ui-components.md]
  plans:
    prerequisite: [016]
    paired_validation: 017-job-editability-pre-lock-validation
---

## 1. Goal

Implement PRD-011 (job editability before lock) end-to-end: new `EditJob` command + tRPC procedure + audit table + UI form + re-moderation rule + notification emails.

**Success:** an Alumni can edit a posted job's content fields while the job is in `awaiting_moderation` / `approved` / `enrollment_open`; material edits trigger re-moderation (job → `awaiting_moderation`) + moderator-queue email with `[Re-review]` prefix + per-enrolled-Active notification email; cosmetic edits stay in state; every edit writes a `job_content_changes` audit row.

## 2. Inputs

### 2.1 Documents the agent must read first

1. `docs/prds/011-job-editability-pre-lock.md` — the PRD. **All R-NN + AC-NN.**
2. `docs/prds/010-job-content-enrichment.md` — depends on PRD-010's fields existing in the schema (PLAN-016 must merge first).
3. `docs/adrs/008-job-state-machine.md` — the FSM. PLAN-017 adds new transitions `approved → awaiting_moderation` and `enrollment_open → awaiting_moderation` per PRD-011 Q-02 lean. **An ADR-008 addendum is required** (per coordinator profile: new transitions are an ADR-008 change). PLAN-017 §3 Track A includes the addendum.
4. `docs/adrs/009-audit-log-schema-and-retention.md` — audit pattern. New `job_content_changes` table follows the pattern.
5. `packages/domain/src/job-state-machine.ts` — `JOB_TRANSITIONS` map. Add the new arrows.
6. `packages/domain/src/transitions.ts` (or similar) — `transitionJob` helper. The new `EditJob` command + `demote-on-edit` may need a new helper `editJobWithDemoteCheck`.
7. `packages/db/src/schema/` — add `job_content_changes` table schema.
8. `packages/api/src/routers/jobs.ts` — add `jobs.edit` procedure.
9. `apps/web/components/JobDetailView.tsx` — add "Edit job" affordance gated on R-01 conditions.
10. New component `apps/web/components/EditJobForm.tsx` — the modal/inline form for editing.
11. `packages/notifications/src/templates/` — add re-review email template (or repurpose the existing moderator-queue template with a subject variant); add per-Active edit-notification template.

### 2.2 Repo state assumed

- PLAN-016 merged; new PRD-010 fields exist in schema + UI.
- v0.8.x (or whatever PLAN-016's release becomes).
- MVP-FIX-A `router.refresh()` invariant intact.

## 3. Outputs

### Track A — Domain + ADR-008 addendum

- **`docs/adrs/008-job-state-machine.md` addendum:** new transitions `approved → awaiting_moderation` (cmd: `MaterialEditJob`) and `enrollment_open → awaiting_moderation` (cmd: `MaterialEditJob`). Append a changelog entry; keep status `Accepted`.
- `packages/domain/src/job-state-machine.ts`: extend `JOB_TRANSITIONS` map with the new arrows.
- `packages/domain/src/transitions.ts`: new helper `editJob(jobId, edits, opts)` that:
  - Takes a whitelist of editable fields per PRD-011 R-03.
  - Reads the current job row (within the transaction).
  - Determines whether the edit is material (R-05) or cosmetic (R-06).
  - Writes the field updates via UPDATE (with the FSM-only invariant: any state change goes through `transitionJob`).
  - If material, calls `transitionJob` with `MaterialEditJob` command to demote → `awaiting_moderation`; writes the state-transition row.
  - Writes a `job_content_changes` audit row with the diff (before/after JSON).
  - All inside a single DB transaction (atomicity).
- Add test `packages/domain/__tests__/edit-job.test.ts` covering material vs. cosmetic edits, valid-vs-invalid state, audit row shape.

### Track B — Schema

- New migration `packages/db/migrations/00XX_job_content_changes.sql`:
  ```sql
  CREATE TABLE job_content_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    diff JSONB NOT NULL,
    state_at_edit TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX idx_job_content_changes_job_id ON job_content_changes(job_id, created_at DESC);
  ```
- Update `packages/db/src/schema/` (a new file `jobContentChanges.ts` matching the existing per-table pattern).

### Track C — tRPC procedure

- `packages/api/src/routers/jobs.ts`: new procedure `edit` (input: `{ jobId, edits: <whitelist of editable fields> }`; output: the updated job).
- Input Zod: `pick()` from the existing `post` input shape (matching PRD-011 R-03 whitelist) + `jobId`.
- RBAC: poster-only (`jobPosterProcedure`); Admin acting-as is allowed via the existing admin-acts-as helper.
- Calls the domain `editJob` helper inside `db.transaction(...)`.
- On material edit: triggers `sendModeratorQueueEmail` with `subjectPrefix: '[Re-review]'` + sends `sendEditNotificationToActives` for every enrolled Active.
- Returns the updated job (which the client uses to render immediately, plus `router.refresh()` for server components).

### Track D — UI

- `EditJobForm.tsx`: modal or inline form. Pre-populates with current job values. Submits to `jobs.edit`. On success: `utils.jobs.getById.invalidate()` + `utils.jobs.listX.invalidate()` for relevant lists + `router.refresh()`.
- `JobDetailView.tsx`: add "Edit job" button next to Cancel; visible only for poster in editable states (R-01); hidden otherwise (R-02). Opens `EditJobForm`.
- Surface re-moderation transition: when an edit demotes the job, the UI shows a banner / toast "Your edit will be re-reviewed before being visible to others."
- Surface validation errors inline (same pattern as PRD-010).

### Track E — Notifications

- Update / extend `packages/notifications/src/send-email.ts`:
  - `sendModeratorQueueEmail(...args, opts: { subjectPrefix?: string })` — if `subjectPrefix` is set, prepend to the subject.
  - New `sendEditNotificationToActives({ job, edits, enrolledActives })` — one email per Active summarizing what changed (per PRD-011 R-10).

### Track F — Playwright e2e

- New spec `apps/web/e2e/mvp/edit-job.spec.ts`:
  - AC-01: edit in `awaiting_moderation` → field updates, audit row written, state unchanged.
  - AC-02: try-to-edit `locked` job → no UI affordance; direct tRPC call returns `JOB_NOT_EDITABLE_IN_STATE`.
  - AC-03: material edit in `enrollment_open` with enrollees → demoted to `awaiting_moderation`; enrollees stay enrolled.
  - AC-04: cosmetic-only edit (notes only) → state unchanged; no state-transition audit row.
  - AC-05: material edit triggers `[Re-review]` email subject (verify via Resend Vitest seam).
  - AC-06: enrolled Actives receive edit-notification email.
  - AC-07: rejected edit (non-whitelisted field in input) → Zod error.
- **CRITICAL stale-page test:** in `edit-job.spec.ts`, after a successful edit, assert the new value appears WITHOUT manual refresh (verifies the `router.refresh()` + invalidate pattern).

## 4. Steps

### Step 0 — Branch off latest `origin/main` (after PLAN-016 merges)

```sh
git fetch origin main && git checkout main && git pull --ff-only origin main
git checkout -b plan-017-job-editability-pre-lock
```

### Step 1 — ADR-008 addendum + JOB_TRANSITIONS update

1. Append addendum to `docs/adrs/008-job-state-machine.md` documenting the new transitions.
2. Update `packages/domain/src/job-state-machine.ts` `JOB_TRANSITIONS` map.
3. `pnpm --filter @app/domain test` — passes (existing transition tests still hold; new arrows added).

### Step 2 — Schema migration

1. Add `packages/db/src/schema/jobContentChanges.ts`.
2. `pnpm --filter @app/db generate` — generates migration; inspect; hand-edit if needed.
3. `pnpm --filter @app/db migrate` against local DB; verify table exists.

### Step 3 — Domain helper

1. Implement `editJob` in `packages/domain/src/transitions.ts`.
2. Add `packages/domain/__tests__/edit-job.test.ts`.
3. `pnpm --filter @app/domain test` — passes.
4. `pnpm --filter @app/domain test no-direct-state-writes` — passes (the new helper goes through the FSM for state change, direct UPDATE for content-only via `db.transaction`).

### Step 4 — tRPC procedure

1. Implement `jobs.edit`.
2. Wire `sendModeratorQueueEmail` with subject prefix + new `sendEditNotificationToActives`.
3. `pnpm --filter @app/api test` — passes.

### Step 5 — UI

1. Build `EditJobForm.tsx`.
2. Wire `JobDetailView.tsx` Edit button.
3. `pnpm --filter web build` (without DATABASE_URL) — passes.

### Step 6 — Playwright e2e (TDD-style)

1. Write the new spec; run against current branch state with UI fix landed — passes.
2. Run `pnpm --filter web e2e` **3× consecutively** under DEFAULT workers — all green.

### Step 7 — Cross-plan invariants

(Same checklist as PLAN-016 §3 Track D / VALIDATION-016 §4.)

### Step 8 — Commit + push + open PR

PR title: `feat(web): job editability before lock (PRD-011) — EditJob command + re-moderation + diff audit`. `feat:` → minor bump.

### Step 9 — GATE 1 — STOP

## 5. Verification (end-to-end)

- [ ] VALIDATION-017 passes — every AC mapping green.
- [ ] All PRD-011 R-NN are wired.
- [ ] ADR-008 addendum committed; transitions map matches.
- [ ] Migration applies cleanly; new table exists; index in place.
- [ ] Cross-plan invariants all green.
- [ ] **Stale-page assertion** in `edit-job.spec.ts` passes (proves `router.refresh()` works for the new mutation).

## 6. Out of scope

- **Editing locked / completed / payment_sent / etc.** Hard-coded out per PRD-011 R-02.
- **Edits surfaced as real-time updates to OTHER browsers.** Owned by PLAN-018 (PRD-012); the actor's own browser updates via `router.refresh()` from this plan.
- **Diff visualization in moderation queue UI (PRD-011 R-09).** P1 in PRD-011 §9; defer to a follow-up if time-budget tight. Or include if cheap.
- **Per-instance "skip re-moderation within N minutes of posting" setting (PRD-011 Q-05).** Lean no; out of scope.

## 7. Risks & gotchas

### Risk 1 — `no-direct-state-writes` invariant must stay green

PLAN-003's static-analysis test scans for direct UPDATEs to state fields outside the FSM module. The `editJob` helper writes content fields via UPDATE (allowed); state changes via `transitionJob` (required). Make sure the diff scans clean.

### Risk 2 — Audit row atomicity

The content UPDATE + the audit INSERT + (if material) the state-transition row + transition audit must all happen in ONE transaction. If any fails, all roll back. The `db.transaction(...)` block is the right shape.

### Risk 3 — Cross-Active enrollment notification spam

If a job has 10 enrolled Actives and the Alumni makes 5 material edits in a row, that's 50 emails. PRD-011 R-10 is P1; ship with throttling OR rate-limit at the Resend layer OR debounce via a 5-min window. Lean: keep simple for MVP (1 email per material edit per Active); add throttling only if observed problem.

### Risk 4 — UI test for "no manual refresh"

The Playwright assertion must explicitly NOT call `page.reload()` between mutation and assertion. Use `expect.poll(...)` or `expect(...).toBeVisible({ timeout: 5_000 })` on the post-edit element. This is the standing MVP-FIX-A lesson.

### Risk 5 — Re-moderation triggers re-fire of moderator-queue email

Make sure re-moderation does NOT re-fire the original "new posting" email — that's confusing. Use `subjectPrefix: '[Re-review]'` exclusively for the re-moderation path.

## 8. Resume points

- After Step 0: branch.
- After Step 1: FSM map updated + ADR-008 addendum.
- After Step 2: migration applied.
- After Step 3: domain helper + tests.
- After Step 4: tRPC procedure.
- After Step 5: UI.
- After Step 6: e2e.
- After Step 7: invariants.
- After Step 8: PR.
- After Step 9: Gate 1.

## 9. Open questions

| ID | Question | Lean |
|----|----------|------|
| Q-PLN-01 | Material vs. cosmetic fields list — match PRD-011 R-05 exactly? | Yes, exactly. |
| Q-PLN-02 | Re-moderation email subject — `[Re-review]` prefix only, or include diff inline? Lean: prefix only; link to queue. | Prefix only. |
| Q-PLN-03 | EditJobForm modal vs. inline edit? Lean: modal (clearer separation; matches existing CancelJobModal pattern). | Modal. |
| Q-PLN-04 | Should the audit `diff` JSON include unchanged fields too, or only changed fields? Lean: only changed (smaller; faster to render). | Changed only. |
| Q-PLN-05 | Enrolled-Active notification: include the diff in the email body or just "a job you're enrolled in changed — see app"? Lean: include the diff (more useful). | Include diff. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-20 | Coordinator | Initial Proposed. Depends on PLAN-016. |
