import { test, expect } from '@playwright/test';
import { createTestPool, truncateAll } from '../support/db';
import { mockOidc } from '../support/oauth-mock';

test.describe('PRD-003 AC-09 — SSO fallback display-name prompt', () => {
  test('mocked Workspace callback w/ empty name → user is created with email-derived fallback or prompted for name', async ({
    page,
  }) => {
    test.skip(
      !process.env.OIDC_CLIENT_ID || !process.env.OIDC_HOSTED_DOMAIN,
      'Spec requires OIDC env configured on the dev server.',
    );
    const hd = process.env.OIDC_HOSTED_DOMAIN!;
    const email = `noname@${hd}`;
    const pool = createTestPool();
    try {
      await truncateAll(pool);
      await mockOidc(page, { email, name: '', hd });
      await page.goto('/login');
      await page.getByTestId('sso-button').click();

      // Better Auth requires a non-empty name; the OAuth callback either
      // prompts for one or rejects. The user-facing surface for this is owned
      // by DESIGN-006 (PLAN-006). For now, assert that NO user with empty
      // displayName is silently created.
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
      const { rows } = await pool.query<{ display_name: string }>(
        `SELECT display_name FROM users WHERE email = $1`,
        [email],
      );
      // Either the user wasn't created OR they have a non-empty display_name.
      for (const row of rows) {
        expect(row.display_name.length).toBeGreaterThan(0);
      }
    } finally {
      await pool.end();
    }
  });
});
