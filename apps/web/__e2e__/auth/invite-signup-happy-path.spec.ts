import { randomUUID } from 'node:crypto';
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
      const { id: adminId } = await seedBootstrapAdmin(pool);
      const token = await seedInviteToken(pool, {
        token: 'happy-active',
        preselectedRole: 'Active',
        createdBy: adminId,
      });
      const newbieEmail = `newbie+${randomUUID()}@chapter.test`;

      await page.goto(`/signup?token=${encodeURIComponent(token)}`);
      await page.getByLabel('Email').fill(newbieEmail);
      await page.getByLabel('Display name').fill('Newbie Active');
      await page.getByLabel('Password').fill('correct-horse-battery');
      await page.locator('button[type=submit]').click();

      await page.waitForURL((u) => !u.pathname.startsWith('/signup'), {
        timeout: 10_000,
      });

      const user = await getUserByEmail(pool, newbieEmail);
      expect(user?.role).toBe('Active');
    } finally {
      await pool.end();
    }
  });
});
