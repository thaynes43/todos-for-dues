import { test, expect } from '@playwright/test';
import {
  approveAsMod,
  createPool,
  enrollAsActive,
  installPageerrorListener,
  lockAsAlumni,
  newSuffix,
  postJob,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-004 R-06 — /my-enrollments list', () => {
  test.beforeEach(({ page }) => installPageerrorListener(page));

  test('Active enrolled in (locked + future date) and (enrollment_open) → locked listed first', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      // Job A — will be locked with a future date.
      await reAuth(page, context, cast.alumni);
      const jobA = await postJob(page, `MyEnroll A — ${suffix}`);
      await approveAsMod(page, context, cast.mod, pool, jobA);
      await enrollAsActive(page, context, cast.active, pool, jobA);
      await lockAsAlumni(page, context, cast.alumni, pool, jobA);

      // Job B — will be left in enrollment_open.
      await reAuth(page, context, cast.alumni);
      const jobB = await postJob(page, `MyEnroll B — ${suffix}`);
      await approveAsMod(page, context, cast.mod, pool, jobB);
      await enrollAsActive(page, context, cast.active, pool, jobB);

      // Active opens /my-enrollments.
      await reAuth(page, context, cast.active);
      await page.goto('/my-enrollments');

      const orderedOurs = await page
        .locator('[data-testid="my-enrollments-row"]')
        .evaluateAll((els) =>
          els.map((el) => el.getAttribute('data-job-id')!).filter(Boolean),
        );
      const ours = orderedOurs.filter((id) => id === jobA || id === jobB);
      // Locked job (jobA) listed first.
      expect(ours).toEqual([jobA, jobB]);
    } finally {
      await pool.end();
    }
  });
});
