import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  transitionRole,
  transitionRolesAtomically,
} from '../../src/user-role-transitions';
import { MinAdminInvariantError } from '../../src/errors';
import { resetAndSeedUsers, startTestDb, type SeedUsers, type TestDb } from './_db';

let testDb: TestDb;
let users: SeedUsers;

beforeAll(async () => {
  testDb = await startTestDb();
}, 120_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  users = await resetAndSeedUsers(testDb.pool);
});

async function getRole(userId: string): Promise<string | null> {
  const { rows } = await testDb.pool.query<{ role: string }>(
    `SELECT role FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.role ?? null;
}

async function getRoleAuditRows(
  userId: string,
): Promise<Array<{ fromRole: string | null; toRole: string; initiatorKind: string; note: string | null }>> {
  const { rows } = await testDb.pool.query<{
    from_role: string | null;
    to_role: string;
    initiator_kind: string;
    note: string | null;
  }>(
    `SELECT from_role, to_role, initiator_kind, note
     FROM user_role_transitions WHERE user_id = $1 ORDER BY created_at, ctid`,
    [userId],
  );
  return rows.map((r) => ({
    fromRole: r.from_role,
    toRole: r.to_role,
    initiatorKind: r.initiator_kind,
    note: r.note,
  }));
}

describe('transitionRole — happy path + audit row', () => {
  it('promotes a Member to Moderator + writes audit row', async () => {
    await transitionRole({
      targetUserId: users.active1,
      expectedFromRole: 'Member',
      toRole: 'Moderator',
      initiator: { id: users.admin, kind: 'admin' },
      note: 'mid-semester promotion',
    });

    expect(await getRole(users.active1)).toBe('Moderator');
    const audit = await getRoleAuditRows(users.active1);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      fromRole: 'Member',
      toRole: 'Moderator',
      initiatorKind: 'admin',
      note: 'mid-semester promotion',
    });
  });
});

describe('min-Admin invariant integration (PRD-008 R-05, AC-04)', () => {
  it('last-Admin demotion → throws MinAdminInvariantError (mapped from PG 23514)', async () => {
    await expect(
      transitionRole({
        targetUserId: users.admin,
        expectedFromRole: 'Admin',
        toRole: 'Member',
        initiator: { id: users.admin, kind: 'admin' },
      }),
    ).rejects.toBeInstanceOf(MinAdminInvariantError);

    // jobs.state, users.role, audit-log: all unchanged (transaction rolled back).
    expect(await getRole(users.admin)).toBe('Admin');
    const audit = await getRoleAuditRows(users.admin);
    expect(audit).toHaveLength(0);
  });

  it('atomic swap succeeds in a single transaction (promote B + demote A, deferred trigger passes at COMMIT) — PRD-008 AC-05', async () => {
    await transitionRolesAtomically([
      {
        targetUserId: users.active1,
        expectedFromRole: 'Member',
        toRole: 'Admin',
        initiator: { id: users.admin, kind: 'admin' },
        note: 'incoming Admin',
      },
      {
        targetUserId: users.admin,
        expectedFromRole: 'Admin',
        toRole: 'Member',
        initiator: { id: users.admin, kind: 'admin' },
        note: 'outgoing Admin',
      },
    ]);

    expect(await getRole(users.active1)).toBe('Admin');
    expect(await getRole(users.admin)).toBe('Member');

    const incomingAudit = await getRoleAuditRows(users.active1);
    expect(incomingAudit).toEqual([
      { fromRole: 'Member', toRole: 'Admin', initiatorKind: 'admin', note: 'incoming Admin' },
    ]);
    const outgoingAudit = await getRoleAuditRows(users.admin);
    expect(outgoingAudit).toEqual([
      { fromRole: 'Admin', toRole: 'Member', initiatorKind: 'admin', note: 'outgoing Admin' },
    ]);
  });

  it('atomic swap that ends with 0 Admins → MinAdminInvariantError, full rollback', async () => {
    await expect(
      transitionRolesAtomically([
        // Only demote, no promote. Final admin_count = 0 → trigger fails at COMMIT.
        {
          targetUserId: users.admin,
          expectedFromRole: 'Admin',
          toRole: 'Member',
          initiator: { id: users.admin, kind: 'admin' },
        },
      ]),
    ).rejects.toBeInstanceOf(MinAdminInvariantError);

    expect(await getRole(users.admin)).toBe('Admin');
  });

  it('sequential (two separate txs): promote B → demote A succeeds', async () => {
    await transitionRole({
      targetUserId: users.active1,
      expectedFromRole: 'Member',
      toRole: 'Admin',
      initiator: { id: users.admin, kind: 'admin' },
    });
    await transitionRole({
      targetUserId: users.admin,
      expectedFromRole: 'Admin',
      toRole: 'Member',
      initiator: { id: users.active1, kind: 'admin' },
    });
    expect(await getRole(users.active1)).toBe('Admin');
    expect(await getRole(users.admin)).toBe('Member');
  });

  it('zero-Admin recovery path (e.g. portal claim-sync promotion): promote one user → succeeds', async () => {
    // Bypass the trigger to fabricate a zero-Admin starting state. This emulates the
    // moment after a chapter is provisioned but before its first Admin signs in.
    await testDb.pool.query(`ALTER TABLE users DISABLE TRIGGER trg_min_one_admin`);
    try {
      await testDb.pool.query(`UPDATE users SET role = 'Member' WHERE role = 'Admin'`);
      const { rows } = await testDb.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users WHERE role = 'Admin'`,
      );
      expect(rows[0]?.count).toBe('0');
    } finally {
      await testDb.pool.query(`ALTER TABLE users ENABLE TRIGGER trg_min_one_admin`);
    }

    // Now promote one user through the FSM helper. The trigger fires at COMMIT —
    // admin_count after COMMIT is 1 → passes.
    await transitionRole({
      targetUserId: users.active1,
      expectedFromRole: 'Member',
      toRole: 'Admin',
      initiator: { id: null, kind: 'system' },
      note: 'bootstrap recovery',
    });

    expect(await getRole(users.active1)).toBe('Admin');
  });
});

describe('ConcurrentTransitionError when the user is not in the expected role', () => {
  it('expectedFromRole mismatch → ConcurrentTransitionError', async () => {
    const { ConcurrentTransitionError } = await import('../../src/errors');
    await expect(
      transitionRole({
        targetUserId: users.alumni,
        // alumni's actual role is 'Member', not 'Admin'
        expectedFromRole: 'Admin',
        toRole: 'Moderator',
        initiator: { id: users.admin, kind: 'admin' },
      }),
    ).rejects.toBeInstanceOf(ConcurrentTransitionError);
  });
});
