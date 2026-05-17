import { test, expect } from '@playwright/test';
import { transitionRole } from '@app/domain';
import {
  createPool,
  installPageerrorListener,
  newSuffix,
  reAuth,
  seedCast,
} from './support';

test.describe('PRD-008 AC-11 — role-change history descending', () => {
  test('User T with 3 transitions renders all rows newest-first on /admin/users/[userId]', async ({
    page,
    context,
  }) => {
    const errors = installPageerrorListener(page);
    const pool = createPool();
    try {
      const suffix = newSuffix();
      const cast = await seedCast(pool, suffix);
      const target = cast.active;

      // Drive three role transitions through the domain helper so the audit
      // log is populated the same way production writes do (single-writer
      // invariant enforced by packages/domain/__tests__/no-direct-state-writes.test.ts).
      // Net path: Active → Alumni → Active → Alumni.
      await transitionRole({
        targetUserId: target.id,
        expectedFromRole: 'Active',
        toRole: 'Alumni',
        initiator: { id: target.id, kind: 'user' },
      });
      await transitionRole({
        targetUserId: target.id,
        expectedFromRole: 'Alumni',
        toRole: 'Active',
        initiator: { id: target.id, kind: 'user' },
      });
      await transitionRole({
        targetUserId: target.id,
        expectedFromRole: 'Active',
        toRole: 'Alumni',
        initiator: { id: target.id, kind: 'user' },
      });

      await reAuth(page, context, cast.admin);
      await page.goto(`/admin/users/${target.id}`);
      await expect(page.getByTestId('admin-user-detail')).toBeVisible();
      const rows = page.getByTestId('role-history-row');
      // At least the three we seeded. Other rows may exist if previous tests
      // ran transitions on this user (unlikely with UUID-suffixed seed).
      await expect.poll(async () => rows.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(3);

      // The first three rows from the top are descending by createdAt.
      const top3 = await rows.all();
      const top = top3.slice(0, 3);
      const toRoles = await Promise.all(
        top.map((r) => r.getAttribute('data-to-role')),
      );
      // Newest first → Alumni (offset 120), Active (offset 60), Alumni (offset 0).
      expect(toRoles).toEqual(['Alumni', 'Active', 'Alumni']);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
