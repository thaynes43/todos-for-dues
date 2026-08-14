import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { readRuntimeEnv } from '../fixtures/runtime-env';
import {
  registerPortalIdentity,
  setPortalMemberStatus,
  signInAs,
} from '../fixtures/personas';
import { seedPersona } from '../walking-skeleton/support/seed';

/**
 * ADR-014 — the `status` claim at sign-in:
 *  - first sign-in of a portal-created brother bootstraps the app role from
 *    the declared status (active → Active) instead of the Alumni default;
 *  - a registry change made portal-side lands at the member's NEXT sign-in
 *    via the session-create claim sync (system-audited), mirroring how tier
 *    changes propagate (ADR-013 / ADR 0007 C-3).
 */

function createTestPool(): Pool {
  return new Pool({ connectionString: readRuntimeEnv().DATABASE_URL });
}

test.describe('ADR-014 — status claim at sign-in', () => {
  test('first sign-in with a declared active status bootstraps role Active', async ({
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
      const { rows } = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE email = $1`,
        [email],
      );
      expect(rows[0]?.role).toBe('Active');

      // Undeclared member keeps the pre-status default (Alumni).
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
      expect(second.rows[0]?.role).toBe('Alumni');
      expect(errors).toEqual([]);
    } finally {
      await pool.end();
    }
  });

  test('a portal-side status change lands at the next sign-in (system-audited)', async ({
    page,
  }) => {
    const errors: Error[] = [];
    page.on('pageerror', (err) => errors.push(err));
    const pool = createTestPool();
    try {
      const persona = await seedPersona(pool, {
        email: 'status-resync@chapter.test',
        displayName: 'Status Resync',
        role: 'Alumni',
      });

      // First sign-in: registry row is undeclared → Alumni stays put.
      await signInAs(page, persona.email);
      let role = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [persona.id],
      );
      expect(role.rows[0]?.role).toBe('Alumni');

      // The member flips to active in the PORTAL's settings page (item 06);
      // the dues app sees it at the next sign-in.
      await setPortalMemberStatus({ email: persona.email, status: 'active' });
      await page.context().clearCookies();
      await signInAs(page, persona.email);
      role = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [persona.id],
      );
      expect(role.rows[0]?.role).toBe('Active');

      const audit = await pool.query<{
        from_role: string;
        to_role: string;
        initiator_kind: string;
        note: string | null;
      }>(
        `SELECT from_role, to_role, initiator_kind, note
           FROM user_role_transitions WHERE user_id = $1 ORDER BY created_at, ctid`,
        [persona.id],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({
        from_role: 'Alumni',
        to_role: 'Active',
        initiator_kind: 'system',
      });
      expect(audit.rows[0]!.note).toContain('portal claim-sync');
      expect(audit.rows[0]!.note).toContain('status=active');

      // And back: alumni declaration demotes to Alumni at the next sign-in.
      await setPortalMemberStatus({ email: persona.email, status: 'alumni' });
      await page.context().clearCookies();
      await signInAs(page, persona.email);
      role = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [persona.id],
      );
      expect(role.rows[0]?.role).toBe('Alumni');
      expect(errors).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});
