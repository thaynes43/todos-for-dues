import { test, expect } from '@playwright/test';
import {
  approveAsMod,
  createPool,
  installPageerrorListener,
  newSuffix,
  postJob,
  reAuth,
  seedCast,
  uniqueDescription,
} from './support';

test.describe('PRD-007 §6 — Audit log find-by-job-ID search', () => {
  test('valid UUID → navigate to /admin/jobs/<id>; invalid → inline error', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      // Seed a job we can search for.
      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, uniqueDescription(`search-${suffix}`));
      await approveAsMod(page, context, cast.mod, pool, jobId);

      await reAuth(page, context, cast.admin);
      await page.goto('/admin/audit-log');
      await expect(page.getByTestId('admin-audit-log-search')).toBeVisible();

      // Invalid input → inline error, no navigation.
      await page.getByTestId('audit-log-search-input').fill('not-a-uuid');
      await page.getByTestId('audit-log-search-submit').click();
      await expect(page.getByTestId('audit-log-search-error')).toBeVisible();
      expect(page.url()).toMatch(/\/admin\/audit-log$/);

      // Valid UUID → navigation.
      await page.getByTestId('audit-log-search-input').fill(jobId);
      await page.getByTestId('audit-log-search-submit').click();
      await page.waitForURL(`**/admin/jobs/${jobId}`);
      await expect(page.getByTestId('audit-log-table')).toBeVisible();
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
