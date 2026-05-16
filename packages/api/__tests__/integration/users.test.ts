import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MinAdminInvariantError } from '@app/domain';
import {
  caller,
  getUserRole,
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
  describe('changeRole — PRD-008 R-01 / R-04 self-service', () => {
    it('AC-01: Active → Alumni round trip writes user_role_transitions with initiator', async () => {
      await caller(makeCtx({ userId: users.active1, role: 'Active' }))
        .users.changeRole({ toRole: 'Alumni' });
      expect(await getUserRole(testDb.pool, users.active1)).toBe('Alumni');

      await caller(makeCtx({ userId: users.active1, role: 'Alumni' }))
        .users.changeRole({ toRole: 'Active' });
      expect(await getUserRole(testDb.pool, users.active1)).toBe('Active');

      const { rows } = await testDb.pool.query<{
        from_role: string;
        to_role: string;
        initiator_id: string;
        initiator_kind: string;
      }>(
        `SELECT from_role, to_role, initiator_id, initiator_kind FROM user_role_transitions
         WHERE user_id = $1 ORDER BY created_at, ctid`,
        [users.active1],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        from_role: 'Active',
        to_role: 'Alumni',
        initiator_id: users.active1,
        initiator_kind: 'user',
      });
      expect(rows[1]).toMatchObject({
        from_role: 'Alumni',
        to_role: 'Active',
        initiator_id: users.active1,
      });
    });

    it('AC-03: self-elevate to Admin → BAD_REQUEST from Zod', async () => {
      const c = caller(makeCtx({ userId: users.active1, role: 'Active' }));
      // @ts-expect-error — schema enumerates only 'Active' | 'Alumni'; this proves the schema enforces it.
      await expect(c.users.changeRole({ toRole: 'Admin' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('AC-03: self-elevate to Moderator → BAD_REQUEST from Zod', async () => {
      const c = caller(makeCtx({ userId: users.active1, role: 'Active' }));
      // @ts-expect-error — schema enumerates only 'Active' | 'Alumni'.
      await expect(c.users.changeRole({ toRole: 'Moderator' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('rejects without session — UNAUTHORIZED', async () => {
      await expect(
        caller(unauthedCtx()).users.changeRole({ toRole: 'Alumni' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('AC-04: single-Admin self-demote → UNPROCESSABLE_CONTENT with MIN_ADMIN_INVARIANT_VIOLATED', async () => {
      // The seed roster has exactly one Admin (users.admin). Admin can step down via self-service
      // to Alumni — the deferred trigger should fire MIN_ADMIN_INVARIANT_VIOLATED.
      const c = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
      try {
        await c.users.changeRole({ toRole: 'Alumni' });
        throw new Error('expected throw');
      } catch (err) {
        // In-process: TRPCError carries the typed cause; the wire-shape data.appCode
        // is produced by errorFormatter when serialized over HTTP. We verify both
        // the tRPC code and the underlying domain error here.
        const e = err as { code?: string; cause?: unknown };
        expect(e.code).toBe('UNPROCESSABLE_CONTENT');
        expect(e.cause).toBeInstanceOf(MinAdminInvariantError);
        expect((e.cause as MinAdminInvariantError).code).toBe('MIN_ADMIN_INVARIANT_VIOLATED');
      }
    });
  });

  describe('grantRole — PRD-008 R-02/R-03', () => {
    it('AC-02: Admin grants Moderator to Alumni; audit row uses initiator_kind=admin', async () => {
      await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .users.grantRole({ targetUserId: users.alumni, toRole: 'Moderator' });
      expect(await getUserRole(testDb.pool, users.alumni)).toBe('Moderator');

      const { rows } = await testDb.pool.query<{
        from_role: string;
        to_role: string;
        initiator_id: string;
        initiator_kind: string;
      }>(
        `SELECT from_role, to_role, initiator_id, initiator_kind FROM user_role_transitions WHERE user_id = $1`,
        [users.alumni],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        from_role: 'Alumni',
        to_role: 'Moderator',
        initiator_id: users.admin,
        initiator_kind: 'admin',
      });
    });

    it('rejects non-Admin — FORBIDDEN', async () => {
      await expect(
        caller(makeCtx({ userId: users.moderator, role: 'Moderator' }))
          .users.grantRole({ targetUserId: users.alumni, toRole: 'Admin' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('returns NOT_FOUND for unknown user', async () => {
      await expect(
        caller(makeCtx({ userId: users.admin, role: 'Admin' })).users.grantRole({
          targetUserId: '00000000-0000-0000-0000-000000000000',
          toRole: 'Active',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
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
      // Three transitions on active1: Active→Alumni, Alumni→Active, Active→Alumni (via grant).
      await caller(makeCtx({ userId: users.active1, role: 'Active' }))
        .users.changeRole({ toRole: 'Alumni' });
      await caller(makeCtx({ userId: users.active1, role: 'Alumni' }))
        .users.changeRole({ toRole: 'Active' });
      await admin.users.grantRole({ targetUserId: users.active1, toRole: 'Alumni' });

      const history = await admin.users.getRoleHistory({ userId: users.active1 });
      expect(history).toHaveLength(3);
      const toRoles = history.map((r) => r.toRole);
      expect(toRoles).toEqual(['Alumni', 'Active', 'Alumni']);
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

  describe('getById — BCC-01 Q-02', () => {
    it('returns selected user fields', async () => {
      const u = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).users.getById({
        userId: users.active1,
      });
      expect(u).toMatchObject({ id: users.active1, role: 'Active' });
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
});
