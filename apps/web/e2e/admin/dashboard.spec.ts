import { test, expect } from '@playwright/test';
import type { Pool } from 'pg';
import {
  approveAsMod,
  cancelAsAlumni,
  completeAsAlumni,
  createPool,
  enrollAsActive,
  installPageerrorListener,
  lockAsAlumni,
  markPaymentSentAsAlumni,
  newSuffix,
  postJob,
  reAuth,
  rejectAsMod,
  seedCast,
  uniqueDescription,
  type Cast,
} from './support';

async function countByStateForDescriptions(
  pool: Pool,
  descriptions: string[],
  state: string,
): Promise<number> {
  if (descriptions.length === 0) return 0;
  const { rows } = await pool.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM jobs WHERE state = $1 AND description = ANY($2::text[])`,
    [state, descriptions],
  );
  return rows[0]?.c ?? 0;
}

test.describe('PRD-007 AC-03 / AC-04 — Dashboard aggregate counts', () => {
  test('seeded jobs show in aggregate counts; clicking a card filters /jobs', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast: Cast = await seedCast(pool, suffix);

      const descriptions: string[] = [];

      // Two awaiting_moderation jobs (just post — don't approve).
      await reAuth(page, context, cast.alumni);
      const aw1 = await postJob(page, uniqueDescription(`aw1-${suffix}`));
      const aw2 = await postJob(page, uniqueDescription(`aw2-${suffix}`));
      descriptions.push(
        (
          await pool.query<{ description: string }>(
            'SELECT description FROM jobs WHERE id = $1',
            [aw1],
          )
        ).rows[0]!.description,
        (
          await pool.query<{ description: string }>(
            'SELECT description FROM jobs WHERE id = $1',
            [aw2],
          )
        ).rows[0]!.description,
      );

      // One enrollment_open: post + approve.
      await reAuth(page, context, cast.alumni);
      const eo1 = await postJob(page, uniqueDescription(`eo1-${suffix}`));
      descriptions.push(
        (
          await pool.query<{ description: string }>(
            'SELECT description FROM jobs WHERE id = $1',
            [eo1],
          )
        ).rows[0]!.description,
      );
      await approveAsMod(page, context, cast.mod, pool, eo1);

      // One payment_sent: drive through full chain.
      await reAuth(page, context, cast.alumni);
      const ps1 = await postJob(page, uniqueDescription(`ps1-${suffix}`));
      const ps1Desc = (
        await pool.query<{ description: string }>(
          'SELECT description FROM jobs WHERE id = $1',
          [ps1],
        )
      ).rows[0]!.description;
      descriptions.push(ps1Desc);
      await approveAsMod(page, context, cast.mod, pool, ps1);
      await enrollAsActive(page, context, cast.active, pool, ps1);
      await lockAsAlumni(page, context, cast.alumni, pool, ps1);
      await completeAsAlumni(page, context, cast.alumni, pool, ps1);
      await markPaymentSentAsAlumni(page, context, cast.alumni, pool, ps1);

      // One rejected: post + reject.
      await reAuth(page, context, cast.alumni);
      const rj1 = await postJob(page, uniqueDescription(`rj1-${suffix}`));
      descriptions.push(
        (
          await pool.query<{ description: string }>(
            'SELECT description FROM jobs WHERE id = $1',
            [rj1],
          )
        ).rows[0]!.description,
      );
      await rejectAsMod(page, context, cast.mod, pool, rj1, `rej-${suffix}`);

      // One cancelled: post + approve + cancel.
      await reAuth(page, context, cast.alumni);
      const cn1 = await postJob(page, uniqueDescription(`cn1-${suffix}`));
      descriptions.push(
        (
          await pool.query<{ description: string }>(
            'SELECT description FROM jobs WHERE id = $1',
            [cn1],
          )
        ).rows[0]!.description,
      );
      await approveAsMod(page, context, cast.mod, pool, cn1);
      await cancelAsAlumni(
        page,
        context,
        cast.alumni,
        pool,
        cn1,
        `cancel-${suffix}`,
      );

      // Compute the expected counts for THIS spec's jobs (suffix-scoped).
      const expected = {
        awaiting_moderation: await countByStateForDescriptions(
          pool,
          descriptions,
          'awaiting_moderation',
        ),
        enrollment_open: await countByStateForDescriptions(
          pool,
          descriptions,
          'enrollment_open',
        ),
        payment_sent: await countByStateForDescriptions(
          pool,
          descriptions,
          'payment_sent',
        ),
        rejected: await countByStateForDescriptions(pool, descriptions, 'rejected'),
        cancelled: await countByStateForDescriptions(
          pool,
          descriptions,
          'cancelled',
        ),
      };
      expect(expected.awaiting_moderation).toBeGreaterThanOrEqual(2);
      expect(expected.enrollment_open).toBeGreaterThanOrEqual(1);
      expect(expected.payment_sent).toBeGreaterThanOrEqual(1);
      expect(expected.rejected).toBeGreaterThanOrEqual(1);
      expect(expected.cancelled).toBeGreaterThanOrEqual(1);

      // Now visit /admin as Admin and check the displayed counts ≥ expected
      // (other specs may add jobs in the same states under parallel workers,
      // so we lower-bound assert).
      await reAuth(page, context, cast.admin);
      await page.goto('/admin');
      await expect(page.getByTestId('aggregate-counts-cards')).toBeVisible();

      for (const state of [
        'awaiting_moderation',
        'enrollment_open',
        'payment_sent',
        'rejected',
        'cancelled',
      ] as const) {
        const value = page.getByTestId(`aggregate-count-value-${state}`);
        const text = (await value.textContent())?.trim() ?? '0';
        const n = parseInt(text, 10);
        expect(n).toBeGreaterThanOrEqual(expected[state]);
      }

      // AC-04: click the payment_sent card → /jobs?state=payment_sent
      await page.getByTestId('aggregate-count-payment_sent').click();
      await page.waitForURL(/\/jobs\?state=payment_sent/);
      await expect(page.getByTestId('jobs-filtered-list')).toBeVisible();
      await expect(page.locator(`text=${ps1Desc}`)).toBeVisible();
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
