import { test, expect } from '@playwright/test';
import {
  approveAsMod,
  createPool,
  enrollAsActive,
  installPageerrorListener,
  newSuffix,
  postJob,
  pollJobState,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-004 R-11 + AC-13..AC-15 — cancel flow', () => {
  test.beforeEach(({ page }) => installPageerrorListener(page));

  test('Alumni cancels with reason → state cancelled; Active sees banner; reason stored in audit log', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      const description = `Cancel me — ${suffix}`;
      const reason = `Mom moved the couch already — ${suffix}`;

      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description);
      await approveAsMod(page, context, cast.mod, pool, jobId);
      await enrollAsActive(page, context, cast.active, pool, jobId);

      // Alumni opens detail → opens cancel modal.
      await reAuth(page, context, cast.alumni);
      await page.goto(`/jobs/${jobId}`);
      await page.getByTestId('cancel-job-button').click();
      await expect(page.getByTestId('cancel-job-modal')).toBeVisible();

      // PRD-004 AC-14: empty reason → submit disabled.
      await expect(page.getByTestId('cancel-job-submit')).toBeDisabled();
      await page.getByTestId('cancel-job-reason').fill(reason);
      await expect(page.getByTestId('cancel-job-submit')).not.toBeDisabled();
      await page.getByTestId('cancel-job-submit').click();
      await pollJobState(pool, jobId, 'cancelled');

      // Active opens the job → sees banner; no action affordances.
      await reAuth(page, context, cast.active);
      await page.goto(`/jobs/${jobId}`);
      await expect(page.getByTestId('cancelled-job-banner')).toBeVisible();
      await expect(page.getByTestId('cancelled-job-reason')).toContainText(
        reason,
      );
      await expect(page.getByTestId('job-actions')).not.toBeVisible();

      // Cancellation reason captured in job_state_transitions.note.
      const { rows } = await pool.query<{ note: string | null }>(
        `SELECT note FROM job_state_transitions
         WHERE job_id = $1 AND to_state = 'cancelled'
         ORDER BY created_at DESC LIMIT 1`,
        [jobId],
      );
      expect(rows[0]?.note).toBe(reason);
    } finally {
      await pool.end();
    }
  });
});
