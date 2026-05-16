import { test, expect } from '@playwright/test';
import { createPool, truncateWalkingSkeleton } from './support/seed';
import { driveToPaymentSent, seedFourPersonas } from './support/flow';

test.describe('PRD-005 R-06 — mark payment-sent in a single click', () => {
  test('Alumni-poster clicks MarkPaymentSent → state badge becomes payment-sent', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      await truncateWalkingSkeleton(pool);
      const personas = await seedFourPersonas(pool, 'paid');
      const jobId = await driveToPaymentSent({
        page,
        context,
        pool,
        personas,
        description: `paid-${Date.now()}`,
      });
      await page.goto(`/jobs/${jobId}`);
      await expect(page.getByTestId('job-state-badge')).toHaveText(/payment-sent/);
      await expect(page.getByTestId('tipping-nudge')).toBeVisible();
    } finally {
      await pool.end();
    }
  });
});
