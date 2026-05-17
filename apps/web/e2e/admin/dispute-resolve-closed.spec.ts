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

test.describe('PRD-007 AC-06 + PRD-006 AC-08/AC-09 — Resolve dispute as closed', () => {
  test('empty note blocks submit; valid note transitions to closed and writes audit row', async ({
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
        description: uniqueDescription(`resolve-closed-${suffix}`),
        reason: `dispute reason ${suffix}`,
      });

      await reAuth(page, context, cast.admin);
      await page.goto('/admin/disputes');
      const row = page.locator(`[data-testid="dispute-card-row"][data-job-id="${jobId}"]`);
      await expect(row).toBeVisible();
      await row.getByTestId('resolve-dispute-closed-button').click();
      const modal = page.getByTestId('resolve-dispute-modal');
      await expect(modal).toBeVisible();
      // AC-09: empty note → submit disabled.
      await expect(modal.getByTestId('resolve-dispute-submit')).toBeDisabled();
      await modal
        .getByTestId('resolve-dispute-note')
        .fill('   ');
      await expect(modal.getByTestId('resolve-dispute-submit')).toBeDisabled();
      const note = `closed by Admin — ${suffix}`;
      await modal.getByTestId('resolve-dispute-note').fill(note);
      await expect(modal.getByTestId('resolve-dispute-submit')).not.toBeDisabled();
      await modal.getByTestId('resolve-dispute-submit').click();

      // Row disappears, job is closed in DB, audit-log carries the note.
      await expect
        .poll(async () => {
          const { rows } = await pool.query<{ state: string }>(
            'SELECT state FROM jobs WHERE id = $1',
            [jobId],
          );
          return rows[0]?.state;
        }, { timeout: 15_000 })
        .toBe('closed');

      const { rows: trans } = await pool.query<{
        from_state: string;
        to_state: string;
        note: string | null;
      }>(
        `SELECT from_state, to_state, note FROM job_state_transitions
         WHERE job_id = $1 AND to_state = 'closed' ORDER BY created_at DESC LIMIT 1`,
        [jobId],
      );
      expect(trans[0]?.from_state).toBe('disputed');
      expect(trans[0]?.to_state).toBe('closed');
      expect(trans[0]?.note).toBe(note);

      // Navigate to /admin/jobs/<jobId> and confirm the row in the timeline.
      await page.goto(`/admin/jobs/${jobId}`);
      await expect(page.getByTestId('audit-log-table')).toBeVisible();
      await expect(
        page.locator('[data-testid="audit-log-row"]', { hasText: note }),
      ).toBeVisible();
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
