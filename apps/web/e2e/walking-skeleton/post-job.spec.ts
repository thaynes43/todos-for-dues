import { test, expect } from '@playwright/test';
import {
  createPool,
  seedPersona,
  truncateWalkingSkeleton,
} from './support/seed';
import { signInAs } from './support/personas';

test.describe('PRD-002 R-01..R-05 — Alumni posts a job', () => {
  test('post-job form submits → redirect to /jobs/<id> → state badge shows awaiting moderation', async ({
    page,
  }) => {
    const pool = createPool();
    try {
      await truncateWalkingSkeleton(pool);
      const alumni = await seedPersona(pool, {
        email: 'alumni@post-job.test',
        displayName: 'Alumni A',
        role: 'Alumni',
      });

      await signInAs(page, alumni.email);
      await page.goto('/jobs/new');

      await page
        .getByPlaceholder(/Describe the job/i)
        .fill('Rake the leaves at the chapter house');
      await page.locator('input[name="duesAmount"]').fill('40');
      await page.locator('input[name="recommendedPeopleCount"]').fill('2');
      // PRD-010 R-01/R-02: location + duration are required; contact-value
      // is pre-filled with the Alumni's account email.
      await page.getByTestId('post-job-location').fill('Chapter house');
      await page.getByTestId('post-job-duration').fill('1.5');
      await page.getByRole('button', { name: /Post job/i }).click();

      await page.waitForURL(/\/jobs\/[0-9a-f-]+$/, { timeout: 10_000 });
      const badge = page.getByTestId('job-state-badge');
      await expect(badge).toHaveText(/awaiting moderation/);
    } finally {
      await pool.end();
    }
  });
});
