import { test, expect, type Page } from '@playwright/test';
import type { Pool } from 'pg';
import {
  getPortalMemberStatus,
  setPortalMemberStatus,
} from '../fixtures/personas';
import {
  createPool,
  installPageerrorListener,
  newSuffix,
  reAuth,
  seedPersona,
} from './support';

/**
 * VALIDATION (ADR-014) — adversarial back-and-forth coverage for the member
 * status control. The merged member-status.spec.ts proves ONE round-trip;
 * the user requirement is "switch back and forth repeatedly and the entire
 * flow behaves", so this spec pins:
 *
 *  1. repeated Active ⇄ Alumni flips (3 full cycles) with registry, app role,
 *     and the audit chain staying coherent after every leg — plus the ACCESS
 *     surface (server-side gates on /jobs/new, /my-enrollments, /my-postings),
 *     not just the pill text;
 *  2. rapid double-click on the toggle never double-writes (exactly one
 *     audit row, no error surface);
 *  3. the feature-off fallback (portal endpoint missing) does full
 *     back-and-forth through the local users.changeRole path with the portal
 *     registry untouched;
 *  4. a declared portal status NEVER moves a privileged member (Moderator /
 *     Admin) — their profile keeps the privileged affordances and zero role
 *     transitions are written.
 *
 * Chapter-safe: seeds only its own UUID-suffixed personas, never demotes
 * admins — safe to collapse with the other chapter-safe roles specs.
 */

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

interface AuditRow {
  from_role: string;
  to_role: string;
  initiator_id: string | null;
  initiator_kind: string;
  note: string | null;
}

async function fetchAuditRows(pool: Pool, userId: string): Promise<AuditRow[]> {
  const { rows } = await pool.query<AuditRow>(
    `SELECT from_role, to_role, initiator_id, initiator_kind, note
       FROM user_role_transitions WHERE user_id = $1
      ORDER BY created_at, ctid`,
    [userId],
  );
  return rows;
}

/** Click the target side and wait for the control to mark it (current). */
async function flipTo(page: Page, role: 'Active' | 'Alumni'): Promise<void> {
  const btn = page.getByTestId(`role-change-option-${role}`);
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveText(new RegExp(`${role} \\(current\\)`));
}

test.describe('ADR-014 validation — member status back-and-forth', () => {
  test('three full Active ⇄ Alumni cycles stay coherent and move the access surface', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const persona = await seedPersona(pool, {
        email: `flip-cycles-${suffix}@chapter.test`,
        displayName: `Flip Cycles ${suffix}`,
        role: 'Active',
      });

      await reAuth(page, context, persona);
      await page.goto('/profile');
      await expect(page.getByTestId('profile-status-section')).toHaveAttribute(
        'data-portal',
        'on',
      );

      // Legs 1–4: two full cycles. After every leg the registry (the only
      // durable store) and the projected app role must agree.
      const legs: Array<{ role: 'Active' | 'Alumni'; status: 'active' | 'alumni' }> = [
        { role: 'Alumni', status: 'alumni' },
        { role: 'Active', status: 'active' },
        { role: 'Alumni', status: 'alumni' },
        { role: 'Active', status: 'active' },
      ];
      for (const leg of legs) {
        await flipTo(page, leg.role);
        await pollDbRole(pool, persona.id, leg.role);
        expect(await getPortalMemberStatus(persona.email)).toMatchObject({
          hasRow: true,
          status: leg.status,
        });
      }

      // Leg 5 → Alumni, then prove the SERVER-SIDE access gates (not just
      // nav pills) follow: Alumni can open the post-job form and my-postings,
      // and is bounced off /my-enrollments.
      await flipTo(page, 'Alumni');
      await pollDbRole(pool, persona.id, 'Alumni');
      await page.goto('/jobs/new');
      await expect(page.getByTestId('post-job-location')).toBeVisible();
      await page.goto('/my-postings');
      await expect(
        page.getByRole('heading', { name: 'My postings' }),
      ).toBeVisible();
      await page.goto('/my-enrollments');
      await expect(page).not.toHaveURL(/my-enrollments/); // server redirect('/')

      // Leg 6 → back to Active: gates flip the other way.
      await page.goto('/profile');
      await flipTo(page, 'Active');
      await pollDbRole(pool, persona.id, 'Active');
      await page.goto('/jobs/new');
      await expect(
        page.getByRole('heading', { name: 'Alumni only' }),
      ).toBeVisible();
      await expect(page.getByTestId('post-job-location')).toHaveCount(0);
      await page.goto('/my-enrollments');
      await expect(
        page.getByRole('heading', { name: 'My enrollments' }),
      ).toBeVisible();

      // Audit chain: exactly 6 legs, strictly alternating, every row
      // user-initiated through the ADR-014 path — no duplicates, no
      // system-sync echo rows fighting the user's flips.
      const audit = await fetchAuditRows(pool, persona.id);
      expect(audit).toHaveLength(6);
      const expectedChain = ['Alumni', 'Active', 'Alumni', 'Active', 'Alumni', 'Active'];
      expectedChain.forEach((toRole, i) => {
        expect(audit[i]).toMatchObject({
          from_role: toRole === 'Alumni' ? 'Active' : 'Alumni',
          to_role: toRole,
          initiator_id: persona.id,
          initiator_kind: 'user',
        });
        expect(audit[i]!.note).toContain('ADR-014');
      });
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('rapid double-click on the toggle writes exactly one transition', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const persona = await seedPersona(pool, {
        email: `dblclick-${suffix}@chapter.test`,
        displayName: `Dblclick ${suffix}`,
        role: 'Active',
      });

      await reAuth(page, context, persona);
      await page.goto('/profile');
      await expect(page.getByTestId('profile-status-section')).toHaveAttribute(
        'data-portal',
        'on',
      );

      // Two clicks in quick succession. After the first click the control
      // disables every option (in-flight guard) and keeps the target disabled
      // once it becomes "(current)" — so wait for the disabled state, then
      // genuinely attempt a second click with `force: true` (skips
      // Playwright's enabled-check, like a fast human double-click). Native
      // disabled buttons swallow the event either way. The same-tick race
      // (second click before React re-renders) can't be pinned
      // deterministically here — its server-side half is covered by the
      // idempotent-set case in member-status-cycles.test.ts and the handler
      // guard by the ProfileStatusSection unit suite.
      const alumniBtn = page.getByTestId('role-change-option-Alumni');
      await alumniBtn.click();
      await expect(alumniBtn).toBeDisabled(); // in-flight or already current
      await alumniBtn.click({ force: true }).catch(() => {});

      await pollDbRole(pool, persona.id, 'Alumni');
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        hasRow: true,
        status: 'alumni',
      });

      // Settle window, then: exactly ONE audit row, no error surface.
      await page.waitForTimeout(750);
      const audit = await fetchAuditRows(pool, persona.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        from_role: 'Active',
        to_role: 'Alumni',
        initiator_kind: 'user',
      });
      await expect(page.getByTestId('member-status-error')).toHaveCount(0);

      // A further force-click on the now-current side stays a no-op.
      await alumniBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      expect(await fetchAuditRows(pool, persona.id)).toHaveLength(1);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('feature-off fallback flips back and forth; the portal registry stays untouched', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const persona = await seedPersona(pool, {
        email: `fallback-cycles-${suffix}@chapter.test`,
        displayName: `Fallback Cycles ${suffix}`,
        role: 'Active',
      });
      // Route-level 404 — the live-portal shape until item 07 ships.
      await setPortalMemberStatus({ email: persona.email, mode: 'absent' });

      await reAuth(page, context, persona);
      await page.goto('/profile');
      await expect(page.getByTestId('profile-status-section')).toHaveAttribute(
        'data-portal',
        'off',
      );
      await expect(page.getByTestId('role-change-dropdown')).not.toHaveAttribute(
        'data-portal-backed',
        'true',
      );

      // Full back-and-forth (the merged spec only covers one leg): the local
      // users.changeRole path must survive repeated flips too.
      for (const leg of ['Alumni', 'Active', 'Alumni'] as const) {
        await flipTo(page, leg);
        await pollDbRole(pool, persona.id, leg);
      }

      const audit = await fetchAuditRows(pool, persona.id);
      expect(audit).toHaveLength(3);
      for (const row of audit) {
        expect(row.initiator_kind).toBe('user');
        expect(row.note).toBeNull(); // local path — no portal note
      }
      // Feature off ⇒ the registry was never written.
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        status: null,
      });

      // Access surface follows the local flips just the same.
      await expect(page.getByTestId('nav-link-/jobs/new')).toBeVisible();
      await expect(page.getByTestId('nav-link-/my-enrollments')).toHaveCount(0);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('a declared portal status never moves a privileged member', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const admin = await seedPersona(pool, {
        email: `priv-status-admin-${suffix}@chapter.test`,
        displayName: `Priv Admin ${suffix}`,
        role: 'Admin',
      });
      const mod = await seedPersona(pool, {
        email: `priv-status-mod-${suffix}@chapter.test`,
        displayName: `Priv Mod ${suffix}`,
        role: 'Moderator',
      });
      // Registry declares "alumni" for both — sign-in carries the status
      // claim, /profile runs memberStatus.get. Neither may re-role them.
      await setPortalMemberStatus({ email: admin.email, status: 'alumni' });
      await setPortalMemberStatus({ email: mod.email, status: 'alumni' });

      for (const persona of [admin, mod]) {
        await reAuth(page, context, persona);
        await page.goto('/profile');
        await expect(page.getByTestId('profile-page')).toBeVisible();
        // Privileged members keep the pre-ADR-014 step-down affordances;
        // the portal-backed status control never renders for them.
        await expect(page.getByTestId('profile-role-section')).toBeVisible();
        await expect(page.getByTestId('profile-status-section')).toHaveCount(0);
        await expect(page.getByTestId('profile-role')).toHaveText(persona.role);
        const { rows } = await pool.query<{ role: string }>(
          `SELECT role FROM users WHERE id = $1`,
          [persona.id],
        );
        expect(rows[0]?.role).toBe(persona.role);
        expect(await fetchAuditRows(pool, persona.id)).toHaveLength(0);
      }
      // Spot-check the privileged nav shape survived the declared status.
      await expect(page.getByTestId('nav-link-/moderation-queue')).toBeVisible();
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
