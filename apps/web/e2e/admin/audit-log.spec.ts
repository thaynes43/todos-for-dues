import { test, expect } from '@playwright/test';
import {
  createPool,
  driveJobToDisputed,
  installPageerrorListener,
  newSuffix,
  reAuth,
  seedCast,
  uniqueDescription,
} from './support';

test.describe('PRD-007 AC-07 — Audit log timeline shows 7 transitions for a job driven to disputed', () => {
  test('chronological rows render with chapter-local + UTC ISO timestamps', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const jobId = await driveJobToDisputed({
        page,
        context,
        pool,
        cast,
        description: uniqueDescription(`audit-${suffix}`),
        reason: `dispute reason ${suffix}`,
      });

      // PRD-007 AC-07 enumerates 7 state-transition rows, plus the FSM
      // records relationship events (enroll) on the same audit table — so a
      // job driven to disputed via the UI ends up with 8 rows. The spec
      // asserts the 7 PRD-named transitions are present + the closing row
      // is `disputed`.
      const { rows: dbTransitions } = await pool.query<{
        to_state: string;
        created_at: Date;
      }>(
        'SELECT to_state, created_at FROM job_state_transitions WHERE job_id = $1 ORDER BY created_at ASC',
        [jobId],
      );
      expect(dbTransitions.length).toBeGreaterThanOrEqual(7);
      const expected = [
        'awaiting_moderation',
        'approved',
        'enrollment_open',
        'locked',
        'completed',
        'payment_sent',
        'disputed',
      ];
      for (const state of expected) {
        expect(dbTransitions.some((r) => r.to_state === state)).toBe(true);
      }
      expect(dbTransitions[dbTransitions.length - 1]!.to_state).toBe('disputed');

      await reAuth(page, context, cast.admin);
      await page.goto(`/admin/jobs/${jobId}`);

      const rows = page.getByTestId('audit-log-row');
      const rowCount = await rows.count();
      expect(rowCount).toBe(dbTransitions.length);

      // The last row is the dispute transition.
      const lastRow = rows.last();
      await expect(lastRow.getByTestId('audit-log-to')).toContainText('disputed');

      // Each row's <time> element carries the UTC ISO in the datetime attribute.
      const times = await page.locator('[data-testid="audit-log-row"] time').all();
      expect(times.length).toBe(dbTransitions.length);
      for (const t of times) {
        const iso = await t.getAttribute('datetime');
        expect(iso).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/,
        );
        const text = (await t.textContent())?.trim() ?? '';
        // chapter-local timestamps should not be a bare ISO; expect a comma
        // (en-US Intl format renders e.g. "Jun 2, 2026, 10:22 AM EDT").
        expect(text).toContain(',');
      }
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
