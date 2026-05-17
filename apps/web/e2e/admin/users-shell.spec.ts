import { test, expect } from '@playwright/test';
import {
  createPool,
  installPageerrorListener,
  newSuffix,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-007 AC-11 — Users sub-route (PLAN-011 shell placeholder)', () => {
  test('Admin opens /admin/users → placeholder renders behind Admin gate', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      await reAuth(page, context, cast.admin);
      await page.goto('/admin/users');
      await expect(page.getByTestId('admin-users-shell')).toBeVisible();
      await expect(page.getByTestId('admin-users-placeholder')).toContainText(
        'PLAN-012',
      );

      // Non-Admin → redirected away (Active lands on /jobs).
      await reAuth(page, context, cast.active);
      await page.goto('/admin/users');
      await expect
        .poll(
          async () => new URL(page.url()).pathname.startsWith('/admin'),
          { timeout: 10_000 },
        )
        .toBe(false);
      await expect(page.getByTestId('admin-users-shell')).toHaveCount(0);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
