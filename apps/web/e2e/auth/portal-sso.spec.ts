import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { readRuntimeEnv } from '../fixtures/runtime-env';
import {
  registerPortalIdentity,
  signInAs,
  startPortalSignIn,
} from '../fixtures/personas';

/**
 * ADR-013 — portal SSO is the only door. First-time sign-ins create the
 * user with the tier-mapped role; pending / unknown tiers are refused
 * BEFORE any user row exists.
 */

function createTestPool(): Pool {
  return new Pool({ connectionString: readRuntimeEnv().DATABASE_URL });
}

test.describe('ADR-013 — portal SSO sign-in', () => {
  test('brother tier: first sign-in creates a Member user, lands signed-in', async ({
    page,
  }) => {
    const errors: Error[] = [];
    page.on('pageerror', (err) => errors.push(err));
    const email = `sso-brother+${randomUUID()}@chapter.test`;
    const pool = createTestPool();
    try {
      await registerPortalIdentity({ email, name: 'New Brother', tier: 'brother' });
      await signInAs(page, email);

      const { rows } = await pool.query<{ role: string; display_name: string }>(
        `SELECT role, display_name FROM users WHERE email = $1`,
        [email],
      );
      // ADR-015: tier brother → role Member (the old 'Alumni' role is gone).
      expect(rows[0]).toMatchObject({ role: 'Member', display_name: 'New Brother' });

      const accounts = await pool.query<{ provider_id: string }>(
        `SELECT a.provider_id FROM "account" a
         JOIN users u ON u.id = a.user_id WHERE u.email = $1`,
        [email],
      );
      expect(accounts.rows.map((r) => r.provider_id)).toEqual(['sigo-portal']);
      expect(errors).toEqual([]);
    } finally {
      await pool.end();
    }
  });

  test('operator tier maps to Moderator; admin tier maps to Admin (first sign-in)', async ({
    page,
  }) => {
    const pool = createTestPool();
    try {
      const modEmail = `sso-operator+${randomUUID()}@chapter.test`;
      await registerPortalIdentity({
        email: modEmail,
        name: 'New Operator',
        tier: 'operator',
      });
      await signInAs(page, modEmail);
      // Moderators land on the moderation queue.
      await expect(page).toHaveURL(/moderation-queue/);
      const mod = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE email = $1`,
        [modEmail],
      );
      expect(mod.rows[0]?.role).toBe('Moderator');

      await page.context().clearCookies();
      const adminEmail = `sso-admin+${randomUUID()}@chapter.test`;
      await registerPortalIdentity({
        email: adminEmail,
        name: 'New Admin',
        tier: 'admin',
      });
      await signInAs(page, adminEmail);
      const admin = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE email = $1`,
        [adminEmail],
      );
      expect(admin.rows[0]?.role).toBe('Admin');
    } finally {
      await pool.end();
    }
  });

  test('pending tier: refused with the membership-pending screen, no user row', async ({
    page,
  }) => {
    const email = `sso-pending+${randomUUID()}@chapter.test`;
    const pool = createTestPool();
    try {
      await registerPortalIdentity({ email, name: 'Pending Pete', tier: 'pending' });
      await startPortalSignIn(page, email);
      await page.waitForURL(/\/login\?error=/i, { timeout: 30_000 });
      await expect(page.getByTestId('membership-pending')).toBeVisible();

      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users WHERE email = $1`,
        [email],
      );
      expect(rows[0]?.count).toBe('0');
    } finally {
      await pool.end();
    }
  });

  test('unknown tier fails closed (refused, no user row)', async ({ page }) => {
    const email = `sso-mystery+${randomUUID()}@chapter.test`;
    const pool = createTestPool();
    try {
      await registerPortalIdentity({ email, name: 'Mystery Tier', tier: 'owner' });
      await startPortalSignIn(page, email);
      await page.waitForURL(/\/login\?error=/i, { timeout: 30_000 });

      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users WHERE email = $1`,
        [email],
      );
      expect(rows[0]?.count).toBe('0');
    } finally {
      await pool.end();
    }
  });
});
