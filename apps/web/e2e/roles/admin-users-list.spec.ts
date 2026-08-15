import { test, expect } from '@playwright/test';
import {
  createPool,
  installPageerrorListener,
  newSuffix,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-008 AC-08 / ADR-015 — /admin/users is a read-only roster', () => {
  test('Admin sees the spec-seeded personas with display name + email + role pill; no role menu', async ({
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
      // ADR-015: roles come from the portal — the table is read-only, and says
      // so. There is no in-app role-change control anymore.
      await expect(page.getByTestId('user-list-portal-note')).toBeVisible();

      for (const persona of [cast.admin, cast.alumni, cast.mod, cast.active]) {
        const row = page.locator(
          `[data-testid="user-list-row"][data-user-id="${persona.id}"]`,
        );
        await expect(row).toBeVisible();
        await expect(row).toContainText(persona.displayName);
        await expect(row).toContainText(persona.email);
        // Display-only role pill shows the resolved DB role (Member for the
        // legacy Active/Alumni personas — status is orthogonal, not shown here).
        await expect(row.getByTestId('user-list-role')).toContainText(
          persona.role,
        );
        await expect(row).toHaveAttribute('data-user-role', persona.role);
        // The removed mutation affordances must be gone.
        await expect(row.getByTestId('user-list-role-chip')).toHaveCount(0);
        await expect(row.getByTestId('user-list-role-menu')).toHaveCount(0);
      }
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
