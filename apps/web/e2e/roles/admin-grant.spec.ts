import { test, expect } from '@playwright/test';
import {
  createPool,
  installPageerrorListener,
  newSuffix,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-008 AC-02 — Admin grants Moderator to Alumni', () => {
  test('Admin grants Moderator from /admin/users; no confirm dialog; audit row written', async ({
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

      const alumniRow = page.locator(
        `[data-testid="user-list-row"][data-user-id="${cast.alumni.id}"]`,
      );
      await expect(alumniRow).toBeVisible();
      await alumniRow.getByTestId('user-list-role-chip').click();
      await expect(
        alumniRow.getByTestId('user-list-role-menu'),
      ).toBeVisible();
      await alumniRow.getByTestId('user-list-role-option-Moderator').click();

      // No confirm dialog for grant (not an Admin demotion).
      await expect(page.getByTestId('user-list-demote-confirm')).toHaveCount(0);

      // DB role flips.
      await expect
        .poll(
          async () => {
            const { rows } = await pool.query<{ role: string }>(
              `SELECT role FROM users WHERE id = $1`,
              [cast.alumni.id],
            );
            return rows[0]?.role ?? null;
          },
          { timeout: 10_000 },
        )
        .toBe('Moderator');

      // Audit row written.
      const { rows } = await pool.query<{
        from_role: string;
        to_role: string;
        initiator_id: string;
        initiator_kind: string;
      }>(
        `SELECT from_role, to_role, initiator_id, initiator_kind
           FROM user_role_transitions
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [cast.alumni.id],
      );
      expect(rows[0]).toMatchObject({
        from_role: 'Alumni',
        to_role: 'Moderator',
        initiator_id: cast.admin.id,
        initiator_kind: 'admin',
      });
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
