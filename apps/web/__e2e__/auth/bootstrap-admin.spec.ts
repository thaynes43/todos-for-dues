import { test, expect } from '@playwright/test';
import {
  createTestPool,
  getRoleAuditByEmail,
  getUserByEmail,
  seedBootstrapAdmin,
  seedInviteToken,
  truncateAll,
} from '../support/db';

test.describe('ADR-002 + ADR-011 — BOOTSTRAP_ADMIN_EMAIL end-to-end', () => {
  test('sign in once with matching email → Admin role + system audit row', async ({
    page,
  }) => {
    test.skip(
      !process.env.BOOTSTRAP_ADMIN_EMAIL,
      'Spec requires BOOTSTRAP_ADMIN_EMAIL set on the dev server.',
    );
    const targetEmail = process.env.BOOTSTRAP_ADMIN_EMAIL!;
    const pool = createTestPool();
    try {
      await truncateAll(pool);
      const seederId = await seedBootstrapAdmin(pool, 'seeder@bootstrap.test');
      await seedInviteToken(pool, {
        token: 'bootstrap-link',
        preselectedRole: 'Active',
        createdBy: seederId,
      });

      await page.goto('/signup?token=bootstrap-link');
      await page.getByLabel('Email').fill(targetEmail);
      await page.getByLabel('Display name').fill('Incoming Admin');
      await page.getByLabel('Password').fill('correct-horse-battery');
      await page.locator('button[type=submit]').click();
      await page.waitForURL('**/', { timeout: 10_000 });

      const user = await getUserByEmail(pool, targetEmail);
      expect(user?.role).toBe('Admin');

      const audit = await getRoleAuditByEmail(pool, targetEmail);
      expect(audit).toEqual([
        { fromRole: 'Active', toRole: 'Admin', initiatorKind: 'system' },
      ]);
    } finally {
      await pool.end();
    }
  });
});
