import { test, expect } from '@playwright/test';
import {
  createTestPool,
  getUserByEmail,
  seedBootstrapAdmin,
  seedInviteToken,
  truncateAll,
} from '../support/db';

test.describe('PRD-003 AC-01 — invite-token signup happy path', () => {
  test('signup form → land on / signed in; users.role = preselectedRole', async ({
    page,
  }) => {
    const pool = createTestPool();
    try {
      await truncateAll(pool);
      const adminId = await seedBootstrapAdmin(pool);
      await seedInviteToken(pool, {
        token: 'happy-active',
        preselectedRole: 'Active',
        createdBy: adminId,
      });

      await page.goto('/signup?token=happy-active');
      await page.getByLabel('Email').fill('newbie@chapter.test');
      await page.getByLabel('Display name').fill('Newbie Active');
      await page.getByLabel('Password').fill('correct-horse-battery');
      await page.locator('button[type=submit]').click();

      await page.waitForURL('**/', { timeout: 10_000 });

      const user = await getUserByEmail(pool, 'newbie@chapter.test');
      expect(user?.role).toBe('Active');
    } finally {
      await pool.end();
    }
  });
});
