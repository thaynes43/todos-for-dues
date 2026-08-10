import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import {
  approveAsMod,
  completeAsAlumni,
  createPool,
  enrollAsActive,
  installPageerrorListener,
  lockAsAlumni,
  newSuffix,
  pollJobState,
  postJob,
  reAuth,
  seedCast,
  seedPersona,
  type SeededPersona,
} from './support';

test.describe('PRD-005 R-05 + AC-06 — revert completion', () => {
  test.beforeEach(({ page }) => installPageerrorListener(page));

  test('Alumni reverts → attendees cleared → completing again uses the new roster', async ({
    page,
    context,
  }) => {
    const pool: Pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      // Add a second Active for the second-completion roster.
      const active2 = await seedSecondActive(pool, suffix);

      const description = `Revert me — ${suffix}`;
      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description, '40', '2');
      await approveAsMod(page, context, cast.mod, pool, jobId);
      await enrollAsActive(page, context, cast.active, pool, jobId);
      await enrollAsActive(page, context, active2, pool, jobId);
      await lockAsAlumni(page, context, cast.alumni, pool, jobId);

      // First completion with both Actives.
      await completeAsAlumni(page, context, cast.alumni, pool, jobId);

      // Alumni reverts.
      await page.goto(`/jobs/${jobId}`);
      await page.getByTestId('revert-completion-button').click();
      await expect(page.getByTestId('revert-completion-modal')).toBeVisible();
      await page.getByTestId('revert-completion-confirm').click();
      await pollJobState(pool, jobId, 'locked');

      // Confirmed attendees cleared.
      const { rows: cleared } = await pool.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM job_enrollments
         WHERE job_id = $1 AND confirmed_attendee_at IS NOT NULL`,
        [jobId],
      );
      expect(cleared[0]?.c).toBe(0);

      // Complete again with only Active 1.
      await page.goto(`/jobs/${jobId}`);
      await page
        .getByTestId(`complete-attendee-${active2.id}`)
        .click();
      await page.getByTestId('complete-job-submit').click();
      await pollJobState(pool, jobId, 'completed');

      // Reload to see the post-completion UI (server-component re-render).
      await page.goto(`/jobs/${jobId}`);
      await page.getByTestId('mark-payment-sent-button').click();
      await pollJobState(pool, jobId, 'payment_sent');

      const { rows: credit } = await pool.query<{
        per_active_dues_credit: Record<string, string> | null;
      }>(
        `SELECT per_active_dues_credit FROM jobs WHERE id = $1`,
        [jobId],
      );
      const map = credit[0]?.per_active_dues_credit ?? {};
      expect(map[cast.active.id]).toBe('40.00');
      expect(map[active2.id]).toBeUndefined();
    } finally {
      await pool.end();
    }
  });
});

async function seedSecondActive(
  pool: Pool,
  suffix: string,
): Promise<SeededPersona> {
  return seedPersona(pool, {
    email: `mvp-active2-${suffix}@chapter.test`,
    displayName: `MVP Active2 ${suffix}`,
    role: 'Active',
  });
}
