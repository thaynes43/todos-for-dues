import { test, expect } from '@playwright/test';
import { createPool, installPageerrorListener, newSuffix, reAuth, seedCast } from './support';

test.describe('PRD-008 AC-01 — self-service Active → Alumni', () => {
  test('Active toggles to Alumni from /profile; role chip updates everywhere; audit row written', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      await reAuth(page, context, cast.active);
      await page.goto('/profile');
      await expect(page.getByTestId('profile-page')).toBeVisible();
      await expect(page.getByTestId('profile-role')).toHaveText('Active');

      // Dropdown shows Active (current) + Alumni; Moderator and Admin are
      // never rendered as options.
      const currentBtn = page.getByTestId('role-change-option-Active');
      const alumniBtn = page.getByTestId('role-change-option-Alumni');
      await expect(currentBtn).toBeVisible();
      await expect(currentBtn).toBeDisabled();
      await expect(currentBtn).toHaveText(/Active \(current\)/);
      await expect(alumniBtn).toBeVisible();
      await expect(page.getByTestId('role-change-option-Moderator')).toHaveCount(0);
      await expect(page.getByTestId('role-change-option-Admin')).toHaveCount(0);

      // Member-status control (sigo-alumni item 07) stays hidden until the
      // portal ships GET/PUT /api/member/status — the mock portal (like the
      // live one today) 404s the route, so the section must not render.
      await expect(page.getByTestId('profile-status-section')).toHaveCount(0);

      // Select Alumni.
      await alumniBtn.click();

      // DB role flips.
      await expect
        .poll(
          async () => {
            const { rows } = await pool.query<{ role: string }>(
              `SELECT role FROM users WHERE id = $1`,
              [cast.active.id],
            );
            return rows[0]?.role ?? null;
          },
          { timeout: 10_000 },
        )
        .toBe('Alumni');

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
        [cast.active.id],
      );
      expect(rows[0]).toMatchObject({
        from_role: 'Active',
        to_role: 'Alumni',
        initiator_id: cast.active.id,
        initiator_kind: 'user',
      });

      // Router refresh updates the chip in the nav + profile role label.
      await expect
        .poll(async () => (await page.getByTestId('profile-role').textContent())?.trim(), {
          timeout: 10_000,
        })
        .toBe('Alumni');

      // Dropdown now shows Active + Alumni (current).
      await expect(page.getByTestId('role-change-option-Active')).toBeEnabled();
      await expect(page.getByTestId('role-change-option-Alumni')).toBeDisabled();
      await expect(page.getByTestId('role-change-option-Alumni')).toHaveText(/Alumni \(current\)/);

      // Admin can view the audit row in the per-user detail.
      await reAuth(page, context, cast.admin);
      await page.goto(`/admin/users/${cast.active.id}`);
      await expect(page.getByTestId('admin-user-detail')).toBeVisible();
      const historyRows = page.getByTestId('role-history-row');
      await expect(historyRows.first()).toBeVisible();
      await expect(historyRows.first()).toHaveAttribute('data-to-role', 'Alumni');
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
