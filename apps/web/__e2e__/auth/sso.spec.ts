import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  createTestPool,
  getAccountRowsByEmail,
  getUserByEmail,
  seedBootstrapAdmin,
  seedInviteToken,
} from '../support/db';
import { seedOidcProfile } from '../support/oauth-mock';

// All SSO specs share one in-process OIDC mock seeded via `nextProfile`.
// Running them in parallel races on the seed/consume cycle (one spec's
// click can consume another spec's profile). Serial execution keeps each
// spec's seed → click → callback intact.
test.describe.configure({ mode: 'serial' });

test.describe('PRD-003 — SSO via OIDC mock', () => {
  test('AC-01 SSO sign-in creates Alumni user; lands signed-in', async ({
    page,
  }) => {
    test.skip(
      !process.env.OIDC_CLIENT_ID || !process.env.OIDC_HOSTED_DOMAIN,
      'Spec requires OIDC env configured on the dev server.',
    );
    const hd = process.env.OIDC_HOSTED_DOMAIN!;
    const email = `sso-newbie+${randomUUID()}@${hd}`;
    const pool = createTestPool();
    try {
      await seedOidcProfile({ email, name: 'SSO Newbie', hd });

      await page.goto('/login');
      await page.getByTestId('sso-button').click();
      await page.waitForURL(
        (u) =>
          !u.pathname.startsWith('/login') &&
          !u.pathname.startsWith('/api/auth'),
        { timeout: 15_000 },
      );

      const user = await getUserByEmail(pool, email);
      expect(user?.role).toBe('Alumni');
    } finally {
      await pool.end();
    }
  });

  test('AC-02 non-HD callback aborts before creating a user row', async ({
    page,
  }) => {
    test.skip(
      !process.env.OIDC_CLIENT_ID || !process.env.OIDC_HOSTED_DOMAIN,
      'Spec requires OIDC env configured on the dev server.',
    );
    const email = `attacker+${randomUUID()}@other.example`;
    const pool = createTestPool();
    try {
      await seedOidcProfile({ email, name: 'Attacker', hd: 'other.example' });

      await page.goto('/login');
      await page.getByTestId('sso-button').click();
      // mapProfileToUser throws before Better Auth creates the user. The
      // browser ends up somewhere under /login or /api/auth/error — either
      // way it never reaches a signed-in page like /jobs.
      await page.waitForURL(
        (u) =>
          u.pathname.startsWith('/login') ||
          u.pathname.startsWith('/api/auth'),
        { timeout: 15_000 },
      );

      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users WHERE email = $1`,
        [email],
      );
      expect(rows[0]?.count).toBe('0');
    } finally {
      await pool.end();
    }
  });

  test('R-09 account-linking: credential signup then SSO → same user, two accounts', async ({
    page,
  }) => {
    test.skip(
      !process.env.OIDC_CLIENT_ID || !process.env.OIDC_HOSTED_DOMAIN,
      'Spec requires OIDC env configured on the dev server.',
    );
    const hd = process.env.OIDC_HOSTED_DOMAIN!;
    const email = `linked+${randomUUID()}@${hd}`;
    const pool = createTestPool();
    try {
      const { id: adminId } = await seedBootstrapAdmin(pool);
      const token = await seedInviteToken(pool, {
        token: 'link-token',
        preselectedRole: 'Active',
        createdBy: adminId,
      });

      await page.goto(`/signup?token=${encodeURIComponent(token)}`);
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Display name').fill('Linked Newbie');
      await page.getByLabel('Password').fill('correct-horse-battery');
      await page.locator('button[type=submit]').click();
      await page.waitForURL((u) => !u.pathname.startsWith('/signup'), {
        timeout: 10_000,
      });

      const userAfterSignup = await getUserByEmail(pool, email);
      expect(userAfterSignup).not.toBeNull();
      const originalUserId = userAfterSignup!.id;

      await page.context().clearCookies();
      await seedOidcProfile({ email, name: 'Linked Newbie', hd });
      await page.goto('/login');
      await page.getByTestId('sso-button').click();
      await page.waitForURL(
        (u) =>
          !u.pathname.startsWith('/login') &&
          !u.pathname.startsWith('/api/auth'),
        { timeout: 15_000 },
      );

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

  test('AC-09 SSO with empty name claim does not silently create a user', async ({
    page,
  }) => {
    test.skip(
      !process.env.OIDC_CLIENT_ID || !process.env.OIDC_HOSTED_DOMAIN,
      'Spec requires OIDC env configured on the dev server.',
    );
    const hd = process.env.OIDC_HOSTED_DOMAIN!;
    const email = `noname+${randomUUID()}@${hd}`;
    const pool = createTestPool();
    try {
      await seedOidcProfile({ email, name: '', hd });
      await page.goto('/login');
      await page.getByTestId('sso-button').click();

      // Better Auth either rejects (no name on the profile) or renders a
      // name-prompt screen. Either way no user row with an empty
      // display_name should sneak through.
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
      const { rows } = await pool.query<{ display_name: string }>(
        `SELECT display_name FROM users WHERE email = $1`,
        [email],
      );
      for (const row of rows) {
        expect(row.display_name.length).toBeGreaterThan(0);
      }
    } finally {
      await pool.end();
    }
  });
});
