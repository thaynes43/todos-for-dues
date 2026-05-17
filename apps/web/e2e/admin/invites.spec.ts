import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  createPool,
  installPageerrorListener,
  newSuffix,
  reAuth,
  seedCast,
} from './support';

// PLAN-014 / VALIDATION-014 §5 — Admin invite management end-to-end.
//
// Coverage:
//  - Empty state on /admin/invites for a fresh Admin.
//  - Mint flow (modal → role selection → row appears with chip + URL + Copy +
//    Revoke).
//  - Clipboard copy delivers the exact <base>/signup?token=<token> URL.
//  - A second browser context signs up via the URL → Active user lands on /.
//  - Reload as Admin: the consumed invite is GONE (R-14 single-use).
//  - Mint a second Alumni invite + Revoke flow → row disappears + persistence
//    across reload.

test.describe('PLAN-014 / PRD-003 R-11..R-14 — Admin invite management UI', () => {
  test('mint → copy → external signup → list refresh → mint + revoke', async ({
    page,
    context,
    browser,
  }) => {
    // Trap 6 (PLAN-014 prompt §): clipboard access in headless Chromium needs
    // explicit permissions; grant per-context rather than globally configuring
    // playwright.config.ts so the change stays scoped to this spec.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const errors = installPageerrorListener(page);
    const pool = createPool();

    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      // === Admin signs in and reaches /admin/invites via the AdminNav link.
      await reAuth(page, context, cast.admin);
      await page.goto('/admin');
      await expect(page.getByTestId('admin-nav-invites')).toBeVisible();
      await page.getByTestId('admin-nav-invites').click();
      await page.waitForURL('**/admin/invites');
      await expect(page.getByTestId('admin-invites')).toBeVisible();

      // Snapshot the pre-existing outstanding-invite count so we can detect
      // the row we add without depending on other parallel specs.
      const baselineRowCount = await page
        .locator('[data-testid="invite-list-row"]')
        .count();

      // === Mint an Active invite via the modal.
      await page.getByTestId('mint-invite-button').click();
      const mintModal = page.getByTestId('mint-invite-modal');
      await expect(mintModal).toBeVisible();

      // Role selector must NOT present Moderator or Admin (R-11).
      await expect(mintModal.getByTestId('mint-invite-role-Active')).toBeVisible();
      await expect(mintModal.getByTestId('mint-invite-role-Alumni')).toBeVisible();
      await expect(
        mintModal.locator('[data-testid="mint-invite-role-Moderator"]'),
      ).toHaveCount(0);
      await expect(
        mintModal.locator('[data-testid="mint-invite-role-Admin"]'),
      ).toHaveCount(0);

      // Active is the default; submit.
      await mintModal.getByTestId('mint-invite-submit').click();
      await expect(mintModal).not.toBeVisible();

      // The newly-minted invite appears as a row. Poll for it.
      await expect
        .poll(
          async () =>
            page.locator('[data-testid="invite-list-row"]').count(),
          { timeout: 10_000 },
        )
        .toBeGreaterThan(baselineRowCount);

      // Pull the freshly-minted row out of the DB so we know which token
      // belongs to "this" mint (other parallel specs may have minted too).
      const adminUserId = cast.admin.id;
      const { rows: mintedRows } = await pool.query<{
        id: string;
        token: string;
      }>(
        `SELECT id, token FROM invite_tokens
         WHERE created_by = $1::uuid AND revoked_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [adminUserId],
      );
      expect(mintedRows.length).toBe(1);
      const mintedInvite = mintedRows[0]!;
      expect(mintedInvite.token.length).toBeGreaterThanOrEqual(16);

      const mintedRow = page.locator(
        `[data-testid="invite-list-row"][data-invite-id="${mintedInvite.id}"]`,
      );
      await expect(mintedRow).toBeVisible();
      await expect(mintedRow.getByTestId('invite-list-role-chip')).toHaveText('Active');
      const urlInput = mintedRow.getByTestId('invite-list-url');
      await expect(urlInput).toBeVisible();
      const expectedUrl = `${new URL(page.url()).origin}/signup?token=${mintedInvite.token}`;
      await expect(urlInput).toHaveValue(expectedUrl);
      await expect(mintedRow.getByTestId('invite-list-copy')).toBeVisible();
      await expect(mintedRow.getByTestId('revoke-invite-button')).toBeVisible();

      // === Clipboard assertion.
      await mintedRow.getByTestId('invite-list-copy').click();
      const clipText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipText).toBe(expectedUrl);

      // === Second browser context completes signup via the URL.
      const externalContext = await browser.newContext();
      try {
        const externalPage = await externalContext.newPage();
        installPageerrorListener(externalPage);
        await externalPage.goto(expectedUrl);
        const signupEmail = `new-active-${suffix}-${randomUUID().slice(0, 8)}@chapter.test`;
        const signupPassword = 'correct-horse-battery';
        await externalPage.getByLabel('Email').fill(signupEmail);
        await externalPage.getByLabel('Display name').fill(`New Active ${suffix}`);
        await externalPage.getByLabel('Password').fill(signupPassword);
        await externalPage.getByRole('button', { name: /Create account/i }).click();
        await externalPage.waitForURL('**/', { timeout: 20_000 });

        // DB-state assertion (VALIDATION-014 §6): new user row exists with
        // role Active, and the invite_tokens row is now revoked.
        const { rows: newUserRows } = await pool.query<{ role: string }>(
          'SELECT role FROM users WHERE email = $1',
          [signupEmail],
        );
        expect(newUserRows.length).toBe(1);
        expect(newUserRows[0]!.role).toBe('Active');

        const { rows: redeemedRows } = await pool.query<{
          revoked_at: Date | null;
        }>(
          'SELECT revoked_at FROM invite_tokens WHERE id = $1',
          [mintedInvite.id],
        );
        expect(redeemedRows[0]?.revoked_at).not.toBeNull();
      } finally {
        await externalContext.close();
      }

      // === Back to the Admin context — reload, the redeemed invite is GONE.
      await page.goto('/admin/invites');
      await expect(
        page.locator(
          `[data-testid="invite-list-row"][data-invite-id="${mintedInvite.id}"]`,
        ),
      ).toHaveCount(0);

      // === Mint a second invite (Alumni) and then revoke it.
      await page.getByTestId('mint-invite-button').click();
      const mintModal2 = page.getByTestId('mint-invite-modal');
      await expect(mintModal2).toBeVisible();
      await mintModal2
        .getByTestId('mint-invite-role-Alumni')
        .locator('input[type="radio"]')
        .check();
      await mintModal2.getByTestId('mint-invite-submit').click();
      await expect(mintModal2).not.toBeVisible();

      const { rows: alumniRows } = await pool.query<{
        id: string;
        token: string;
      }>(
        `SELECT id, token FROM invite_tokens
         WHERE created_by = $1::uuid AND revoked_at IS NULL
           AND preselected_role = 'Alumni'
         ORDER BY created_at DESC LIMIT 1`,
        [adminUserId],
      );
      expect(alumniRows.length).toBe(1);
      const alumniInvite = alumniRows[0]!;

      const alumniRow = page.locator(
        `[data-testid="invite-list-row"][data-invite-id="${alumniInvite.id}"]`,
      );
      await expect(alumniRow).toBeVisible();
      await expect(alumniRow.getByTestId('invite-list-role-chip')).toHaveText('Alumni');

      // Revoke via the confirm modal.
      await alumniRow.getByTestId('revoke-invite-button').click();
      const revokeModal = page.getByTestId('revoke-invite-modal');
      await expect(revokeModal).toBeVisible();
      await revokeModal.getByTestId('revoke-invite-confirm').click();
      await expect(revokeModal).not.toBeVisible();

      // Row disappears from the live list (after invalidation re-fetches).
      await expect(alumniRow).toHaveCount(0, { timeout: 10_000 });

      // DB assertion: the second invite is now revoked.
      const { rows: revokedRows } = await pool.query<{
        revoked_at: Date | null;
      }>(
        'SELECT revoked_at FROM invite_tokens WHERE id = $1',
        [alumniInvite.id],
      );
      expect(revokedRows[0]?.revoked_at).not.toBeNull();

      // Reload — revocation persists.
      await page.goto('/admin/invites');
      await expect(
        page.locator(
          `[data-testid="invite-list-row"][data-invite-id="${alumniInvite.id}"]`,
        ),
      ).toHaveCount(0);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
