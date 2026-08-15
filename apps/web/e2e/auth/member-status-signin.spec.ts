import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { readRuntimeEnv } from '../fixtures/runtime-env';
import {
  getPortalMemberStatus,
  registerPortalIdentity,
  setPortalMemberStatus,
  signInAs,
} from '../fixtures/personas';
import { seedPersona } from '../walking-skeleton/support/seed';

/**
 * ADR-015 — the `status` claim at sign-in is ORTHOGONAL to role:
 *  - a first sign-in maps role from the portal TIER (brother → Member); a
 *    declared member status (active/alumni) rides along in the claim but NEVER
 *    changes the role;
 *  - a portal-side status change is readable at the member's next sign-in
 *    (it lands in the registry / claim) yet fires NO role transition.
 */

function createTestPool(): Pool {
  return new Pool({ connectionString: readRuntimeEnv().DATABASE_URL });
}

async function countRoleTransitions(pool: Pool, userId: string): Promise<number> {
  const { rows } = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM user_role_transitions WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.c ?? 0;
}

test.describe('ADR-015 — status claim at sign-in (orthogonal to role)', () => {
  test('first sign-in with a declared active status still creates a Member', async ({
    page,
  }) => {
    const errors: Error[] = [];
    page.on('pageerror', (err) => errors.push(err));
    const pool = createTestPool();
    try {
      const email = `bootstrap-active-${randomUUID()}@chapter.test`;
      // Portal-created member — NO app user row yet. Registry declares active.
      await registerPortalIdentity({
        email,
        name: 'Bootstrap Active',
        tier: 'brother',
        status: 'active',
      });

      await signInAs(page, email);
      const { rows } = await pool.query<{ id: string; role: string }>(
        `SELECT id, role FROM users WHERE email = $1`,
        [email],
      );
      // Role comes from the TIER (brother → Member). The active status does NOT
      // make them an 'Active' role — that role no longer exists.
      expect(rows[0]?.role).toBe('Member');
      // The declared status is readable in the registry (orthogonal fact).
      expect(await getPortalMemberStatus(email)).toMatchObject({
        hasRow: true,
        status: 'active',
      });

      // An undeclared brother also creates a plain Member.
      const email2 = `bootstrap-undeclared-${randomUUID()}@chapter.test`;
      await registerPortalIdentity({
        email: email2,
        name: 'Bootstrap Undeclared',
        tier: 'brother',
      });
      await page.context().clearCookies();
      await signInAs(page, email2);
      const second = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE email = $1`,
        [email2],
      );
      expect(second.rows[0]?.role).toBe('Member');
      expect(errors).toEqual([]);
    } finally {
      await pool.end();
    }
  });

  test('a portal-side status change is readable at the next sign-in but fires no role transition', async ({
    page,
  }) => {
    const errors: Error[] = [];
    page.on('pageerror', (err) => errors.push(err));
    const pool = createTestPool();
    try {
      // Legacy 'Alumni' → a plain Member whose portal status is alumni.
      const persona = await seedPersona(pool, {
        email: 'status-resync@chapter.test',
        displayName: 'Status Resync',
        role: 'Alumni',
      });
      expect(persona.role).toBe('Member');

      await signInAs(page, persona.email);
      let role = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [persona.id],
      );
      expect(role.rows[0]?.role).toBe('Member');

      // The member flips to active in the PORTAL's settings page; the dues app
      // sees the new status at the next sign-in — but it is orthogonal to role.
      await setPortalMemberStatus({ email: persona.email, status: 'active' });
      await page.context().clearCookies();
      await signInAs(page, persona.email);
      role = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [persona.id],
      );
      // Role is unchanged; status moved independently.
      expect(role.rows[0]?.role).toBe('Member');
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        hasRow: true,
        status: 'active',
      });
      // No status-driven role transition was ever written.
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);

      // The status is readable in the UI, role pill fixed at Member.
      await page.goto('/profile');
      await expect(page.getByTestId('member-status-section')).toHaveAttribute(
        'data-current-status',
        'active',
      );
      await expect(page.getByTestId('profile-role')).toHaveText('Member');
      expect(errors).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});
