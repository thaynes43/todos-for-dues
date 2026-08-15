import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { readRuntimeEnv } from '../fixtures/runtime-env';
import {
  getPortalMemberStatus,
  registerPortalIdentity,
  signInAs,
} from '../fixtures/personas';
import { seedPersona } from '../walking-skeleton/support/seed';

/**
 * ADR-013 / ADR-015 — role comes from the portal TIER and re-syncs at the next
 * sign-in through the audited FSM path. Member STATUS (active/alumni) is
 * orthogonal: it rides along in the claim and never fires a role transition.
 */

function createTestPool(): Pool {
  return new Pool({ connectionString: readRuntimeEnv().DATABASE_URL });
}

test.describe('ADR-013 — claim re-sync on sign-in', () => {
  test('tier brother → operator promotes Member to Moderator (audited); back to brother demotes', async ({
    page,
  }) => {
    const errors: Error[] = [];
    page.on('pageerror', (err) => errors.push(err));
    const pool = createTestPool();
    try {
      const persona = await seedPersona(pool, {
        email: 'resync@chapter.test',
        displayName: 'Resync Rita',
        role: 'Member',
      });

      // First sign-in links the portal account; brother tier ↔ Member = no-op.
      await signInAs(page, persona.email);
      let role = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [persona.id],
      );
      expect(role.rows[0]?.role).toBe('Member');

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
        from_role: 'Member',
        to_role: 'Moderator',
        initiator_kind: 'system',
      });
      expect(audit.rows[0]!.note).toContain('portal claim-sync');

      // Demoted back to brother at the portal → next sign-in demotes to Member.
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
      expect(role.rows[0]?.role).toBe('Member');
      expect(errors).toEqual([]);
    } finally {
      await pool.end();
    }
  });

  test('a declared member status rides along brother-tier sign-ins without role transitions', async ({
    page,
  }) => {
    const pool = createTestPool();
    try {
      // Legacy 'Alumni' → a plain Member whose portal status is alumni.
      const persona = await seedPersona(pool, {
        email: 'status-stays@chapter.test',
        displayName: 'Status Stays',
        role: 'Alumni',
      });
      expect(persona.role).toBe('Member');

      await signInAs(page, persona.email);
      await page.context().clearCookies();
      await signInAs(page, persona.email);

      // The tier (brother) maps to Member both times; the alumni status is
      // orthogonal and never fires a role transition.
      const role = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [persona.id],
      );
      expect(role.rows[0]?.role).toBe('Member');

      const audit = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM user_role_transitions WHERE user_id = $1`,
        [persona.id],
      );
      expect(audit.rows[0]?.count).toBe('0');

      // The status fact survived the sign-ins, independent of role.
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        hasRow: true,
        status: 'alumni',
      });
    } finally {
      await pool.end();
    }
  });
});
