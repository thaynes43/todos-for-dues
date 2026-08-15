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
      // ADR-015: roles are Member | Moderator | Admin only.
      // Net path: Member → Moderator → Admin → Moderator.
      await transitionRole({
        targetUserId: target.id,
        expectedFromRole: 'Member',
        toRole: 'Moderator',
        initiator: { id: cast.admin.id, kind: 'admin' },
      });
      await transitionRole({
        targetUserId: target.id,
        expectedFromRole: 'Moderator',
        toRole: 'Admin',
        initiator: { id: cast.admin.id, kind: 'admin' },
      });
      await transitionRole({
        targetUserId: target.id,
        expectedFromRole: 'Admin',
        toRole: 'Moderator',
        initiator: { id: cast.admin.id, kind: 'admin' },
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
      // Newest first → Moderator (last write), Admin, Moderator (first write).
      expect(toRoles).toEqual(['Moderator', 'Admin', 'Moderator']);
    } finally {
      await pool.end();
    }
    expect(errors).toEqual([]);
  });
});
