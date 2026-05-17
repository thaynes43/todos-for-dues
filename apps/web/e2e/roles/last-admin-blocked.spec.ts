import { test, expect } from '@playwright/test';
import {
  createPool,
  demoteAllOtherAdmins,
  installPageerrorListener,
  newSuffix,
  reAuth,
  restoreAdmins,
  seedCast,
} from './support';

// Last-Admin specs need EXACTLY one Admin in the chapter at the moment of
// the self-demote attempt. We demote every other Admin before the test and
// restore them after; run this file under `--workers=1` to avoid clashing
// with other suites that assume their seeded Admin remains Admin.
test.describe.configure({ mode: 'serial' });

test.describe('PRD-008 AC-04 / AC-06 — last-Admin self-demote blocked + banner', () => {
  test('Sole Admin self-demotes → 422 → MinAdminErrorBanner with link (canPromote=true)', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    let demoted: string[] = [];
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      demoted = await demoteAllOtherAdmins(pool, cast.admin.id);

      await reAuth(page, context, cast.admin);
      await page.goto('/profile');
      await expect(page.getByTestId('profile-page')).toBeVisible();
      await expect(page.getByTestId('profile-role')).toHaveText('Admin');

      // Sole-Admin: count(Admin) must be 1 right now.
      const { rows: countRows } = await pool.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM users WHERE role = 'Admin'`,
      );
      expect(countRows[0]?.c).toBe(1);

      // Attempt self-demote.
      await page.getByTestId('role-change-option-Alumni').click();

      // Banner appears with PRD-008 §5.2 wording.
      const banner = page.getByTestId('min-admin-error-banner');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(
        "Cannot demote — this is the chapter's only Admin.",
      );
      await expect(banner).toContainText(
        /Demoting yourself now would leave the chapter without an Admin/,
      );

      // Contextual link is visible — viewer is Admin → canPromote=true.
      const link = page.getByTestId('min-admin-error-banner-link');
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute(
        'href',
        '/admin/users?returnTo=%2Fprofile',
      );

      // Role unchanged in DB.
      const { rows } = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [cast.admin.id],
      );
      expect(rows[0]?.role).toBe('Admin');
    } finally {
      await restoreAdmins(pool, demoted);
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
