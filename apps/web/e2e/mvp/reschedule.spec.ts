import { test, expect } from '@playwright/test';
import {
  approveAsMod,
  createPool,
  enrollAsActive,
  lockAsAlumni,
  newSuffix,
  postJob,
  pollJobState,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-004 R-10 / AC-12 — reschedule preserves enrollments', () => {
  test('Alumni reschedules locked job → state back to enrollment_open; Active stays enrolled', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      const description = `Reschedule me — ${suffix}`;
      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description);
      await approveAsMod(page, context, cast.mod, pool, jobId);
      await enrollAsActive(page, context, cast.active, pool, jobId);
      await lockAsAlumni(page, context, cast.alumni, pool, jobId);

      // Alumni opens detail → reschedules.
      await page.goto(`/jobs/${jobId}`);
      await page.getByTestId('reschedule-button').click();
      await expect(page.getByTestId('reschedule-modal')).toBeVisible();
      await page.getByTestId('reschedule-confirm').click();
      await pollJobState(pool, jobId, 'enrollment_open');

      // work_date cleared.
      const { rows: workRows } = await pool.query<{ work_date: Date | null }>(
        `SELECT work_date FROM jobs WHERE id = $1`,
        [jobId],
      );
      expect(workRows[0]?.work_date).toBeNull();

      // Enrollments preserved.
      const { rows: enrollRows } = await pool.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM job_enrollments WHERE job_id = $1`,
        [jobId],
      );
      expect(enrollRows[0]?.c).toBe(1);

      // Active still sees this job in /my-enrollments.
      await reAuth(page, context, cast.active);
      await page.goto('/my-enrollments');
      await expect(page.locator(`[data-job-id="${jobId}"]`)).toBeVisible();
    } finally {
      await pool.end();
    }
  });
});
