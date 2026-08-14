import { test, expect } from '@playwright/test';
import {
  approveAsMod,
  completeAsAlumni,
  createPool,
  enrollAsActive,
  installPageerrorListener,
  lockAsAlumni,
  markPaymentSentAsAlumni,
  newSuffix,
  postJob,
  reAuth,
  seedCast,
} from './support';

// MVP-FIX-B bundle — three small UX fixes from the post-deploy click-through.
//   #3: Main nav highlights the active route via aria-current="page".
//   #6: Confirm Received / Dispute hidden from the job poster on payment_sent;
//       still visible to Admin-non-poster (PRD-006 R-02) and enrolled Active.
//   #7: LockJobForm surfaces the server's "Work date must be in the future."
//       message instead of silently no-op-ing on a current/past date.

test.describe('MVP-FIX-B #3 — nav active-state highlight', () => {
  test.beforeEach(({ page }) => installPageerrorListener(page));

  test('Admin nav highlights the current route on /moderation-queue, /jobs, and /admin', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      await reAuth(page, context, cast.admin);

      await page.goto('/moderation-queue');
      await page.waitForLoadState('load');
      await expect(page.getByTestId('nav-link-/moderation-queue')).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByTestId('nav-link-/jobs')).toHaveAttribute(
        'data-active',
        'false',
      );

      await page.goto('/jobs');
      await page.waitForLoadState('load');
      await expect(page.getByTestId('nav-link-/jobs')).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByTestId('nav-link-/admin')).toHaveAttribute(
        'data-active',
        'false',
      );

      await page.goto('/admin');
      await page.waitForLoadState('load');
      await expect(page.getByTestId('nav-link-/admin')).toHaveAttribute(
        'aria-current',
        'page',
      );
    } finally {
      await pool.end();
    }
  });

  test('On /jobs/new, "Post a job" is the active link (longest-prefix match, not /jobs)', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      await reAuth(page, context, cast.alumni);

      await page.goto('/jobs/new');
      await page.waitForLoadState('load');
      await expect(page.getByTestId('nav-link-/jobs/new')).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByTestId('nav-link-/jobs')).toHaveAttribute(
        'data-active',
        'false',
      );
    } finally {
      await pool.end();
    }
  });
});

test.describe('MVP-FIX-B #6 — payment_sent role-gating on Confirm / Dispute', () => {
  test.beforeEach(({ page }) => installPageerrorListener(page));

  test('Alumni poster does NOT see Confirm Received / Dispute on payment_sent', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const description = `Polish #6 poster-hidden — ${suffix}`;

      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description);
      await approveAsMod(page, context, cast.mod, pool, jobId);
      await enrollAsActive(page, context, cast.active, pool, jobId);
      await lockAsAlumni(page, context, cast.alumni, pool, jobId);
      await completeAsAlumni(page, context, cast.alumni, pool, jobId);
      await markPaymentSentAsAlumni(page, context, cast.alumni, pool, jobId);

      // Alumni poster reopens the page in payment_sent — must see no Confirm
      // Received / Dispute buttons (they're waiting on the recipient).
      await reAuth(page, context, cast.alumni);
      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');
      const article = page.locator(`[data-testid="job-detail-view"]`);
      await expect(article).toBeVisible();
      // Job state should be payment_sent so we know we're viewing the right
      // condition.
      await expect(page.getByTestId('job-state-badge')).toHaveAttribute(
        'data-state',
        'payment_sent',
      );
      await expect(page.getByTestId('confirm-received-button')).toHaveCount(0);
      await expect(page.getByTestId('dispute-button')).toHaveCount(0);
    } finally {
      await pool.end();
    }
  });

  test('Enrolled Active DOES see Confirm Received + Dispute on payment_sent', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const description = `Polish #6 active-visible — ${suffix}`;

      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description);
      await approveAsMod(page, context, cast.mod, pool, jobId);
      await enrollAsActive(page, context, cast.active, pool, jobId);
      await lockAsAlumni(page, context, cast.alumni, pool, jobId);
      await completeAsAlumni(page, context, cast.alumni, pool, jobId);
      await markPaymentSentAsAlumni(page, context, cast.alumni, pool, jobId);

      await reAuth(page, context, cast.active);
      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');
      await expect(page.getByTestId('confirm-received-button')).toBeVisible();
      await expect(page.getByTestId('dispute-button')).toBeVisible();
    } finally {
      await pool.end();
    }
  });
});

test.describe('MVP-FIX-B #7 — LockJobForm surfaces server validation error', () => {
  test.beforeEach(({ page }) => installPageerrorListener(page));

  test('Submitting a current-time date renders the server "Work date must be in the future." message inline', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const description = `Polish #7 lock-error — ${suffix}`;

      await reAuth(page, context, cast.alumni);
      const jobId = await postJob(page, description);
      await approveAsMod(page, context, cast.mod, pool, jobId);
      await enrollAsActive(page, context, cast.active, pool, jobId);

      // Alumni opens the job (state = enrollment_open) and tries to lock with
      // a current-time work date. Server (jobs.lock procedure) rejects with
      // "Work date must be in the future."; the form must surface that.
      await reAuth(page, context, cast.alumni);
      await page.goto(`/jobs/${jobId}`);
      await page.waitForLoadState('load');

      // Use a time 1 second in the past to ensure the server clearly rejects;
      // by submit-time, even a "now" value will be in the past from server's
      // perspective anyway.
      const now = new Date(Date.now() - 1_000);
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      const localValue = now.toISOString().slice(0, 16);

      // LockJobForm's work-date is a CONTROLLED input (useState('')): a fill
      // that lands pre-hydration is wiped when React mounts, canSubmit stays
      // false, and the submit never enables (the exact trap documented on the
      // postJob helper — this spec predated the pattern and flaked on GHA:
      // PR #58 runs 31828264411 / 31830347256, 30s toBeEnabled timeout on
      // first attempt AND retry). Fill-and-check in a poll loop: if hydration
      // ate the value, fill again.
      const workDate = page.getByTestId('lock-job-work-date');
      const submit = page.getByTestId('lock-job-submit');
      await workDate.fill(localValue);
      await expect
        .poll(
          async () => {
            if (await submit.isEnabled().catch(() => false)) return true;
            await workDate.fill(localValue);
            return submit.isEnabled().catch(() => false);
          },
          { timeout: 30_000, intervals: [500, 1000, 2000] },
        )
        .toBe(true);
      await submit.click();

      const alert = page.getByTestId('lock-job-error');
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(alert).toHaveAttribute('role', 'alert');
      await expect(alert).toHaveText('Work date must be in the future.');
    } finally {
      await pool.end();
    }
  });
});
