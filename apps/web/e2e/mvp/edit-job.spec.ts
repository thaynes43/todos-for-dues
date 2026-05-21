import { test, expect, type Page } from '@playwright/test';
import {
  approveAsMod,
  createPool,
  enrollAsActive,
  installPageerrorListener,
  lockAsAlumni,
  newSuffix,
  postJob,
  pollJobState,
  reAuth,
  seedCast,
} from './support';

// PRD-011 / PLAN-017 — Job editability before lock.
// The CRITICAL stale-page assertion lives in the AC-01 test below: after the
// edit mutation commits, the new value MUST appear without page.reload().
// If that assertion times out, the MVP-FIX-A `router.refresh()` pattern is
// broken on the new edit mutation — surface immediately.

/**
 * Hydration-safe modal open: click the Edit-job button, retry until the modal
 * is actually visible. Mirrors enrollAsActive's retry pattern in support.ts —
 * Next.js dev server's first hit on a client component may have the button
 * rendered server-side before React attached the onClick handler, so the
 * first click silently no-ops.
 */
async function openEditModal(page: Page): Promise<void> {
  const button = page.getByTestId('edit-job-button');
  const modal = page.getByTestId('edit-job-modal');
  await expect(button).toBeVisible();
  await expect
    .poll(
      async () => {
        if (await modal.isVisible().catch(() => false)) return true;
        await button.click({ trial: false }).catch(() => undefined);
        return modal.isVisible().catch(() => false);
      },
      { timeout: 15_000, intervals: [200, 500, 1000] },
    )
    .toBe(true);
}

function assertNoNavigation(page: Page): { check: () => void } {
  const initialUrl = page.url();
  let navigated = false;
  const onFrameNavigated = () => {
    if (page.url() !== initialUrl) navigated = true;
  };
  page.on('framenavigated', onFrameNavigated);
  return {
    check: () => {
      page.off('framenavigated', onFrameNavigated);
      expect(navigated, `Expected no navigation away from ${initialUrl}`).toBe(
        false,
      );
    },
  };
}

test.describe('PRD-011 — edit job before lock', () => {
  test.beforeEach(({ page }) => installPageerrorListener(page));

  // AC-01 + the stale-page invariant (PRD-011 §5 + MVP-FIX-A).
  test('AC-01: poster edits description in awaiting_moderation → state stays; new value visible WITHOUT page.reload()', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      const original = `Clean garage — ${suffix}`;
      const updated = `Clean garage and shed — ${suffix}`;

      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, original);

      // Job is now in awaiting_moderation (PRD-002). Open the detail page.
      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');
      await expect(page.getByTestId('job-description')).toHaveText(original);
      await expect(page.getByTestId('edit-job-button')).toBeVisible();

      // Open the edit modal, change description, submit.
      await openEditModal(page);
      const modal = page.getByTestId('edit-job-modal');
      const descInput = modal.getByTestId('edit-description-input');
      await descInput.fill(updated);
      const submit = modal.getByTestId('edit-submit');
      await expect(submit).toBeEnabled({ timeout: 10_000 });

      const nav = assertNoNavigation(page);
      await submit.click();

      // STALE-PAGE INVARIANT — do NOT call page.reload(). The router.refresh()
      // in EditJobForm.onSuccess must re-render the server component with the
      // new description within the 5s budget.
      await expect(page.getByTestId('job-description')).toHaveText(updated, {
        timeout: 5_000,
      });
      // Modal closed.
      await expect(modal).toHaveCount(0);
      // Job state did NOT change (still awaiting_moderation).
      await expect(page.getByTestId('job-state-badge')).toHaveAttribute(
        'data-state',
        'awaiting_moderation',
      );
      nav.check();

      // Audit-log assertion: exactly one content-change row, no new state-transition row.
      const { rows: contentRows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM job_content_changes WHERE job_id = $1`,
        [jobId],
      );
      expect(contentRows[0]?.count).toBe('1');
      const { rows: stateRows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM job_state_transitions WHERE job_id = $1`,
        [jobId],
      );
      // Exactly one state-transition row: the createJob row (fromState NULL).
      expect(stateRows[0]?.count).toBe('1');
    } finally {
      await pool.end();
    }
  });

  // AC-02: locked job → no edit affordance.
  test('AC-02: locked job has no Edit affordance on the detail page', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, `Lock me — ${suffix}`);
      await approveAsMod(page, context, cast.mod, pool, jobId);
      await enrollAsActive(page, context, cast.active, pool, jobId);
      await lockAsAlumni(page, context, cast.alumni, pool, jobId);

      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');
      await expect(page.getByTestId('job-state-badge')).toHaveAttribute(
        'data-state',
        'locked',
      );
      await expect(page.getByTestId('edit-job-button')).toHaveCount(0);
    } finally {
      await pool.end();
    }
  });

  // AC-03: material edit in enrollment_open demotes job; enrollees stay.
  test('AC-03: material edit in enrollment_open demotes to awaiting_moderation; enrollees preserved', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, `Edit demote — ${suffix}`, '40', '1');
      await approveAsMod(page, context, cast.mod, pool, jobId);
      await enrollAsActive(page, context, cast.active, pool, jobId);

      // Poster opens the job (now enrollment_open) and edits dues — material.
      await reAuth(page, context, cast.alumni);
      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');
      await expect(page.getByTestId('job-state-badge')).toHaveAttribute(
        'data-state',
        'enrollment_open',
      );

      await openEditModal(page);
      const modal = page.getByTestId('edit-job-modal');
      await modal.getByTestId('edit-dues-input').fill('75');
      const submit = modal.getByTestId('edit-submit');
      await expect(submit).toBeEnabled({ timeout: 10_000 });
      await submit.click();

      // Job state demotes back to awaiting_moderation within the refresh budget.
      await expect(page.getByTestId('job-state-badge')).toHaveAttribute(
        'data-state',
        'awaiting_moderation',
        { timeout: 5_000 },
      );
      // Demote banner is shown.
      await expect(page.getByTestId('edit-job-demote-banner')).toBeVisible();

      // Enrollee row preserved in the DB.
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM job_enrollments WHERE job_id = $1`,
        [jobId],
      );
      expect(rows[0]?.count).toBe('1');

      // State-transition row: enrollment_open → awaiting_moderation written by the FSM.
      const { rows: stateRows } = await pool.query<{
        from_state: string | null;
        to_state: string;
      }>(
        `SELECT from_state, to_state FROM job_state_transitions
         WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [jobId],
      );
      expect(stateRows[0]).toMatchObject({
        from_state: 'enrollment_open',
        to_state: 'awaiting_moderation',
      });
    } finally {
      await pool.end();
    }
  });

  // AC-04: notes-only edit stays in state.
  test('AC-04: cosmetic edit (notes-only) in enrollment_open leaves state unchanged', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, `Cosmetic edit — ${suffix}`);
      await approveAsMod(page, context, cast.mod, pool, jobId);

      await reAuth(page, context, cast.alumni);
      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');
      await openEditModal(page);
      const modal = page.getByTestId('edit-job-modal');
      await modal.getByTestId('edit-notes').fill('Gate code: 1234');
      // EditJobForm.hasAnyChange flips the submit button to enabled only after
      // the React state catches up to the form input. Wait for the button to
      // be enabled before clicking — otherwise cold-runner hydration lag can
      // swallow the click silently.
      const submit = modal.getByTestId('edit-submit');
      await expect(submit).toBeEnabled({ timeout: 10_000 });
      await submit.click();

      // Wait for the mutation to commit by polling the audit table directly —
      // more deterministic than racing the React state cycle that closes the
      // modal.
      await expect
        .poll(
          async () => {
            const { rows } = await pool.query<{ count: string }>(
              `SELECT COUNT(*)::text AS count FROM job_content_changes WHERE job_id = $1`,
              [jobId],
            );
            return rows[0]?.count ?? '0';
          },
          { timeout: 10_000 },
        )
        .toBe('1');

      // State should remain enrollment_open (cosmetic-only edit — R-06).
      const state = await pool
        .query<{ state: string }>(`SELECT state FROM jobs WHERE id = $1`, [jobId])
        .then((r) => r.rows[0]?.state);
      expect(state).toBe('enrollment_open');
    } finally {
      await pool.end();
    }
  });

  // AC-05 + AC-06: re-review email subject prefix + per-Active notifications.
  test('AC-05/AC-06: material edit emits [Re-review] moderator email + per-Active edit notification', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, `Email fan-out — ${suffix}`, '40', '1');
      await approveAsMod(page, context, cast.mod, pool, jobId);
      await enrollAsActive(page, context, cast.active, pool, jobId);

      await reAuth(page, context, cast.alumni);
      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');
      await openEditModal(page);
      const editModal = page.getByTestId('edit-job-modal');
      await editModal.getByTestId('edit-dues-input').fill('75');
      const submitBtn = editModal.getByTestId('edit-submit');
      await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
      await submitBtn.click();

      // Wait for the demote (signals the server-side mutation committed).
      await pollJobState(pool, jobId, 'awaiting_moderation');

      // Filter the global test-only resend store by THIS job's id so other
      // parallel specs cannot pollute the assertion (workers > 1 safe).
      type Call = {
        to: string;
        subject: string;
        idempotencyKey?: string;
      };
      const jobKeyPrefix = `job:${jobId}:`;

      await expect
        .poll(async () => {
          const r = await page.request.get('/api/test/resend-calls');
          if (!r.ok()) return { reReview: 0, activeEdits: 0 };
          const all = (await r.json()) as Call[];
          const mine = all.filter((c) =>
            (c.idempotencyKey ?? '').startsWith(jobKeyPrefix),
          );
          const reReview = mine.filter((c) =>
            (c.idempotencyKey ?? '').includes(':re_review:'),
          ).length;
          const activeEdits = mine.filter(
            (c) =>
              c.to === cast.active.email &&
              (c.idempotencyKey ?? '').includes(':edit:'),
          ).length;
          return { reReview, activeEdits };
        }, { timeout: 10_000 })
        .toMatchObject({ reReview: 1, activeEdits: 1 });

      // Subject prefix check on the re-review email (PRD-011 AC-05).
      const finalResp = await page.request.get('/api/test/resend-calls');
      const allFinal = (await finalResp.json()) as Call[];
      const reReviewEmail = allFinal.find(
        (c) =>
          (c.idempotencyKey ?? '').startsWith(jobKeyPrefix) &&
          (c.idempotencyKey ?? '').includes(':re_review:'),
      );
      expect(reReviewEmail).toBeDefined();
      expect(reReviewEmail?.subject.startsWith('[Re-review] ')).toBe(true);
    } finally {
      await pool.end();
    }
  });
});
