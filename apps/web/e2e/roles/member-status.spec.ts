import { test, expect } from '@playwright/test';
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
 * ADR-014 — member status via the portal registry, profile UI paths:
 *  - portal-backed flip (PUT → re-GET → role sync → refresh) with the access
 *    surface (nav) following;
 *  - no-registry-row hides the Active/Alumni control;
 *  - feature-off (route-level 404 shape) falls back to the local-only
 *    `users.changeRole` control exactly as before the portal contract.
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

test.describe('ADR-014 — member status on /profile', () => {
  test('portal-backed flip: Active ⇄ Alumni updates registry, role, and nav', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const persona = await seedPersona(pool, {
        email: `status-flip-${suffix}@chapter.test`,
        displayName: `Status Flip ${suffix}`,
        role: 'Active',
      });

      await reAuth(page, context, persona);
      await page.goto('/profile');
      await expect(page.getByTestId('profile-page')).toBeVisible();

      // Portal available + registry row (undeclared) → portal-backed control,
      // current pinned to the app role.
      const section = page.getByTestId('profile-status-section');
      await expect(section).toHaveAttribute('data-portal', 'on');
      await expect(
        page.getByTestId('role-change-dropdown'),
      ).toHaveAttribute('data-portal-backed', 'true');
      const activeBtn = page.getByTestId('role-change-option-Active');
      const alumniBtn = page.getByTestId('role-change-option-Alumni');
      await expect(activeBtn).toBeDisabled();
      await expect(activeBtn).toHaveText(/Active \(current\)/);

      // Flip to Alumni.
      await alumniBtn.click();
      await expect(page.getByTestId('member-status-saved')).toHaveText('Saved');

      // The registry (the only durable store) holds the declaration…
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        hasRow: true,
        status: 'alumni',
      });
      // …and the app role projection followed, audited with the user as
      // initiator.
      await pollDbRole(pool, persona.id, 'Alumni');
      const { rows } = await pool.query<{
        from_role: string;
        to_role: string;
        initiator_id: string | null;
        initiator_kind: string;
        note: string | null;
      }>(
        `SELECT from_role, to_role, initiator_id, initiator_kind, note
           FROM user_role_transitions WHERE user_id = $1
          ORDER BY created_at DESC LIMIT 1`,
        [persona.id],
      );
      expect(rows[0]).toMatchObject({
        from_role: 'Active',
        to_role: 'Alumni',
        initiator_id: persona.id,
        initiator_kind: 'user',
      });
      expect(rows[0]!.note).toContain('ADR-014');

      // Access surface follows: Alumni nav (post/postings), no enrollments.
      await expect
        .poll(async () =>
          (await page.getByTestId('profile-role').textContent())?.trim(),
          { timeout: 10_000 },
        )
        .toBe('Alumni');
      await expect(page.getByTestId('nav-link-/jobs/new')).toBeVisible();
      await expect(page.getByTestId('nav-link-/my-postings')).toBeVisible();
      await expect(page.getByTestId('nav-link-/my-enrollments')).toHaveCount(0);

      // Flip back to Active.
      await expect(page.getByTestId('role-change-option-Active')).toBeEnabled();
      await page.getByTestId('role-change-option-Active').click();
      await pollDbRole(pool, persona.id, 'Active');
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        hasRow: true,
        status: 'active',
      });
      await expect
        .poll(async () =>
          (await page.getByTestId('profile-role').textContent())?.trim(),
          { timeout: 10_000 },
        )
        .toBe('Active');
      await expect(page.getByTestId('nav-link-/my-enrollments')).toBeVisible();
      await expect(page.getByTestId('nav-link-/jobs/new')).toHaveCount(0);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('no linked registry row hides the Active/Alumni control', async ({
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
      await expect(page.getByTestId('profile-status-section')).toHaveAttribute(
        'data-portal',
        'no-registry-row',
      );
      await expect(page.getByTestId('role-change-dropdown')).toHaveCount(0);
      await expect(page.getByTestId('role-change-option-Active')).toHaveCount(0);
      await expect(page.getByTestId('role-change-option-Alumni')).toHaveCount(0);
      // The rest of the profile still renders.
      await expect(page.getByTestId('profile-role')).toHaveText('Active');
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });

  test('feature-off (portal endpoint missing) falls back to the local control', async ({
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
      // Route-level 404 shape — what every member sees until the portal
      // ships the endpoint (post-8/17).
      await setPortalMemberStatus({ email: persona.email, mode: 'absent' });

      await reAuth(page, context, persona);
      await page.goto('/profile');
      await expect(page.getByTestId('profile-status-section')).toHaveAttribute(
        'data-portal',
        'off',
      );
      // The fallback is the pre-ADR-014 local control (users.changeRole).
      const dropdown = page.getByTestId('role-change-dropdown');
      await expect(dropdown).toBeVisible();
      await expect(dropdown).not.toHaveAttribute('data-portal-backed', 'true');

      await page.getByTestId('role-change-option-Alumni').click();
      await pollDbRole(pool, persona.id, 'Alumni');
      const { rows } = await pool.query<{
        to_role: string;
        initiator_kind: string;
        note: string | null;
      }>(
        `SELECT to_role, initiator_kind, note
           FROM user_role_transitions WHERE user_id = $1
          ORDER BY created_at DESC LIMIT 1`,
        [persona.id],
      );
      // Local path: user-initiated changeRole, no portal note.
      expect(rows[0]).toMatchObject({
        to_role: 'Alumni',
        initiator_kind: 'user',
        note: null,
      });
      // The portal registry was NOT touched (feature off).
      expect(await getPortalMemberStatus(persona.email)).toMatchObject({
        status: null,
      });
      await expect
        .poll(async () =>
          (await page.getByTestId('profile-role').textContent())?.trim(),
          { timeout: 10_000 },
        )
        .toBe('Alumni');
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
