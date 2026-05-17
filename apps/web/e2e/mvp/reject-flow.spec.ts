import { test, expect } from '@playwright/test';
import {
  createPool,
  newSuffix,
  pollJobState,
  postJob,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-002 R-08..R-09 + AC-10..AC-13 — rejection flow', () => {
  test('Mod rejects with reason → Alumni sees banner + Post-new-job CTA', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      const description = `Reject me — ${suffix}`;
      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description);

      // Mod rejects with a reason.
      await reAuth(page, context, cast.mod);
      await page.goto('/moderation-queue');
      await page
        .locator(`[data-job-id="${jobId}"]`)
        .getByTestId('reject-button')
        .click();

      // PRD-002 AC-11: empty reason → submit disabled.
      await expect(page.getByTestId('reject-submit')).toBeDisabled();
      await page
        .getByTestId('reject-reason-textarea')
        .fill('Dues too low for the scope');
      await expect(page.getByTestId('reject-submit')).not.toBeDisabled();
      await page.getByTestId('reject-submit').click();
      await pollJobState(pool, jobId, 'rejected');

      // Alumni opens the job and sees the banner.
      await reAuth(page, context, cast.alumni);
      await page.goto(`/jobs/${jobId}`);
      await expect(page.getByTestId('rejected-job-banner')).toBeVisible();
      await expect(page.getByTestId('rejected-job-reason')).toContainText(
        /dues too low/i,
      );

      // PRD-002 AC-13: terminal — no action affordances, only Post-new-job CTA.
      await expect(page.getByTestId('job-actions')).not.toBeVisible();
      await expect(page.getByTestId('rejected-post-new-cta')).toBeVisible();

      // Clicking CTA → blank /jobs/new form.
      await page.getByTestId('rejected-post-new-cta').click();
      await page.waitForURL(/\/jobs\/new$/);
      const textarea = page.getByPlaceholder(/Describe the job/i);
      await expect(textarea).toHaveValue('');
    } finally {
      await pool.end();
    }
  });
});
