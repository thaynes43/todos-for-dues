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

test.describe('PRD-007 R-01 / AC-01 / AC-02 — Admin layout shell + role gate', () => {
  test('Admin sees five named nav entries; non-Admin redirected to /', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      await reAuth(page, context, cast.admin);
      await page.goto('/admin');
      await expect(page.getByTestId('admin-layout')).toBeVisible();
      await expect(page.getByTestId('admin-nav-dashboard')).toBeVisible();
      await expect(page.getByTestId('admin-nav-disputes')).toBeVisible();
      await expect(page.getByTestId('admin-nav-settings')).toBeVisible();
      await expect(page.getByTestId('admin-nav-audit-log')).toBeVisible();
      await expect(page.getByTestId('admin-nav-users')).toBeVisible();

      // Non-Admin → redirected away (landing page in turn forwards Active /
      // Alumni to /jobs, Moderator to /moderation-queue). The exact target
      // doesn't matter; what matters is the admin layout never renders.
      const assertRedirected = async () => {
        await expect
          .poll(async () => new URL(page.url()).pathname.startsWith('/admin'), {
            timeout: 10_000,
          })
          .toBe(false);
        await expect(page.getByTestId('admin-layout')).toHaveCount(0);
      };

      await reAuth(page, context, cast.active);
      await page.goto('/admin');
      await assertRedirected();

      await reAuth(page, context, cast.alumni);
      await page.goto('/admin');
      await assertRedirected();

      await reAuth(page, context, cast.mod);
      await page.goto('/admin');
      await assertRedirected();
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('Disputes nav badge appears when ≥1 job is disputed', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      await driveJobToDisputed({
        page,
        context,
        pool,
        cast,
        description: uniqueDescription(`badge-${suffix}`),
        reason: `Treasurer didn't credit me — ${suffix}`,
      });

      await reAuth(page, context, cast.admin);
      await page.goto('/admin');
      const badge = page.getByTestId('admin-nav-disputes-badge');
      await expect(badge).toBeVisible();
      const text = (await badge.textContent())?.trim() ?? '';
      expect(parseInt(text, 10)).toBeGreaterThanOrEqual(1);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
