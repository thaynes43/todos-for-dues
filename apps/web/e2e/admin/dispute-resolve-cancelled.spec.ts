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

test.describe('PRD-007 AC-06 + PRD-006 AC-10 — Resolve dispute as cancelled', () => {
  test('Admin resolves disputed job as cancelled with a note', async ({
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
        description: uniqueDescription(`resolve-cancelled-${suffix}`),
        reason: `dispute reason ${suffix}`,
      });

      await reAuth(page, context, cast.admin);
      await page.goto('/admin/disputes');
      const row = page.locator(`[data-testid="dispute-card-row"][data-job-id="${jobId}"]`);
      await expect(row).toBeVisible();
      await row.getByTestId('resolve-dispute-cancelled-button').click();
      const modal = page.getByTestId('resolve-dispute-modal');
      await expect(modal).toBeVisible();
      const note = `cancelled per chapter agreement — ${suffix}`;
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
        .toBe('cancelled');

      const { rows: trans } = await pool.query<{
        from_state: string;
        to_state: string;
        note: string | null;
      }>(
        `SELECT from_state, to_state, note FROM job_state_transitions
         WHERE job_id = $1 AND to_state = 'cancelled' ORDER BY created_at DESC LIMIT 1`,
        [jobId],
      );
      expect(trans[0]?.from_state).toBe('disputed');
      expect(trans[0]?.note).toBe(note);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
