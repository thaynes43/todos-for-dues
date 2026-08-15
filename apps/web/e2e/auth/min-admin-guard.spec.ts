import { test, expect } from '@playwright/test';
import { readRuntimeEnv } from '../fixtures/runtime-env';
import { registerPortalIdentity, signInAs } from '../fixtures/personas';
import { seedPersona } from '../walking-skeleton/support/seed';
import {
  createPool,
  demoteAllOtherAdmins,
  fetchBootstrapAdminIds,
  restoreAdmins,
} from '../roles/support';

/**
 * ADR-013 min-Admin conflict guard: when portal claims demote the LAST
 * Admin, the min-1-Admin trigger (migration 0003/0008) blocks the
 * transition — the sign-in must still succeed and the user keeps Admin
 * (loud log; demotion lands once another Admin exists).
 *
 * NEEDS ITS OWN PLAYWRIGHT INVOCATION (fresh DB): depends on chapter-wide
 * count(Admin) = 1 at sign-in time, and races walking-skeleton's
 * BOOTSTRAP_ADMIN signin path (see .github/workflows/e2e.yml).
 */

test.describe('ADR-013 — min-Admin guard on claim-sync demotion', () => {
  test('last Admin with brother tier keeps Admin; sign-in survives', async ({
    page,
  }) => {
    void readRuntimeEnv(); // fail fast if globalSetup didn't run
    const pool = createPool();
    let demoted: string[] = [];
    try {
      const lastAdmin = await seedPersona(pool, {
        email: 'last-admin@chapter.test',
        displayName: 'Last Admin',
        role: 'Admin',
      });
      // The portal says brother (stale/demoted claims).
      await registerPortalIdentity({
        email: lastAdmin.email,
        name: lastAdmin.displayName,
        tier: 'brother',
        sub: lastAdmin.id,
      });

      // Make them the chapter's ONLY Admin (demote the globalSetup Admin).
      const bootstrapIds = await fetchBootstrapAdminIds(pool);
      demoted = await demoteAllOtherAdmins(pool, bootstrapIds, lastAdmin.id);

      await signInAs(page, lastAdmin.email); // must land signed-in, not error

      const role = await pool.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [lastAdmin.id],
      );
      expect(role.rows[0]?.role).toBe('Admin');

      // No half-written demotion audit rows (transition aborted at COMMIT).
      const audit = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM user_role_transitions
         WHERE user_id = $1`,
        [lastAdmin.id],
      );
      expect(audit.rows[0]?.count).toBe('0');
    } finally {
      await restoreAdmins(pool, demoted);
      await pool.end();
    }
  });
});
