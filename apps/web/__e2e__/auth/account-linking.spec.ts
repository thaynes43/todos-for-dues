import { test, expect } from '@playwright/test';
import {
  createTestPool,
  getAccountRowsByEmail,
  getUserByEmail,
  seedBootstrapAdmin,
  seedInviteToken,
  truncateAll,
} from '../support/db';
import { mockOidc } from '../support/oauth-mock';

test.describe('PRD-003 R-09 — account linking on first SSO of existing user', () => {
  test('app-managed signup then SSO sign-in → same user_id, two account rows', async ({
    page,
  }) => {
    test.fixme(
      true,
      'Deferred to PLAN-008: see sso-happy-path.spec.ts. Account linking is already verified by packages/auth/__tests__/integration/signup-flow.test.ts (asserts the post-SSO row count: one users row, two account rows with same user_id). PLAN-008 lands the OIDC mock server so this browser-level confirmation can run.',
    );
    test.skip(
      !process.env.OIDC_CLIENT_ID || !process.env.OIDC_HOSTED_DOMAIN,
      'Spec requires OIDC env configured on the dev server.',
    );
    const hd = process.env.OIDC_HOSTED_DOMAIN!;
    const email = `linked@${hd}`;
    const pool = createTestPool();
    try {
      await truncateAll(pool);
      const adminId = await seedBootstrapAdmin(pool);
      await seedInviteToken(pool, {
        token: 'link-token',
        preselectedRole: 'Active',
        createdBy: adminId,
      });

      await page.goto('/signup?token=link-token');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Display name').fill('Linked Newbie');
      await page.getByLabel('Password').fill('correct-horse-battery');
      await page.locator('button[type=submit]').click();
      await page.waitForURL('**/', { timeout: 10_000 });

      const userAfterSignup = await getUserByEmail(pool, email);
      expect(userAfterSignup).not.toBeNull();
      const originalUserId = userAfterSignup!.id;

      // Sign out + sign in via SSO with the same email.
      await page.context().clearCookies();
      await mockOidc(page, { email, name: 'Linked Newbie', hd });
      await page.goto('/login');
      await page.getByTestId('sso-button').click();
      await page.waitForURL('**/', { timeout: 15_000 });

      const userAfterLink = await getUserByEmail(pool, email);
      expect(userAfterLink?.id).toBe(originalUserId);

      const accounts = await getAccountRowsByEmail(pool, email);
      expect(accounts.map((a) => a.providerId).sort()).toEqual([
        'credential',
        'google-workspace',
      ]);
    } finally {
      await pool.end();
    }
  });
});
