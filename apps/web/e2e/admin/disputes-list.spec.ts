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

test.describe('PRD-007 AC-05 — Disputes list shape', () => {
  test('Admin sees disputed job with description, disputer + role, reason, age, drill-in link', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const description = uniqueDescription(`disputed-${suffix}`);
      const reason = `treasurer didn't credit me — ${suffix}`;
      const jobId = await driveJobToDisputed({
        page,
        context,
        pool,
        cast,
        description,
        reason,
      });

      await reAuth(page, context, cast.admin);
      await page.goto('/admin/disputes');
      const row = page.locator(`[data-testid="dispute-card-row"][data-job-id="${jobId}"]`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(description);
      await expect(row).toContainText(cast.active.displayName);
      await expect(row).toContainText('(Active)');
      await expect(row.getByTestId('dispute-card-reason')).toContainText(reason);
      const age = row.getByTestId('dispute-card-age');
      await expect(age).toBeVisible();
      const ageText = (await age.textContent())?.trim() ?? '';
      expect(ageText).toMatch(/^\d+[dh]/);
      const link = row.getByTestId('dispute-card-link');
      await expect(link).toHaveAttribute('href', `/admin/jobs/${jobId}`);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
