import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { readRuntimeEnv } from '../fixtures/runtime-env';
import {
  getPortalMemberStatus,
  setPortalMemberStatus,
  signInAs,
  type MemberStatus,
} from '../fixtures/personas';
import { seedPersona } from '../walking-skeleton/support/seed';

/**
 * VALIDATION (ADR-015) — the two sync channels (status claim at sign-in,
 * memberStatus.get on page load) roundtrip cleanly, and status is ORTHOGONAL to
 * role throughout: the role pill stays Member and ZERO `user_role_transitions`
 * rows are written no matter how status moves.
 *
 *  1. an in-app flip (PUT → registry) survives sign-out/sign-in — the fresh
 *     id_token status claim agrees with the registry, the role never moves;
 *  2. a portal-side registry edit lands on the next dues PAGE LOAD and moves the
 *     server-side access gates, again without touching the role.
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

async function dbRole(pool: Pool, userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.role ?? null;
}

/** Click a status side and wait for the control to mark it current. */
async function flipStatus(page: Page, status: MemberStatus): Promise<void> {
  const btn = page.getByTestId(`member-status-option-${status}`);
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toHaveAttribute('data-is-current', 'true');
}

test.describe('ADR-015 validation — flip / sign-in round-trips (role orthogonal)', () => {
  test('an in-app flip survives sign-out/sign-in; role stays Member, zero role transitions', async ({
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
      expect(persona.role).toBe('Member');

      // In-app flip to Alumni through the portal-backed control.
      await signInAs(page, persona.email);
      await page.goto('/profile');
      await expect(page.getByTestId('member-status-section')).toHaveAttribute(
        'data-current-status',
        'active',
      );
      await flipStatus(page, 'alumni');
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        hasRow: true,
        status: 'alumni',
      });
      expect(await dbRole(pool, persona.id)).toBe('Member');
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);

      // Sign out, sign back in. The freshly-minted id_token snapshots the
      // registry (status=alumni), which AGREES with what the member chose —
      // and since status is orthogonal to role, nothing moves either way.
      await page.context().clearCookies();
      await signInAs(page, persona.email);
      await page.goto('/profile');
      await expect(page.getByTestId('member-status-section')).toHaveAttribute(
        'data-current-status',
        'alumni',
      );
      await expect(page.getByTestId('profile-role')).toHaveText('Member');
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);

      // Flip back to Active in-app, then round-trip the session again.
      await flipStatus(page, 'active');
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        status: 'active',
      });
      await page.context().clearCookies();
      await signInAs(page, persona.email);
      await page.goto('/profile');
      await expect(page.getByTestId('member-status-section')).toHaveAttribute(
        'data-current-status',
        'active',
      );

      // Role never moved and no role transition was ever written.
      expect(await dbRole(pool, persona.id)).toBe('Member');
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await pool.end();
    }
  });

  test('a portal-side edit lands on the next page load and moves the access gates; role fixed', async ({
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
      await expect(page.getByTestId('member-status-section')).toHaveAttribute(
        'data-current-status',
        'active',
      );

      // Member flips to alumni in the PORTAL settings page mid-session…
      await setPortalMemberStatus({ email: persona.email, status: 'alumni' });

      // …and the dues app picks it up on the NEXT page load (no re-sign-in):
      // memberStatus.get / the server gate read fresh from the registry.
      await page.goto('/profile');
      await expect(page.getByTestId('member-status-section')).toHaveAttribute(
        'data-current-status',
        'alumni',
      );
      await expect(page.getByTestId('profile-role')).toHaveText('Member');

      // The ACCESS surface follows on the next navigation: the server-side gate
      // now treats the member as a poster (status alumni → canPost).
      await page.goto('/jobs/new');
      await expect(page.getByTestId('post-job-location')).toBeVisible();

      // Portal-side flip back → next page load returns the member to the
      // claiming side (status active → canPost false).
      await setPortalMemberStatus({ email: persona.email, status: 'active' });
      await page.goto('/jobs/new');
      await expect(
        page.getByRole('heading', { name: 'Alumni only' }),
      ).toBeVisible();

      // Throughout the portal-driven status churn, the role never moved and not
      // one role transition was written.
      expect(await dbRole(pool, persona.id)).toBe('Member');
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});
