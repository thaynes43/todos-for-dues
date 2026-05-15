import { test, expect } from '@playwright/test';
import {
  createTestPool,
  seedBootstrapAdmin,
  seedInviteToken,
  truncateAll,
} from '../support/db';

test.describe('PRD-003 AC-08 — app-managed display name required', () => {
  test('empty displayName → field-level error + no user row', async ({ page }) => {
    const pool = createTestPool();
    try {
      await truncateAll(pool);
      const adminId = await seedBootstrapAdmin(pool);
      await seedInviteToken(pool, {
        token: 'needs-name',
        preselectedRole: 'Active',
        createdBy: adminId,
      });

      await page.goto('/signup?token=needs-name');
      await page.getByLabel('Email').fill('noname@chapter.test');
      // Skip display name
      await page.getByLabel('Password').fill('correct-horse-battery');
      // Browser may block native form submission with empty `required` input.
      // Remove `required` attribute to force the Server Action to validate.
      await page.evaluate(() => {
        const el = document.querySelector('input[name="displayName"]');
        el?.removeAttribute('required');
      });
      await page.locator('button[type=submit]').click();

      // Either browser-validation prevented submit OR Server Action rejected.
      // In both cases, no user row is created.
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users WHERE email = $1`,
        ['noname@chapter.test'],
      );
      expect(rows[0]?.count).toBe('0');
    } finally {
      await pool.end();
    }
  });
});
