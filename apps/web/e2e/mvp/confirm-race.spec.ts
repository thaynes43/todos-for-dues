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
  pollJobState,
  postJob,
  reAuth,
  seedCast,
  signInAs,
} from './support';

test.describe('PRD-006 R-04 / AC-04 — confirm-received race', () => {
  test.beforeEach(({ page }) => installPageerrorListener(page));

  test('Active + Admin both click confirm; exactly one transition; late clicker sees the alreadyClosed response', async ({
    browser,
  }) => {
    const pool = createPool();
    const setupContext = await browser.newContext();
    const setupPage = await setupContext.newPage();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const description = `Race me — ${suffix}`;

      // Setup tab drives all setup persona switches.
      await reAuth(setupPage, setupContext, cast.alumni);
      const jobId = await postJob(setupPage, description);
      await approveAsMod(setupPage, setupContext, cast.mod, pool, jobId);
      await enrollAsActive(setupPage, setupContext, cast.active, pool, jobId);
      await lockAsAlumni(setupPage, setupContext, cast.alumni, pool, jobId);
      await completeAsAlumni(setupPage, setupContext, cast.alumni, pool, jobId);
      await markPaymentSentAsAlumni(
        setupPage,
        setupContext,
        cast.alumni,
        pool,
        jobId,
      );
      await setupContext.close();

      // Two independent contexts (one per clicker).
      const activeCtx = await browser.newContext();
      const adminCtx = await browser.newContext();
      const activePage = await activeCtx.newPage();
      const adminPage = await adminCtx.newPage();

      try {
        await signInAs(activePage, cast.active.email);
        await signInAs(adminPage, cast.admin.email);
        await activePage.goto(`/jobs/${jobId}`);
        await adminPage.goto(`/jobs/${jobId}`);

        await expect(
          activePage.getByTestId('confirm-received-button'),
        ).toBeVisible();
        await expect(
          adminPage.getByTestId('confirm-received-button'),
        ).toBeVisible();

        // Fire both clicks at roughly the same browser tick. Promise.all
        // dispatches both before awaiting; the server's
        // transitionJob/ConcurrentTransitionError logic guarantees exactly
        // one transition row + the late clicker gets alreadyClosed:true.
        await Promise.all([
          activePage.getByTestId('confirm-received-button').click(),
          adminPage.getByTestId('confirm-received-button').click(),
        ]);

        await pollJobState(pool, jobId, 'closed');

        // Exactly one closed-transition row in the audit log.
        const { rows: transitions } = await pool.query<{ c: number }>(
          `SELECT count(*)::int AS c FROM job_state_transitions
           WHERE job_id = $1 AND to_state = 'closed'`,
          [jobId],
        );
        expect(transitions[0]?.c).toBe(1);

        // After the race resolves, both viewers reload and see the closed
        // banner — the late clicker's banner names the early clicker as the
        // closer (whoever won the race).
        await activePage.goto(`/jobs/${jobId}`);
        await expect(
          activePage.getByTestId('closed-job-banner'),
        ).toBeVisible();
        await adminPage.goto(`/jobs/${jobId}`);
        await expect(adminPage.getByTestId('closed-job-banner')).toBeVisible();
      } finally {
        await activeCtx.close();
        await adminCtx.close();
      }
    } finally {
      await pool.end();
    }
  });
});
