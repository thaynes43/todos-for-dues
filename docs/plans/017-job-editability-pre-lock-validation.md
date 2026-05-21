---
id: VALIDATION-017
title: Job editability before lock — validation
status: Proposed
author: Coordinator
created: 2026-05-20
last_updated: 2026-05-20
related:
  prds: [PRD-011]
  plans:
    paired_implementation: 017-job-editability-pre-lock-implementation
---

## 1. Goal

Verify PLAN-017 satisfies every AC in PRD-011, preserves cross-plan invariants, and the new mutation maintains the MVP-FIX-A `router.refresh()` pattern (no new stale-page regression).

## 2. AC → Test mapping

| AC | Where the test lives | What it asserts |
|----|---------------------|-----------------|
| AC-01 | `apps/web/e2e/mvp/edit-job.spec.ts` | Edit `description` in `awaiting_moderation`; job updates; audit row written; state unchanged; **no manual refresh** in spec. |
| AC-02 | same | UI affordance hidden on `locked` job; direct tRPC call returns `JOB_NOT_EDITABLE_IN_STATE`. |
| AC-03 | same | Material edit in `enrollment_open` w/ 2 enrollees → state → `awaiting_moderation`; enrollees stay enrolled. |
| AC-04 | same | Notes-only edit → state unchanged; only content-changes row written, no state-transition row. |
| AC-05 | `apps/web/e2e/mvp/edit-job.spec.ts` + `packages/notifications/__tests__/` | Re-moderation email subject begins with `[Re-review]`. |
| AC-06 | same | Each enrolled Active receives an edit-notification email. |
| AC-07 | `packages/api/__tests__/jobs.test.ts` (or routers test dir) | Zod input rejects non-whitelisted field (`posterId` in payload). |

Domain helper tests:
- `packages/domain/__tests__/edit-job.test.ts` — material vs. cosmetic detection; audit row shape; transaction atomicity (rollback on failure).
- `packages/domain/__tests__/no-direct-state-writes.test.ts` — passes (state changes go through `transitionJob`).

## 3. Cross-plan invariants

- `pnpm -r typecheck` exits 0.
- `pnpm -r test` exits 0; Vitest counts ≥ pre-PR baseline.
- `pnpm --filter @app/domain test no-direct-state-writes` exits 0.
- `unset DATABASE_URL && pnpm --filter web build` exits 0.
- `pnpm --filter web e2e` exits 0 across **3 consecutive runs** under DEFAULT workers.
- ADR-008's `JOB_TRANSITIONS` map matches the addendum (new arrows present).
- `job_content_changes` migration applies on a fresh DB; index `idx_job_content_changes_job_id` exists.
- MVP-FIX-A invariant: `EditJobForm`'s mutation `onSuccess` calls `router.refresh()` AND `invalidate()`. Verify via diff inspection.

## 4. Stale-page-regression check (PRD-011 mentioned in particular)

**The "edit doesn't update the UI without manual refresh" failure mode would be catastrophic — it's the exact bug class MVP-FIX-A closed.** VALIDATION-017 includes an explicit stale-page assertion in `edit-job.spec.ts`:

```ts
test('edit updates UI without manual refresh', async ({ page }) => {
  // setup: post job, view as poster, open edit form
  await editForm.getByTestId('edit-description-input').fill('Updated description');
  await editForm.getByTestId('edit-submit').click();
  // CRITICAL: do not call page.reload()
  await expect(page.getByTestId('job-description')).toHaveText('Updated description', {
    timeout: 5_000,
  });
});
```

If the spec times out without seeing the new value: `router.refresh()` is missing → fail validation.

## 5. Manual checks (if local DB + Resend test endpoint available)

- Post a job in `enrollment_open` → enroll yourself as a second user → edit the dues amount → verify the moderator inbox receives an email with subject `[Re-review] New posting awaits moderation` AND your "Active" inbox receives an edit-notification email.
- Try to edit while in `locked` state via DevTools network panel (manually craft the tRPC call) — verify 4xx response with `JOB_NOT_EDITABLE_IN_STATE`.

## 6. Gates

| Gate | Criterion |
|------|-----------|
| G-1 | Required CI green. |
| G-2 | Advisory `playwright` green. |
| G-3 | 3× consecutive full e2e under DEFAULT workers. |
| G-4 | Every PRD-011 AC has a test mapping. |
| G-5 | Cross-plan invariants green. |
| G-6 | ADR-008 addendum committed; `JOB_TRANSITIONS` map matches. |
| G-7 | Stale-page assertion explicitly present in `edit-job.spec.ts` (per §4). |
| G-8 | Diff inspection: no tRPC procedures outside `jobs.ts` modified; no production code outside the listed scope touched. |

## 7. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-20 | Coordinator | Initial Proposed. |
