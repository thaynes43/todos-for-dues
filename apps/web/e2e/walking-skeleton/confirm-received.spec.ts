import { test, expect } from '@playwright/test';
import { createPool, truncateWalkingSkeleton } from './support/seed';
import {
  driveToPaymentSent,
  reAuth,
  seedFourPersonas,
} from './support/flow';

test.describe('PRD-006 R-01 — confirmReceipt closes the loop', () => {
  test('Enrolled Active clicks ConfirmReceived on payment_sent → state becomes closed', async ({
    page,
    context,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    const pool = createPool();
    try {
      await truncateWalkingSkeleton(pool);
      const personas = await seedFourPersonas(pool, 'closed');
      const jobId = await driveToPaymentSent({
        page,
        context,
        pool,
        personas,
        description: `closed-${Date.now()}`,
      });

      await reAuth(page, context, personas.active);
      await page.goto(`/jobs/${jobId}`);
      await page.getByTestId('confirm-received-button').click();

      await expect
        .poll(async () => {
          const { rows } = await pool.query<{ state: string }>(
            `SELECT state FROM jobs WHERE id = $1`,
            [jobId],
          );
          return rows[0]?.state;
        })
        .toBe('closed');
      await page.goto(`/jobs/${jobId}`);
      await expect(page.getByTestId('job-state-badge')).toHaveText(/closed/);
      // VALIDATION-006 §5 — walking-skeleton shows only the state badge;
      // <ClosedJobBanner> is PLAN-010 scope and must not render.
      await expect(page.getByTestId('closed-job-banner')).toHaveCount(0);

      expect(pageErrors, pageErrors.map((e) => e.message).join('\n')).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});
