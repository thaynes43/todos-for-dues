import { test, expect, type Page } from '@playwright/test';
import {
  getPortalMemberStatus,
  setPortalMemberStatus,
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
 * ADR-015 — member status via the portal registry, profile UI paths. Status
 * (active|alumni) is FULLY ORTHOGONAL to role: flipping it moves the ACCESS
 * surfaces (nav links + server-side page gates) but the role pill NEVER changes
 * and ZERO `user_role_transitions` rows are ever written.
 *
 *  - portal-backed flip (active ⇄ alumni) updates the registry and the access
 *    surface, role pill fixed;
 *  - no linked registry row (409) hides the control — for a plain member AND an
 *    Admin (the owner scenario: role stays Admin, control hidden, zero role
 *    transitions);
 *  - portal unavailable hides the control (data-portal="off"). There is NO local
 *    fallback anymore.
 *
 * Chapter-safe: seeds only its own UUID-suffixed personas, never demotes
 * admins — safe to collapse with the other chapter-safe roles specs.
 */

/** Click a status side and wait for the control to mark it current. */
async function flipStatus(page: Page, status: MemberStatus): Promise<void> {
  const btn = page.getByTestId(`member-status-option-${status}`);
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toHaveAttribute('data-is-current', 'true');
}

test.describe('ADR-015 — member status on /profile (orthogonal to role)', () => {
  test('portal-backed flip: active ⇄ alumni moves the access surface, role pill stays Member', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      // Legacy 'Active' → a plain Member whose portal status is active.
      const persona = await seedPersona(pool, {
        email: `status-flip-${suffix}@chapter.test`,
        displayName: `Status Flip ${suffix}`,
        role: 'Active',
      });
      expect(persona.role).toBe('Member');

      await reAuth(page, context, persona);
      await page.goto('/profile');
      await expect(page.getByTestId('profile-page')).toBeVisible();
      // Role pill is display-only and shows the DB role.
      await expect(page.getByTestId('profile-role')).toHaveText('Member');

      // Portal available + declared status (active) → portal-backed control,
      // current pinned to the declared status.
      const section = page.getByTestId('member-status-section');
      await expect(section).toHaveAttribute('data-portal', 'on');
      await expect(section).toHaveAttribute('data-current-status', 'active');
      const activeBtn = page.getByTestId('member-status-option-active');
      await expect(activeBtn).toHaveAttribute('data-is-current', 'true');
      await expect(activeBtn).toBeDisabled();
      await expect(activeBtn).toHaveText(/Active \(current\)/);

      // Flip to Alumni.
      await flipStatus(page, 'alumni');
      await expect(page.getByTestId('member-status-saved')).toHaveText('Saved');
      await expect(section).toHaveAttribute('data-current-status', 'alumni');

      // The registry (the only durable store) holds the declaration…
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        hasRow: true,
        status: 'alumni',
      });
      // …the role pill NEVER moved and NO role transition was written.
      await expect(page.getByTestId('profile-role')).toHaveText('Member');
      expect(await getRoleFromDb(pool, persona.id)).toBe('Member');
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);

      // Access surface follows status: alumni → post / my-postings, no
      // enrollments (router.refresh re-rendered the server nav).
      await expect(page.getByTestId('nav-link-/jobs/new')).toBeVisible();
      await expect(page.getByTestId('nav-link-/my-postings')).toBeVisible();
      await expect(page.getByTestId('nav-link-/my-enrollments')).toHaveCount(0);

      // Flip back to Active: access surface inverts, role pill still fixed.
      await flipStatus(page, 'active');
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        hasRow: true,
        status: 'active',
      });
      await expect(page.getByTestId('nav-link-/my-enrollments')).toBeVisible();
      await expect(page.getByTestId('nav-link-/jobs/new')).toHaveCount(0);
      await expect(page.getByTestId('profile-role')).toHaveText('Member');
      expect(await getRoleFromDb(pool, persona.id)).toBe('Member');
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('no linked registry row (409) hides the control; role pill stays Member', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const persona = await seedPersona(pool, {
        email: `status-norow-${suffix}@chapter.test`,
        displayName: `Status NoRow ${suffix}`,
        role: 'Active',
      });
      await setPortalMemberStatus({ email: persona.email, hasRow: false });

      await reAuth(page, context, persona);
      await page.goto('/profile');
      await expect(page.getByTestId('profile-page')).toBeVisible();
      const section = page.getByTestId('member-status-section');
      await expect(section).toHaveAttribute('data-portal', 'no-registry-row');
      // Control hidden entirely — no toggle options.
      await expect(page.getByTestId('member-status-option-active')).toHaveCount(0);
      await expect(page.getByTestId('member-status-option-alumni')).toHaveCount(0);
      // The rest of the profile still renders; role untouched.
      await expect(page.getByTestId('profile-role')).toHaveText('Member');
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('owner scenario: an Admin with no registry row keeps Admin, control hidden, zero role transitions', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const admin = await seedPersona(pool, {
        email: `status-owner-admin-${suffix}@chapter.test`,
        displayName: `Owner Admin ${suffix}`,
        role: 'Admin',
      });
      expect(admin.role).toBe('Admin');
      // The portal has no linked roster row for this owner (409 shape).
      await setPortalMemberStatus({ email: admin.email, hasRow: false });

      await reAuth(page, context, admin);
      await page.goto('/profile');
      await expect(page.getByTestId('profile-page')).toBeVisible();
      // Role pill stays Admin; the status control is hidden (nothing to declare
      // against) — status is orthogonal and never touches the Admin role.
      await expect(page.getByTestId('profile-role')).toHaveText('Admin');
      await expect(page.getByTestId('member-status-section')).toHaveAttribute(
        'data-portal',
        'no-registry-row',
      );
      await expect(page.getByTestId('member-status-option-active')).toHaveCount(0);
      await expect(page.getByTestId('member-status-option-alumni')).toHaveCount(0);
      expect(await getRoleFromDb(pool, admin.id)).toBe('Admin');
      expect(await countRoleTransitions(pool, admin.id)).toBe(0);
      // Privileged nav survives regardless of member status.
      await expect(page.getByTestId('nav-link-/moderation-queue')).toBeVisible();
      await expect(page.getByTestId('nav-link-/admin')).toBeVisible();
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('portal unavailable hides the control (data-portal="off"); no local fallback', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const persona = await seedPersona(pool, {
        email: `status-off-${suffix}@chapter.test`,
        displayName: `Status Off ${suffix}`,
        role: 'Active',
      });
      // Route-level 404 shape = portal member-status endpoint unavailable.
      await setPortalMemberStatus({ email: persona.email, mode: 'absent' });

      await reAuth(page, context, persona);
      await page.goto('/profile');
      await expect(page.getByTestId('member-status-section')).toHaveAttribute(
        'data-portal',
        'off',
      );
      // No toggle, and (ADR-015) NO local role fallback control exists anymore.
      await expect(page.getByTestId('member-status-option-active')).toHaveCount(0);
      await expect(page.getByTestId('member-status-option-alumni')).toHaveCount(0);
      await expect(page.getByTestId('profile-role')).toHaveText('Member');
      expect(await countRoleTransitions(pool, persona.id)).toBe(0);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
