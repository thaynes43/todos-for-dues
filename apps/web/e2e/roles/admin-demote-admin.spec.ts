import { test, expect } from '@playwright/test';
import {
  createPool,
  installPageerrorListener,
  newSuffix,
  reAuth,
  seedCast,
  seedPersona,
} from './support';

test.describe('PRD-008 §6 — Admin demotes another Admin requires confirm', () => {
  test('Admin A demotes Admin B → confirm dialog → confirm → role flips + audit row', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const adminB = await seedPersona(pool, {
        email: `roles-admin-b-${suffix}@chapter.test`,
        displayName: `Admin B ${suffix}`,
        role: 'Admin',
        password: 'correct-horse-battery',
      });

      await reAuth(page, context, cast.admin);
      await page.goto('/admin/users');
      await expect(page.getByTestId('admin-users')).toBeVisible();

      const targetRow = page.locator(
        `[data-testid="user-list-row"][data-user-id="${adminB.id}"]`,
      );
      await expect(targetRow).toBeVisible();
      await targetRow.getByTestId('user-list-role-chip').click();
      await targetRow.getByTestId('user-list-role-option-Alumni').click();

      // Confirm dialog appears before the mutation fires.
      await expect(
        page.getByTestId('user-list-demote-confirm'),
      ).toBeVisible();

      // Verify role unchanged while the dialog is open.
      const before = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [adminB.id],
      );
      expect(before.rows[0]?.role).toBe('Admin');

      await page.getByTestId('user-list-demote-confirm-submit').click();

      await expect
        .poll(
          async () => {
            const { rows } = await pool.query<{ role: string }>(
              `SELECT role FROM users WHERE id = $1`,
              [adminB.id],
            );
            return rows[0]?.role ?? null;
          },
          { timeout: 10_000 },
        )
        .toBe('Alumni');

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
        [adminB.id],
      );
      expect(rows[0]).toMatchObject({
        from_role: 'Admin',
        to_role: 'Alumni',
        initiator_id: cast.admin.id,
        initiator_kind: 'admin',
      });
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('Cancel on the demote confirm dialog leaves role unchanged', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const adminB = await seedPersona(pool, {
        email: `roles-admin-cancel-${suffix}@chapter.test`,
        displayName: `Admin Cancel ${suffix}`,
        role: 'Admin',
        password: 'correct-horse-battery',
      });

      await reAuth(page, context, cast.admin);
      await page.goto('/admin/users');
      const targetRow = page.locator(
        `[data-testid="user-list-row"][data-user-id="${adminB.id}"]`,
      );
      await targetRow.getByTestId('user-list-role-chip').click();
      await targetRow.getByTestId('user-list-role-option-Active').click();

      await expect(
        page.getByTestId('user-list-demote-confirm'),
      ).toBeVisible();
      await page.getByTestId('user-list-demote-cancel').click();
      await expect(
        page.getByTestId('user-list-demote-confirm'),
      ).toHaveCount(0);

      const { rows } = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [adminB.id],
      );
      expect(rows[0]?.role).toBe('Admin');
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
