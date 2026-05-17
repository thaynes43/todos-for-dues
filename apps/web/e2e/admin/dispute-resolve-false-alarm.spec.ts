import { test, expect } from '@playwright/test';
import {
  createPool,
  driveJobToDisputed,
  installPageerrorListener,
  newSuffix,
  reAuth,
  seedCast,
  uniqueDescription,
} from './support';

test.describe('PRD-007 AC-06 + PRD-006 AC-11 — Resolve dispute as false-alarm', () => {
  test('Admin resolves to payment_sent; job is re-eligible for confirm/dispute', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const jobId = await driveJobToDisputed({
        page,
        context,
        pool,
        cast,
        description: uniqueDescription(`resolve-false-alarm-${suffix}`),
        reason: `dispute reason ${suffix}`,
      });

      await reAuth(page, context, cast.admin);
      await page.goto('/admin/disputes');
      const row = page.locator(`[data-testid="dispute-card-row"][data-job-id="${jobId}"]`);
      await expect(row).toBeVisible();
      await row.getByTestId('resolve-dispute-false-alarm-button').click();
      const modal = page.getByTestId('resolve-dispute-modal');
      await expect(modal).toBeVisible();
      const note = `treasurer confirmed the credit — ${suffix}`;
      await modal.getByTestId('resolve-dispute-note').fill(note);
      await modal.getByTestId('resolve-dispute-submit').click();

      await expect
        .poll(async () => {
          const { rows } = await pool.query<{ state: string }>(
            'SELECT state FROM jobs WHERE id = $1',
            [jobId],
          );
          return rows[0]?.state;
        }, { timeout: 15_000 })
        .toBe('payment_sent');

      const { rows: trans } = await pool.query<{
        from_state: string;
        to_state: string;
        note: string | null;
      }>(
        `SELECT from_state, to_state, note FROM job_state_transitions
         WHERE job_id = $1 AND to_state = 'payment_sent' ORDER BY created_at DESC LIMIT 1`,
        [jobId],
      );
      expect(trans[0]?.from_state).toBe('disputed');
      expect(trans[0]?.note).toBe(note);

      // Active sees the action affordances again on /jobs/<id>.
      await reAuth(page, context, cast.active);
      await page.goto(`/jobs/${jobId}`);
      await expect(page.getByTestId('confirm-received-button')).toBeVisible();
      await expect(page.getByTestId('dispute-button')).toBeVisible();
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
