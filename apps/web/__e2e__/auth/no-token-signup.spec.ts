import { test, expect } from '@playwright/test';
import { createTestPool, truncateAll } from '../support/db';

test.describe('PRD-003 AC-03 — invite required for app-managed signup', () => {
  test('no token → revoked banner + no user row created', async ({ page }) => {
    const pool = createTestPool();
    try {
      await truncateAll(pool);
      await page.goto('/signup');
      await expect(
        page.getByText('Invite link is invalid or has been revoked.'),
      ).toBeVisible();
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users`,
      );
      expect(rows[0]?.count).toBe('0');
    } finally {
      await pool.end();
    }
  });
});
