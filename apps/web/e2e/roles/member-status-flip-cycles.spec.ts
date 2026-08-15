import { test, expect, type Page } from '@playwright/test';
import {
  getPortalMemberStatus,
  type MemberStatus,
} from '../fixtures/personas';
import {
  countRoleTransitions,
  createPool,
  getRoleFromDb,
  installPageerrorListener,
  newSuffix,
  reAuth,
  seedPersona,
} from './support';

/**
 * VALIDATION (ADR-015) — adversarial back-and-forth coverage for the member
 * status control under the orthogonality model. Status flips move the ACCESS
 * surface only; the role pill NEVER changes and ZERO `user_role_transitions`
 * rows are written from a status flip. This spec pins:
 *
 *  1. repeated active ⇄ alumni flips (3 full cycles) with the registry staying
 *     coherent after every leg, the role fixed at Member, and no role
 *     transitions accumulating;
 *  2. a flip moving the server-side access gates (/jobs/new, /my-postings,
 *     /my-enrollments) in both directions — role fixed;
 *  3. rapid double-click on the toggle never writes a role transition and never
 *     surfaces an error;
 *  4. a status flip NEVER moves a privileged member (Moderator / Admin): their
 *     role pill + privileged nav survive and zero role transitions are written.
 *
 * Chapter-safe: seeds only its own UUID-suffixed personas, never demotes
 * admins.
 */

/** Click a status side and wait for the control to mark it current. */
async function flipStatus(page: Page, status: MemberStatus): Promise<void> {
  const btn = page.getByTestId(`member-status-option-${status}`);
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toHaveAttribute('data-is-current', 'true');
}

test.describe('ADR-015 validation — member status back-and-forth', () => {
  test('three full active ⇄ alumni cycles stay coherent; role fixed at Member, zero role transitions', async ({
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
      expect(persona.role).toBe('Member');

      await reAuth(page, context, persona);
      await page.goto('/profile');
      const section = page.getByTestId('member-status-section');
      await expect(section).toHaveAttribute('data-portal', 'on');
      await expect(section).toHaveAttribute('data-current-status', 'active');
      await expect(page.getByTestId('profile-role')).toHaveText('Member');

      // Six legs = three full cycles. After every leg the registry (the only
      // durable store) must agree and the role must stay put.
      const legs: MemberStatus[] = [
        'alumni',
        'active',
        'alumni',
        'active',
        'alumni',
        'active',
      ];
      for (const leg of legs) {
        await flipStatus(page, leg);
        await expect(section).toHaveAttribute('data-current-status', leg);
        expect(await getPortalMemberStatus(persona.email)).toMatchObject({
          hasRow: true,
          status: leg,
        });
        await expect(page.getByTestId('profile-role')).toHaveText('Member');
      }

      // Not a single role transition fired across six status flips.
      expect(await getRoleFromDb(pool, persona.id)).toBe('Member');
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('a flip moves the server-side access gates in both directions; role fixed', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const persona = await seedPersona(pool, {
        email: `flip-gates-${suffix}@chapter.test`,
        displayName: `Flip Gates ${suffix}`,
        role: 'Active',
      });

      await reAuth(page, context, persona);
      await page.goto('/profile');
      await expect(page.getByTestId('member-status-section')).toHaveAttribute(
        'data-portal',
        'on',
      );

      // Flip → Alumni, then prove the SERVER-SIDE access gates (not just nav
      // pills) follow: alumni can open the post-job form and my-postings, and
      // is bounced off /my-enrollments.
      await flipStatus(page, 'alumni');
      await page.goto('/jobs/new');
      await expect(page.getByTestId('post-job-location')).toBeVisible();
      await page.goto('/my-postings');
      await expect(
        page.getByRole('heading', { name: 'My postings' }),
      ).toBeVisible();
      await page.goto('/my-enrollments');
      await expect(page).not.toHaveURL(/my-enrollments/); // server redirect('/')

      // Flip back → Active: gates invert.
      await page.goto('/profile');
      await flipStatus(page, 'active');
      await page.goto('/jobs/new');
      await expect(
        page.getByRole('heading', { name: 'Alumni only' }),
      ).toBeVisible();
      await expect(page.getByTestId('post-job-location')).toHaveCount(0);
      await page.goto('/my-enrollments');
      await expect(
        page.getByRole('heading', { name: 'My enrollments' }),
      ).toBeVisible();
      await page.goto('/my-postings');
      await expect(page).not.toHaveURL(/my-postings/); // server redirect('/')

      // The role never moved through all that gate churn.
      await page.goto('/profile');
      await expect(page.getByTestId('profile-role')).toHaveText('Member');
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('rapid double-click on the toggle writes no role transition and no error', async ({
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
      await expect(page.getByTestId('member-status-section')).toHaveAttribute(
        'data-portal',
        'on',
      );

      // Two clicks in quick succession. After the first click the control
      // disables the option (in-flight guard) and keeps it disabled once it is
      // "(current)" — so wait for the disabled state, then attempt a genuine
      // second click with `force: true` (skips the enabled-check, like a fast
      // human double-click). Native disabled buttons swallow the event.
      const alumniBtn = page.getByTestId('member-status-option-alumni');
      await alumniBtn.click();
      await expect(alumniBtn).toBeDisabled(); // in-flight or already current
      await alumniBtn.click({ force: true }).catch(() => {});

      await expect(page.getByTestId('member-status-section')).toHaveAttribute(
        'data-current-status',
        'alumni',
      );
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        hasRow: true,
        status: 'alumni',
      });

      // Settle window, then: NO role transition, no error surface, role fixed.
      await page.waitForTimeout(750);
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);
      expect(await getRoleFromDb(pool, persona.id)).toBe('Member');
      await expect(page.getByTestId('member-status-error')).toHaveCount(0);

      // A further force-click on the now-current side stays a no-op.
      await alumniBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('a status flip never moves a privileged member (Moderator / Admin)', async ({
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

      // Both are undeclared members (bare Admin/Moderator carry no status), so
      // the orthogonal control renders for them too (ADR-015 — no privileged
      // split). Declaring/flipping a status must not touch their role.
      for (const persona of [admin, mod]) {
        await reAuth(page, context, persona);
        await page.goto('/profile');
        await expect(page.getByTestId('profile-page')).toBeVisible();
        await expect(page.getByTestId('profile-role')).toHaveText(persona.role);
        const section = page.getByTestId('member-status-section');
        await expect(section).toHaveAttribute('data-portal', 'on');
        await expect(section).toHaveAttribute('data-current-status', 'none');

        await flipStatus(page, 'alumni');
        expect(await getPortalMemberStatus(persona.email)).toMatchObject({
          hasRow: true,
          status: 'alumni',
        });
        // Role pill + DB role fixed; not one role transition written.
        await expect(page.getByTestId('profile-role')).toHaveText(persona.role);
        expect(await getRoleFromDb(pool, persona.id)).toBe(persona.role);
        expect(await countRoleTransitions(pool, persona.id)).toBe(0);
        // Privileged nav survives the declared status.
        await expect(
          page.getByTestId('nav-link-/moderation-queue'),
        ).toBeVisible();
      }
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
