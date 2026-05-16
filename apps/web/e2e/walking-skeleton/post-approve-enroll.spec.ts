import { test, expect } from '@playwright/test';
import {
  createPool,
  getJobIdByDescription,
  seedPersona,
  truncateWalkingSkeleton,
} from './support/seed';
import { signInAs } from './support/personas';

test.describe('walking-skeleton — post → approve → enroll', () => {
  test('Alumni posts → Moderator approves → Active enrolls; state badge updates each step', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      await truncateWalkingSkeleton(pool);
      const alumni = await seedPersona(pool, {
        email: 'alumni@pae.test',
        displayName: 'Alumni',
        role: 'Alumni',
        password: 'correct-horse-battery',
      });
      const mod = await seedPersona(pool, {
        email: 'mod@pae.test',
        displayName: 'Mod',
        role: 'Moderator',
        password: 'correct-horse-battery',
      });
      const active = await seedPersona(pool, {
        email: 'active@pae.test',
        displayName: 'Active',
        role: 'Active',
        password: 'correct-horse-battery',
      });

      const description = `pae-${Date.now()}`;

      // Alumni posts
      await signInAs(page, alumni.email, alumni.password);
      await page.goto('/jobs/new');
      await page.getByPlaceholder(/Describe the job/i).fill(description);
      await page.locator('input[name="duesAmount"]').fill('30');
      await page.locator('input[name="recommendedPeopleCount"]').fill('1');
      await page.getByRole('button', { name: /Post job/i }).click();
      await page.waitForURL(/\/jobs\/[0-9a-f-]+$/);
      const jobId = (await getJobIdByDescription(pool, description))!;
      expect(jobId).toBeTruthy();

      // Mod approves
      await context.clearCookies();
      await signInAs(page, mod.email, mod.password);
      await page.goto('/moderation-queue');
      await expect(
        page.locator(`[data-job-id="${jobId}"]`),
      ).toBeVisible();
      await page
        .locator(`[data-job-id="${jobId}"]`)
        .getByTestId('approve-button')
        .click();
      await expect
        .poll(async () => {
          const { rows } = await pool.query<{ state: string }>(
            `SELECT state FROM jobs WHERE id = $1`,
            [jobId],
          );
          return rows[0]?.state;
        })
        .toBe('enrollment_open');

      // Active enrolls
      await context.clearCookies();
      await signInAs(page, active.email, active.password);
      await page.goto(`/jobs/${jobId}`);
      await expect(page.getByTestId('job-state-badge')).toHaveText(
        /enrollment-open/,
      );
      await page.getByTestId('enroll-button').click();
      await expect
        .poll(async () => {
          const { rows } = await pool.query<{ c: number }>(
            `SELECT count(*)::int AS c FROM job_enrollments WHERE job_id = $1`,
            [jobId],
          );
          return rows[0]?.c ?? 0;
        })
        .toBe(1);
    } finally {
      await pool.end();
    }
  });
});
