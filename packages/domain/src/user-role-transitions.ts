import { db } from '@app/db';
import {
  users,
  userRoleTransitions,
  type Role,
  type RoleInitiatorKind,
} from '@app/db/schema';
import { sql } from 'drizzle-orm';
import {
  ConcurrentTransitionError,
  MinAdminInvariantError,
  isPostgresCheckViolation,
} from './errors';

export interface TransitionRoleInput {
  targetUserId: string;
  expectedFromRole: Role;
  toRole: Role;
  initiator:
    | { id: string; kind: Exclude<RoleInitiatorKind, 'system'> }
    | { id: null; kind: 'system' };
  note?: string;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function performRoleTransition(
  tx: Tx,
  input: TransitionRoleInput,
): Promise<void> {
  const result = await tx
    .update(users)
    .set({ role: input.toRole, updatedAt: sql`now()` })
    .where(
      sql`${users.id} = ${input.targetUserId} AND ${users.role} = ${input.expectedFromRole}`,
    )
    .returning({ id: users.id });

  if (result.length === 0) {
    throw new ConcurrentTransitionError(
      `User ${input.targetUserId} is not in role '${input.expectedFromRole}' (role changed concurrently or user missing)`,
    );
  }

  await tx.insert(userRoleTransitions).values({
    userId: input.targetUserId,
    fromRole: input.expectedFromRole,
    toRole: input.toRole,
    initiatorId: input.initiator.id,
    initiatorKind: input.initiator.kind,
    note: input.note ?? null,
  });
}

/**
 * Transition a single user's role + write the user_role_transitions audit row in one transaction.
 *
 * The DEFERRABLE INITIALLY DEFERRED `trg_min_one_admin` trigger fires at COMMIT and raises
 * ERRCODE '23514' (with a 'min-Admin' message) if the chapter has < 1 Admin post-COMMIT.
 * Caught here and re-thrown as `MinAdminInvariantError`.
 */
export async function transitionRole(input: TransitionRoleInput): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await performRoleTransition(tx, input);
    });
  } catch (err) {
    if (isPostgresCheckViolation(err) && err.message.includes('min-Admin')) {
      throw new MinAdminInvariantError(
        'Cannot demote — chapter must always have at least one Admin',
      );
    }
    throw err;
  }
}

/**
 * Run multiple role transitions inside a single Drizzle transaction so the deferred
 * min-Admin trigger only fires at the outer COMMIT.
 *
 * Used by the atomic-swap flow (promote new Admin + demote outgoing Admin in one tx).
 * If the deferred check fires at COMMIT, it's caught + re-thrown as MinAdminInvariantError.
 */
export async function transitionRolesAtomically(
  inputs: readonly TransitionRoleInput[],
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      for (const input of inputs) {
        await performRoleTransition(tx, input);
      }
    });
  } catch (err) {
    if (isPostgresCheckViolation(err) && err.message.includes('min-Admin')) {
      throw new MinAdminInvariantError(
        'Cannot demote — chapter must always have at least one Admin',
      );
    }
    throw err;
  }
}
