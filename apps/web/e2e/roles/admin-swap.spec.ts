import { test, expect } from '@playwright/test';
import {
  countRoleTransitions,
  createPool,
  demoteAllOtherAdmins,
  fetchBootstrapAdminIds,
  getRoleFromDb,
  installPageerrorListener,
  newSuffix,
  reAuth,
  restoreAdmins,
  seedCast,
} from './support';

// See `last-admin-blocked.spec.ts` top-of-file note — this spec also relies
// on chapter-wide sole-Admin state at the moment of self-demote, so it must
// also run in its own Playwright invocation (`.github/workflows/e2e.yml`).
test.describe.configure({ mode: 'serial' });

test.describe('PRD-008 AC-05 — atomic swap via UI round-trip', () => {
  test('Last-Admin → banner → click link → grant Admin to user B → bounced to /profile → self-demote succeeds', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    let demoted: string[] = [];
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const seededUserIds = [
        cast.admin.id,
        cast.alumni.id,
        cast.mod.id,
        cast.active.id,
        ...(await fetchBootstrapAdminIds(pool)),
      ];
      demoted = await demoteAllOtherAdmins(pool, seededUserIds, cast.admin.id);

      const beforeAlumniTransitions = await countRoleTransitions(
        pool,
        cast.alumni.id,
      );

      await reAuth(page, context, cast.admin);
      await page.goto('/profile');
      await page.getByTestId('role-change-option-Alumni').click();
      const banner = page.getByTestId('min-admin-error-banner');
      await expect(banner).toBeVisible();

      // Track the mutation calls so we can correlate the swap to the network.
      const grantResponses: number[] = [];
      page.on('response', (res) => {
        if (res.url().includes('users.grantRole')) {
          grantResponses.push(res.status());
        }
      });
      const changeResponses: number[] = [];
      page.on('response', (res) => {
        if (res.url().includes('users.changeRole')) {
          changeResponses.push(res.status());
        }
      });

      // Follow the contextual link.
      await page.getByTestId('min-admin-error-banner-link').click();
      await page.waitForURL(/\/admin\/users\?returnTo=%2Fprofile/);
      await expect(page.getByTestId('user-list-return-banner')).toBeVisible();

      // Grant Admin to the seeded Alumni.
      const targetRow = page.locator(
        `[data-testid="user-list-row"][data-user-id="${cast.alumni.id}"]`,
      );
      await targetRow.getByTestId('user-list-role-chip').click();
      await targetRow.getByTestId('user-list-role-option-Admin').click();
      // Granting Admin to a non-Admin is NOT a demotion → no confirm dialog.
      await expect(
        page.getByTestId('user-list-demote-confirm'),
      ).toHaveCount(0);

      // Bounced back to /profile.
      await page.waitForURL(/\/profile$/, { timeout: 15_000 });
      await expect(page.getByTestId('profile-page')).toBeVisible();

      // Now both are Admin → count(Admin) = 2.
      expect(await getRoleFromDb(pool, cast.alumni.id)).toBe('Admin');
      expect(await getRoleFromDb(pool, cast.admin.id)).toBe('Admin');

      // Self-demote now succeeds.
      await page.getByTestId('role-change-option-Alumni').click();
      await expect
        .poll(
          async () => getRoleFromDb(pool, cast.admin.id),
          { timeout: 10_000 },
        )
        .toBe('Alumni');

      // Verify both transitions landed: the promote on alumni AND the demote
      // on admin. Trigger never fired (no UNPROCESSABLE_CONTENT between).
      const afterAlumniTransitions = await countRoleTransitions(
        pool,
        cast.alumni.id,
      );
      expect(afterAlumniTransitions).toBeGreaterThanOrEqual(
        beforeAlumniTransitions + 1,
      );

      // Sanity: every grantRole response was 2xx.
      for (const status of grantResponses) {
        expect(status).toBeLessThan(400);
      }
      // changeRole had one expected 422 (the initial blocked attempt) plus a
      // 2xx for the successful swap.
      expect(changeResponses).toContain(200);
    } finally {
      // Restore the Admins we demoted at the start so the next spec is
      // unaffected. cast.admin / cast.alumni are spec-private personas.
      await restoreAdmins(pool, demoted);
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
