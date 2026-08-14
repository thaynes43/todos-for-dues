import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { readRuntimeEnv } from '../fixtures/runtime-env';
import {
  getPortalMemberStatus,
  setPortalMemberStatus,
  signInAs,
} from '../fixtures/personas';
import { seedPersona } from '../walking-skeleton/support/seed';

/**
 * VALIDATION (ADR-014) — the two sync channels (status claim at sign-in,
 * memberStatus.get on page load) must COOPERATE with in-app flips, never
 * fight them:
 *
 *  1. an in-app flip (PUT → registry) survives sign-out/sign-in — the fresh
 *     id_token claim agrees with the registry, so claim-sync writes NO echo
 *     audit row and the role stays where the member put it;
 *  2. a portal-side registry edit lands on the next dues PAGE LOAD (not just
 *     the next sign-in) via memberStatus.get's system-audited projection,
 *     and the server-side access gates follow.
 */

function createTestPool(): Pool {
  return new Pool({ connectionString: readRuntimeEnv().DATABASE_URL });
}

interface AuditRow {
  from_role: string;
  to_role: string;
  initiator_kind: string;
  note: string | null;
}

async function fetchAuditRows(pool: Pool, userId: string): Promise<AuditRow[]> {
  const { rows } = await pool.query<AuditRow>(
    `SELECT from_role, to_role, initiator_kind, note
       FROM user_role_transitions WHERE user_id = $1
      ORDER BY created_at, ctid`,
    [userId],
  );
  return rows;
}

async function pollDbRole(pool: Pool, userId: string, expected: string) {
  await expect
    .poll(
      async () => {
        const { rows } = await pool.query<{ role: string }>(
          `SELECT role FROM users WHERE id = $1`,
          [userId],
        );
        return rows[0]?.role ?? null;
      },
      { timeout: 10_000 },
    )
    .toBe(expected);
}

test.describe('ADR-014 validation — flip / sign-in round-trips', () => {
  test('an in-app flip survives sign-out/sign-in with no echo audit row', async ({
    page,
  }) => {
    const errors: Error[] = [];
    page.on('pageerror', (err) => errors.push(err));
    const pool = createTestPool();
    try {
      const persona = await seedPersona(pool, {
        email: 'roundtrip@chapter.test',
        displayName: 'Roundtrip',
        role: 'Active',
      });

      // In-app flip to Alumni through the portal-backed control.
      await signInAs(page, persona.email);
      await page.goto('/profile');
      await expect(page.getByTestId('profile-status-section')).toHaveAttribute(
        'data-portal',
        'on',
      );
      await page.getByTestId('role-change-option-Alumni').click();
      await pollDbRole(pool, persona.id, 'Alumni');
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        hasRow: true,
        status: 'alumni',
      });
      expect(await fetchAuditRows(pool, persona.id)).toHaveLength(1);

      // Sign out, sign back in. The freshly-minted id_token snapshots the
      // registry (status=alumni), which AGREES with the role the member chose
      // — claim-sync must be a no-op, not a fight.
      await page.context().clearCookies();
      await signInAs(page, persona.email);
      expect(await fetchAuditRows(pool, persona.id)).toHaveLength(1);
      await pollDbRole(pool, persona.id, 'Alumni');

      // Flip back to Active in-app, then round-trip the session again.
      await page.goto('/profile');
      await expect(
        page.getByTestId('role-change-option-Alumni'),
      ).toBeDisabled();
      await page.getByTestId('role-change-option-Active').click();
      await pollDbRole(pool, persona.id, 'Active');
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        status: 'active',
      });
      await page.context().clearCookies();
      await signInAs(page, persona.email);
      await pollDbRole(pool, persona.id, 'Active');

      // Exactly the two user flips — no system echo rows from either
      // sign-in's claim-sync or any profile-load get.
      const audit = await fetchAuditRows(pool, persona.id);
      expect(audit).toHaveLength(2);
      expect(audit.map((r) => r.initiator_kind)).toEqual(['user', 'user']);
      expect(errors).toEqual([]);
    } finally {
      await pool.end();
    }
  });

  test('a portal-side edit lands on the next page load and moves the access gates', async ({
    page,
  }) => {
    const errors: Error[] = [];
    page.on('pageerror', (err) => errors.push(err));
    const pool = createTestPool();
    try {
      const persona = await seedPersona(pool, {
        email: 'pageload-sync@chapter.test',
        displayName: 'Pageload Sync',
        role: 'Active',
      });

      await signInAs(page, persona.email);
      await page.goto('/profile');
      await expect(page.getByTestId('profile-status-section')).toHaveAttribute(
        'data-portal',
        'on',
      );

      // Member flips to alumni in the PORTAL settings page mid-session…
      await setPortalMemberStatus({ email: persona.email, status: 'alumni' });

      // …and the dues app picks it up on the NEXT page load (no re-sign-in):
      // memberStatus.get re-projects onto users.role, system-audited.
      await page.goto('/profile');
      await pollDbRole(pool, persona.id, 'Alumni');
      let audit = await fetchAuditRows(pool, persona.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        from_role: 'Active',
        to_role: 'Alumni',
        initiator_kind: 'system',
      });
      expect(audit[0]!.note).toContain('ADR-014');

      // The ACCESS surface follows on the next navigation: the server-side
      // gate now treats the member as Alumni.
      await page.goto('/jobs/new');
      await expect(page.getByTestId('post-job-location')).toBeVisible();
      await page.goto('/profile');
      await expect(page.getByTestId('profile-role')).toHaveText('Alumni');
      await expect(
        page.getByTestId('role-change-option-Alumni'),
      ).toBeDisabled();

      // Portal-side flip back → next page load returns the member to Active.
      await setPortalMemberStatus({ email: persona.email, status: 'active' });
      await page.goto('/profile');
      await pollDbRole(pool, persona.id, 'Active');
      audit = await fetchAuditRows(pool, persona.id);
      expect(audit).toHaveLength(2);
      expect(audit[1]).toMatchObject({
        from_role: 'Alumni',
        to_role: 'Active',
        initiator_kind: 'system',
      });
      await page.goto('/jobs/new');
      await expect(
        page.getByRole('heading', { name: 'Alumni only' }),
      ).toBeVisible();

      // A further identical load stays quiet — the projection is idempotent.
      await page.goto('/profile');
      await expect(
        page.getByTestId('role-change-option-Active'),
      ).toBeDisabled();
      expect(await fetchAuditRows(pool, persona.id)).toHaveLength(2);
      expect(errors).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});
