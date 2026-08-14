import { eq } from 'drizzle-orm';
import { db, users, type Role } from '@app/db';
import { transitionRole } from '@app/domain';
import { statusToRole, type MemberStatus } from '../portal-status';

/**
 * ADR-014 status → role projection: a freshly-read portal member status is
 * projected onto the app's Active/Alumni role partition so display and
 * access never diverge. NEVER touches privileged roles — for a Moderator or
 * Admin, status stays a displayable roster fact and the role is driven by
 * portal tier alone (ADR-013).
 *
 * All writes route through `transitionRole` (single-writer invariant,
 * PLAN-003) so `user_role_transitions` stays honest.
 */

export type StatusSyncOutcome =
  | { kind: 'skipped'; reason: 'privileged-role' | 'no-user-row' }
  | { kind: 'unchanged'; role: Role }
  | { kind: 'synced'; from: Role; to: Role };

export type StatusSyncInitiator =
  | { id: string; kind: 'user' }
  | { id: null; kind: 'system' };

export async function syncRoleFromMemberStatus(
  userId: string,
  status: MemberStatus,
  initiator: StatusSyncInitiator = { id: null, kind: 'system' },
): Promise<StatusSyncOutcome> {
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) return { kind: 'skipped', reason: 'no-user-row' };
  if (row.role !== 'Active' && row.role !== 'Alumni') {
    return { kind: 'skipped', reason: 'privileged-role' };
  }
  const target = statusToRole(status);
  if (row.role === target) return { kind: 'unchanged', role: row.role };
  await transitionRole({
    targetUserId: userId,
    expectedFromRole: row.role,
    toRole: target,
    initiator,
    note: `portal status-sync: status=${status} (ADR-014)`,
  });
  return { kind: 'synced', from: row.role, to: target };
}
