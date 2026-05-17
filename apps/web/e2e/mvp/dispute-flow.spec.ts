import { test, expect } from '@playwright/test';
import {
  approveAsMod,
  completeAsAlumni,
  createPool,
  enrollAsActive,
  lockAsAlumni,
  markPaymentSentAsAlumni,
  newSuffix,
  pollJobState,
  postJob,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-006 R-05 + AC-05/AC-06 — Active disputes', () => {
  test('Active disputes with reason → state=disputed; banner shown; empty reason disabled', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      const description = `Dispute me — ${suffix}`;
      const reason = `Treasurer never credited me — ${suffix}`;

      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description);
      await approveAsMod(page, context, cast.mod, pool, jobId);
      await enrollAsActive(page, context, cast.active, pool, jobId);
      await lockAsAlumni(page, context, cast.alumni, pool, jobId);
      await completeAsAlumni(page, context, cast.alumni, pool, jobId);
      await markPaymentSentAsAlumni(
        page,
        context,
        cast.alumni,
        pool,
        jobId,
      );

      // Active disputes.
      await reAuth(page, context, cast.active);
      await page.goto(`/jobs/${jobId}`);
      await page.getByTestId('dispute-button').click();
      await expect(page.getByTestId('dispute-modal')).toBeVisible();

      // AC-06: empty reason → submit disabled.
      await expect(page.getByTestId('dispute-submit')).toBeDisabled();
      await page.getByTestId('dispute-reason').fill(reason);
      await expect(page.getByTestId('dispute-submit')).not.toBeDisabled();
      await page.getByTestId('dispute-submit').click();
      await pollJobState(pool, jobId, 'disputed');

      // Active sees the banner; no resolve actions.
      await page.goto(`/jobs/${jobId}`);
      await expect(page.getByTestId('disputed-job-banner')).toBeVisible();
      await expect(page.getByTestId('job-actions')).not.toBeVisible();
    } finally {
      await pool.end();
    }
  });
});
