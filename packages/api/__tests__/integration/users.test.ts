import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { transitionRole } from '@app/domain';
import { appRouter } from '../../src/routers';
import {
  caller,
  makeCtx,
  resetAndSeedUsers,
  startTestDb,
  unauthedCtx,
  type SeedUsers,
  type TestDb,
} from './_setup';

let testDb: TestDb;
let users: SeedUsers;

beforeAll(async () => {
  testDb = await startTestDb();
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  users = await resetAndSeedUsers(testDb.pool);
});

describe('users router', () => {
  // ADR-015: the self-service `changeRole` and admin `grantRole` procedures
  // were REMOVED — they were direct `users.role` writers, the exact landmine
  // the owner stepped on. Claim-sync is now the sole role writer; there is no
  // in-app role-change surface at all. The regression that a status change
  // never moves a role lives in member-status.test.ts.

  describe('no self-service / admin role-change procedures exist (ADR-015)', () => {
    it('the router exposes no changeRole / grantRole procedures', () => {
      // Check the router definition directly (the tRPC caller is a recursive
      // proxy, so a missing path would still return a callable). The flat
      // procedure record is keyed by dotted path.
      const procedures = (
        appRouter._def as { procedures: Record<string, unknown> }
      ).procedures;
      const paths = Object.keys(procedures);
      expect(paths).not.toContain('users.changeRole');
      expect(paths).not.toContain('users.grantRole');
      // Sanity: the surviving user procedures are still registered.
      expect(paths).toContain('users.list');
      expect(paths).toContain('users.getRoleHistory');
    });
  });

  describe('list — PRD-007 R-08 / PRD-008 R-08', () => {
    it('AC-08: Admin sees all users', async () => {
      const list = await caller(makeCtx({ userId: users.admin, role: 'Admin' })).users.list();
      expect(list.length).toBe(7);
      expect(list.map((u) => u.email).sort()).toEqual([
        'active1@test.invalid',
        'active2@test.invalid',
        'active3@test.invalid',
        'admin@test.invalid',
        'alumni2@test.invalid',
        'alumni@test.invalid',
        'mod@test.invalid',
      ]);
    });

    it('AC-08: non-Admin returns FORBIDDEN', async () => {
      await expect(
        caller(makeCtx({ userId: users.moderator, role: 'Moderator' })).users.list(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('getRoleHistory — PRD-008 R-10', () => {
    it('AC-11: returns transitions in descending order', async () => {
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      // Role transitions are now written only through the sanctioned FSM writer
      // (`transitionRole` — what claim-sync uses). Seed three on active1:
      // Member→Moderator→Member→Moderator. A backstop Admin exists so the
      // min-Admin trigger never fires.
      await transitionRole({
        targetUserId: users.active1,
        expectedFromRole: 'Member',
        toRole: 'Moderator',
        initiator: { id: users.admin, kind: 'admin' },
      });
      await new Promise((r) => setTimeout(r, 5));
      await transitionRole({
        targetUserId: users.active1,
        expectedFromRole: 'Moderator',
        toRole: 'Member',
        initiator: { id: null, kind: 'system' },
      });
      await new Promise((r) => setTimeout(r, 5));
      await transitionRole({
        targetUserId: users.active1,
        expectedFromRole: 'Member',
        toRole: 'Moderator',
        initiator: { id: users.admin, kind: 'admin' },
      });

      const history = await admin.users.getRoleHistory({ userId: users.active1 });
      expect(history).toHaveLength(3);
      const toRoles = history.map((r) => r.toRole);
      expect(toRoles).toEqual(['Moderator', 'Member', 'Moderator']);
      // Descending by createdAt: newest first
      expect(history[0]!.createdAt >= history[1]!.createdAt).toBe(true);
      expect(history[1]!.createdAt >= history[2]!.createdAt).toBe(true);
    });

    it('rejects non-Admin', async () => {
      await expect(
        caller(makeCtx({ userId: users.moderator, role: 'Moderator' })).users.getRoleHistory({
          userId: users.active1,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('getSession — BCC-01 Q-01', () => {
    it('returns session for authenticated caller', async () => {
      const sess = await caller(makeCtx({ userId: users.active1, role: 'Active' })).users.getSession();
      expect(sess).toBeTruthy();
      expect((sess as { user?: { id?: string } }).user?.id).toBe(users.active1);
    });

    it('returns null when unauthenticated', async () => {
      const sess = await caller(unauthedCtx()).users.getSession();
      expect(sess).toBeNull();
    });
  });

  describe('getById — BCC-01 Q-02 (S-M1 display-only projection)', () => {
    it('returns only id + displayName to a non-admin caller', async () => {
      const u = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).users.getById({
        userId: users.active1,
      });
      expect(u.id).toBe(users.active1);
      expect(typeof u.displayName).toBe('string');
      // S-M1: email + role are PII — must NOT appear in the authed projection.
      expect(u).not.toHaveProperty('email');
      expect(u).not.toHaveProperty('role');
      expect(Object.keys(u).sort()).toEqual(['displayName', 'id']);
    });

    it('rejects without session', async () => {
      await expect(
        caller(unauthedCtx()).users.getById({ userId: users.active1 }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('returns NOT_FOUND for unknown user', async () => {
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).users.getById({
          userId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('getByIdAdmin — S-M1 admin-gated projection (PLAN-012 Step 6)', () => {
    it('projects email + role + displayName for the Admin detail view', async () => {
      const u = await caller(makeCtx({ userId: users.admin, role: 'Admin' })).users.getByIdAdmin(
        { userId: users.active1 },
      );
      expect(u.email).toBe('active1@test.invalid');
      expect(u.role).toBe('Member');
      expect(typeof u.displayName).toBe('string');
      expect(u.displayName.length).toBeGreaterThan(0);
    });

    it('FORBIDDEN for every non-admin role', async () => {
      for (const role of ['Active', 'Alumni', 'Moderator'] as const) {
        const callerId =
          role === 'Active'
            ? users.active1
            : role === 'Alumni'
              ? users.alumni
              : users.moderator;
        await expect(
          caller(makeCtx({ userId: callerId, role })).users.getByIdAdmin({
            userId: users.active1,
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      }
    });

    it('returns NOT_FOUND for unknown user', async () => {
      await expect(
        caller(makeCtx({ userId: users.admin, role: 'Admin' })).users.getByIdAdmin({
          userId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
