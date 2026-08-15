import { test, expect } from '@playwright/test';
import {
  createPool,
  seedPersona,
  truncateWalkingSkeleton,
} from './support/seed';
import { signInAs } from './support/personas';
import { setPortalMemberStatus } from '../fixtures/personas';

test.describe('walking-skeleton smoke — routes load', () => {
  test('every walking-skeleton route returns 200 (or redirects appropriately)', async ({
    page,
  }) => {
    const pool = createPool();
    try {
      await truncateWalkingSkeleton(pool);
      const admin = await seedPersona(pool, {
        email: 'admin@walking-skel.test',
        displayName: 'Admin',
        role: 'Admin',
      });
      // ADR-015: posting is gated on member STATUS, orthogonal to role — an
      // undeclared member (even an Admin) sees the StatusPrompt on /jobs/new,
      // not the posting form. Declare a status so the /jobs/new route renders
      // the posting UI this smoke test asserts.
      await setPortalMemberStatus({ email: admin.email, status: 'alumni' });

      // Public routes when signed-out.
      await page.goto('/login');
      await expect(page).toHaveURL(/\/login/);
      await page.goto('/signup?token=missing');
      await expect(page).toHaveURL(/\/signup/);

      // Authed routes — sign in as Admin so all walking-skeleton routes resolve.
      await signInAs(page, admin.email);

      await page.goto('/jobs');
      await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();
      await page.goto('/jobs/new');
      await expect(page.getByRole('heading', { name: 'Post a job' })).toBeVisible();
      await page.goto('/moderation-queue');
      await expect(
        page.getByRole('heading', { name: 'Moderation queue' }),
      ).toBeVisible();
    } finally {
      await pool.end();
    }
  });
});
