import { test, expect } from '@playwright/test';
import {
  createPool,
  newSuffix,
  pollJobState,
  postJob,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-002 R-11 + AC-14 — /my-postings list', () => {
  test('Alumni posts 3 jobs (approved, awaiting, rejected); list shows all 3 most-recent first', async ({
    page,
    context,
  }) => {
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);

      const titles = [
        `MyPostings A — ${suffix}`,
        `MyPostings B — ${suffix}`,
        `MyPostings C — ${suffix}`,
      ];

      // Job 1: post + approve.
      await reAuth(page, context, cast.alumni);
      const job1 = await postJob(page, titles[0]!);
      await reAuth(page, context, cast.mod);
      await page.goto('/moderation-queue');
      await page
        .locator(`[data-job-id="${job1}"]`)
        .getByTestId('approve-button')
        .click();
      await expect
        .poll(async () => {
          const { rows } = await pool.query<{ state: string }>(
            `SELECT state FROM jobs WHERE id = $1`,
            [job1],
          );
          return rows[0]?.state;
        })
        .toBe('enrollment_open');

      // Job 2: post + leave awaiting.
      await reAuth(page, context, cast.alumni);
      const job2 = await postJob(page, titles[1]!);

      // Job 3: post + reject.
      const job3 = await postJob(page, titles[2]!);
      await reAuth(page, context, cast.mod);
      await page.goto('/moderation-queue');
      await page
        .locator(`[data-job-id="${job3}"]`)
        .getByTestId('reject-button')
        .click();
      await page
        .getByTestId('reject-reason-textarea')
        .fill(`Rejected for the my-postings spec — ${suffix}`);
      await page.getByTestId('reject-submit').click();
      await pollJobState(pool, job3, 'rejected');

      // Alumni opens /my-postings.
      await reAuth(page, context, cast.alumni);
      await page.goto('/my-postings');

      // All 3 rows visible.
      const rows = page.locator('[data-testid="my-postings-row"]').filter({
        has: page.locator(
          `[data-job-id="${job1}"], [data-job-id="${job2}"], [data-job-id="${job3}"]`,
        ),
      });
      for (const id of [job1, job2, job3]) {
        await expect(
          page.locator(`[data-testid="my-postings-row"][data-job-id="${id}"]`),
        ).toBeVisible();
      }
      void rows;

      // Most-recent-first: the order in the rendered list of OUR three job
      // ids matches job3 → job2 → job1 (created in that order).
      const ourIds = await page
        .locator('[data-testid="my-postings-row"]')
        .evaluateAll((els) =>
          els.map((el) => el.getAttribute('data-job-id')!).filter(Boolean),
        );
      const orderedOurs = ourIds.filter((id) => [job1, job2, job3].includes(id));
      expect(orderedOurs).toEqual([job3, job2, job1]);

      // Clicking the rejected row → banner visible on detail.
      await page
        .locator(`[data-testid="my-postings-row"][data-job-id="${job3}"]`)
        .getByRole('link')
        .first()
        .click();
      await page.waitForURL(new RegExp(`/jobs/${job3}$`));
      await expect(page.getByTestId('rejected-job-banner')).toBeVisible();
    } finally {
      await pool.end();
    }
  });
});
