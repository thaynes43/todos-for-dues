import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { readRuntimeEnv } from '../fixtures/runtime-env';
import { registerPortalIdentity, signInAs } from '../fixtures/personas';
import { seedPersona } from '../walking-skeleton/support/seed';

/**
 * ADR-013 / ADR 0007 C-3 — tier changes at the portal propagate at the next
 * sign-in: the session-create hook re-runs the tier → role mapping through
 * the audited FSM path.
 */

function createTestPool(): Pool {
  return new Pool({ connectionString: readRuntimeEnv().DATABASE_URL });
}

test.describe('ADR-013 — claim re-sync on sign-in', () => {
  test('tier brother → operator promotes Alumni to Moderator (audited); back to brother demotes', async ({
    page,
  }) => {
    const errors: Error[] = [];
    page.on('pageerror', (err) => errors.push(err));
    const pool = createTestPool();
    try {
      const persona = await seedPersona(pool, {
        email: 'resync@chapter.test',
        displayName: 'Resync Rita',
        role: 'Alumni',
      });

      // First sign-in links the portal account; brother tier ↔ Alumni = no-op.
      await signInAs(page, persona.email);
      let role = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [persona.id],
      );
      expect(role.rows[0]?.role).toBe('Alumni');

      // The portal promotes her to operator → next sign-in syncs Moderator.
      await registerPortalIdentity({
        email: persona.email,
        name: persona.displayName,
        tier: 'operator',
        sub: persona.id,
      });
      await page.context().clearCookies();
      await signInAs(page, persona.email);
      role = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [persona.id],
      );
      expect(role.rows[0]?.role).toBe('Moderator');

      const audit = await pool.query<{
        from_role: string | null;
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
        to_role: 'Moderator',
        initiator_kind: 'system',
      });
      expect(audit.rows[0]!.note).toContain('portal claim-sync');

      // Demoted back to brother at the portal → next sign-in demotes to Alumni.
      await registerPortalIdentity({
        email: persona.email,
        name: persona.displayName,
        tier: 'brother',
        sub: persona.id,
      });
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

  test('app-granted Active survives brother-tier sign-ins (no spurious transitions)', async ({
    page,
  }) => {
    const pool = createTestPool();
    try {
      const persona = await seedPersona(pool, {
        email: 'active-stays@chapter.test',
        displayName: 'Active Stays',
        role: 'Active',
      });

      await signInAs(page, persona.email);
      await page.context().clearCookies();
      await signInAs(page, persona.email);

      const role = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [persona.id],
      );
      expect(role.rows[0]?.role).toBe('Active');

      const audit = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM user_role_transitions WHERE user_id = $1`,
        [persona.id],
      );
      expect(audit.rows[0]?.count).toBe('0');
    } finally {
      await pool.end();
    }
  });
});
