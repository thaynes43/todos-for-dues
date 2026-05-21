import { test, expect, type Page } from '@playwright/test';
import {
  approveAsMod,
  createPool,
  enrollAsActive,
  installPageerrorListener,
  newSuffix,
  postJob,
  reAuth,
  seedCast,
} from './support';

// MVP-FIX-A — Stale UI after mutation. The mutation `onSuccess` handlers in
// `apps/web/components/` invalidate the client-side React Query cache but do
// not call `router.refresh()`. Pages like `/jobs/[id]` are Next.js App Router
// SERVER components that fetch via the tRPC server-side caller at render time,
// so the server-rendered HTML stays frozen until full navigation.
//
// These four flows assert the post-mutation UI swap happens WITHOUT page
// navigation. They fail before the fix lands.

function assertNoNavigation(page: Page): { check: () => void } {
  const initialUrl = page.url();
  let navigated = false;
  const onFrameNavigated = () => {
    if (page.url() !== initialUrl) navigated = true;
  };
  page.on('framenavigated', onFrameNavigated);
  return {
    check: () => {
      page.off('framenavigated', onFrameNavigated);
      expect(navigated, `Expected no navigation away from ${initialUrl}`).toBe(
        false,
      );
    },
  };
}

test.describe('MVP-FIX-A — UI updates after mutation without page navigation', () => {
  test.beforeEach(({ page }) => installPageerrorListener(page));

  test('Active enrolls in enrollment_open job → EnrollButton swaps to UnenrollButton without navigation', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      const description = `Stale-UI enroll — ${suffix}`;
      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description);
      await approveAsMod(page, context, cast.mod, pool, jobId);

      // Active opens the job page; the EnrollButton is rendered (server-side).
      await reAuth(page, context, cast.active);
      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');
      await expect(page.getByTestId('enroll-button')).toBeVisible();
      await expect(page.getByTestId('unenroll-button')).toHaveCount(0);

      const nav = assertNoNavigation(page);
      await page.getByTestId('enroll-button').click();

      // Without `router.refresh()`, the server-rendered JobDetailView keeps
      // showing <EnrollButton>. The fix makes the swap visible within ~500ms.
      await expect(page.getByTestId('unenroll-button')).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByTestId('enroll-button')).toHaveCount(0);
      nav.check();
    } finally {
      await pool.end();
    }
  });

  test('Active unenrolls on /jobs/[id] → UnenrollButton swaps to EnrollButton without navigation', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      const description = `Stale-UI unenroll — ${suffix}`;
      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description);
      await approveAsMod(page, context, cast.mod, pool, jobId);
      await enrollAsActive(page, context, cast.active, pool, jobId);

      // Active re-opens the job page; the UnenrollButton is rendered.
      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');
      await expect(page.getByTestId('unenroll-button')).toBeVisible();
      await expect(page.getByTestId('enroll-button')).toHaveCount(0);

      const nav = assertNoNavigation(page);
      await page.getByTestId('unenroll-button').click();

      await expect(page.getByTestId('enroll-button')).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByTestId('unenroll-button')).toHaveCount(0);
      nav.check();
    } finally {
      await pool.end();
    }
  });

  test('Moderator approves on /jobs/[id] → action buttons disappear and state badge updates without navigation', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      const description = `Stale-UI approve — ${suffix}`;
      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description);

      // Mod opens the job (state = awaiting_moderation) — sees Approve/Reject.
      await reAuth(page, context, cast.mod);
      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');
      await expect(page.getByTestId('approve-button')).toBeVisible();
      await expect(page.getByTestId('job-state-badge')).toHaveAttribute(
        'data-state',
        'awaiting_moderation',
      );

      const nav = assertNoNavigation(page);
      await page.getByTestId('approve-button').click();

      // After approve, state moves to enrollment_open; the action affordances
      // for Moderator disappear and the badge updates.
      await expect(page.getByTestId('job-state-badge')).toHaveAttribute(
        'data-state',
        'enrollment_open',
        { timeout: 5_000 },
      );
      await expect(page.getByTestId('approve-button')).toHaveCount(0);
      await expect(page.getByTestId('reject-button')).toHaveCount(0);
      nav.check();
    } finally {
      await pool.end();
    }
  });

  test('Moderator rejects (with reason) on /jobs/[id] → rejected banner appears and action buttons disappear without navigation', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      const description = `Stale-UI reject — ${suffix}`;
      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description);

      // Mod opens the job — sees Approve/Reject.
      await reAuth(page, context, cast.mod);
      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');
      await expect(page.getByTestId('reject-button')).toBeVisible();

      // Open the reject modal, fill the reason, submit. The modal click itself
      // changes state on the same page (no nav). Begin nav-watch right before
      // the actual mutation click (reject-submit).
      await page.getByTestId('reject-button').click();
      const modal = page.getByTestId('reject-modal');
      await expect(modal).toBeVisible();
      await modal
        .getByTestId('reject-reason-textarea')
        .fill(`Not a chapter task — ${suffix}`);

      const nav = assertNoNavigation(page);
      await modal.getByTestId('reject-submit').click();

      // After reject, state moves to `rejected`; the RejectedJobBanner appears
      // and the action affordances are suppressed entirely (isTerminal === true).
      await expect(page.getByTestId('rejected-job-banner')).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByTestId('job-state-badge')).toHaveAttribute(
        'data-state',
        'rejected',
      );
      await expect(page.getByTestId('approve-button')).toHaveCount(0);
      await expect(page.getByTestId('reject-button')).toHaveCount(0);
      nav.check();
    } finally {
      await pool.end();
    }
  });
});
