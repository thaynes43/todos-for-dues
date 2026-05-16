import { test, expect } from '@playwright/test';
import { createPool, truncateWalkingSkeleton } from './support/seed';
import { driveToCompleted, seedFourPersonas } from './support/flow';

test.describe('PRD-005 R-01 — complete job', () => {
  test('Alumni-poster checks attendees and completes → state badge shows completed', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      await truncateWalkingSkeleton(pool);
      const personas = await seedFourPersonas(pool, 'complete');
      const jobId = await driveToCompleted({
        page,
        context,
        pool,
        personas,
        description: `complete-${Date.now()}`,
      });
      await page.goto(`/jobs/${jobId}`);
      await expect(page.getByTestId('job-state-badge')).toHaveText(/completed/);
    } finally {
      await pool.end();
    }
  });
});
