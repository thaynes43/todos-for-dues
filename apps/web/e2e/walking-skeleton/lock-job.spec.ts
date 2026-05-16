import { test, expect } from '@playwright/test';
import { createPool, truncateWalkingSkeleton } from './support/seed';
import { driveToLocked, seedFourPersonas } from './support/flow';

test.describe('PRD-004 R-07 — lock job', () => {
  test('Alumni-poster locks an enrollment_open job with a future date → state badge becomes locked', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      await truncateWalkingSkeleton(pool);
      const personas = await seedFourPersonas(pool, 'lock');
      const jobId = await driveToLocked({
        page,
        context,
        pool,
        personas,
        description: `lock-${Date.now()}`,
      });
      await page.goto(`/jobs/${jobId}`);
      await expect(page.getByTestId('job-state-badge')).toHaveText(/locked/);
    } finally {
      await pool.end();
    }
  });
});
