import { test, expect } from '@playwright/test';
import {
  approveAsMod,
  createPool,
  enrollAsActive,
  installPageerrorListener,
  newSuffix,
  postJob,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-004 R-03 + AC-04 — Active unenrolls', () => {
  test.beforeEach(({ page }) => installPageerrorListener(page));

  test('Active enrolls → unenrolls → /my-enrollments no longer lists the job; re-enroll works', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      const description = `Unenroll me — ${suffix}`;
      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description);
      await approveAsMod(page, context, cast.mod, pool, jobId);
      await enrollAsActive(page, context, cast.active, pool, jobId);

      // Active opens the job → sees Unenroll button.
      await page.goto(`/jobs/${jobId}`);
      await expect(page.getByTestId('unenroll-button')).toBeVisible();
      await page.getByTestId('unenroll-button').click();
      await expect
        .poll(async () => {
          const { rows } = await pool.query<{ c: number }>(
            `SELECT count(*)::int AS c FROM job_enrollments WHERE job_id = $1 AND active_id = $2`,
            [jobId, cast.active.id],
          );
          return rows[0]?.c ?? 0;
        })
        .toBe(0);

      // The job no longer appears in /my-enrollments.
      await page.goto('/my-enrollments');
      await expect(
        page.locator(`[data-job-id="${jobId}"]`),
      ).toHaveCount(0);

      // Re-enrolling works.
      await page.goto(`/jobs/${jobId}`);
      await page.getByTestId('enroll-button').click();
      await expect
        .poll(async () => {
          const { rows } = await pool.query<{ c: number }>(
            `SELECT count(*)::int AS c FROM job_enrollments WHERE job_id = $1 AND active_id = $2`,
            [jobId, cast.active.id],
          );
          return rows[0]?.c ?? 0;
        })
        .toBe(1);
    } finally {
      await pool.end();
    }
  });
});
