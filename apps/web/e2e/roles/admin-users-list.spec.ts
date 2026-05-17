import { test, expect } from '@playwright/test';
import {
  createPool,
  installPageerrorListener,
  newSuffix,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-008 AC-08 — /admin/users lists chapter users with role chips', () => {
  test('Admin sees the four spec-seeded personas with display name + email + role', async ({
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
      await expect(page.getByTestId('admin-users')).toBeVisible();
      await expect(page.getByTestId('user-list-table')).toBeVisible();

      for (const persona of [cast.admin, cast.alumni, cast.mod, cast.active]) {
        const row = page.locator(
          `[data-testid="user-list-row"][data-user-id="${persona.id}"]`,
        );
        await expect(row).toBeVisible();
        await expect(row).toContainText(persona.displayName);
        await expect(row).toContainText(persona.email);
        await expect(row.getByTestId('user-list-role-chip')).toContainText(
          persona.role,
        );
      }
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
