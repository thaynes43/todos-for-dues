import { and, desc, eq } from 'drizzle-orm';
import { APIError } from 'better-auth/api';
import { db, account, users, type Role } from '@app/db';
import { MinAdminInvariantError, transitionRole } from '@app/domain';
import {
  PORTAL_PROVIDER_ID,
  isAppRole,
  mapTierToRole,
  parsePortalTier,
  tierAllowsRole,
  type PortalTier,
} from '../portal-tiers';
import {
  parseMemberStatus,
  statusToRole,
  type MemberStatus,
} from '../portal-status';

/**
 * ADR-013 claim sync: the portal (sigoalumni.org) is the only identity
 * source; app roles are derived from the `tier` claim at every sign-in
 * (session create). Role writes route through `transitionRole` so the
 * user_role_transitions audit trail stays honest (PLAN-003 invariant).
 */

const membershipPendingError = () =>
  new APIError('FORBIDDEN', {
    message: 'membership pending',
    // `code` drives the OAuth-callback error redirect (?error=MEMBERSHIP_PENDING)
    // when this is thrown from the session.create hook; the user.create path
    // redirects with the message (?error=membership_pending). /login handles both.
    code: 'MEMBERSHIP_PENDING',
  });

/** Decode a JWT payload without signature verification. Only ever called on
 * id_tokens Better Auth just received from the portal's token endpoint over
 * the confidential-client channel — the transport, not this decode, is the
 * trust boundary. */
export function decodeJwtClaims(jwt: string): Record<string, unknown> | null {
  const payload = jwt.split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

export interface PortalClaims {
  tier: PortalTier | null;
  /** ADR-014 `status` claim — sign-in snapshot; null when absent/undeclared. */
  status: MemberStatus | null;
}

/** Read the freshest portal claims for a user from the stored sigo-portal
 * id_token (updated on every sign-in via updateAccountOnSignIn). */
export async function readPortalClaims(userId: string): Promise<PortalClaims> {
  const [row] = await db
    .select({ idToken: account.idToken })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, PORTAL_PROVIDER_ID)),
    )
    .orderBy(desc(account.updatedAt))
    .limit(1);
  if (!row?.idToken) return { tier: null, status: null };
  const claims = decodeJwtClaims(row.idToken);
  if (!claims) return { tier: null, status: null };
  return {
    tier: parsePortalTier(claims.tier),
    status: parseMemberStatus(claims.status),
  };
}

/** Back-compat wrapper — tier only. */
export async function readPortalTier(userId: string): Promise<PortalTier | null> {
  return (await readPortalClaims(userId)).tier;
}

export type ClaimSyncOutcome =
  | { kind: 'skipped'; reason: 'no-portal-tier' | 'no-user-row' }
  | { kind: 'refused' }
  | { kind: 'unchanged'; role: Role }
  | { kind: 'synced'; from: Role; to: Role; fallback: boolean }
  | { kind: 'blocked-min-admin'; role: Role };

/**
 * Re-run the ADR-013 tier → role mapping for a user. Called on every session
 * create (claim changes propagate at next sign-in — ADR 0007 C-3).
 *
 * Min-Admin conflict guard: if the claims demote the LAST Admin, the deferred
 * DB trigger (migration 0003/0008) aborts the transition. Per plan §2.0 we
 * first retry with Moderator (the closest privileged role); if that is also
 * blocked — it always is while admin-count is 1 — the user KEEPS Admin, the
 * sign-in succeeds, and we log loudly. The demotion lands on a later sign-in
 * once another Admin exists.
 */
export async function syncRoleFromPortalTier(
  userId: string,
): Promise<ClaimSyncOutcome> {
  const { tier, status } = await readPortalClaims(userId);
  if (!tier) return { kind: 'skipped', reason: 'no-portal-tier' };
  if (tier === 'pending') return { kind: 'refused' };

  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) return { kind: 'skipped', reason: 'no-user-row' };

  // ADR-014: for `brother` a DECLARED `status` claim pins which of the two
  // brother-consistent roles the user holds (active → Active, alumni →
  // Alumni). Absent/undeclared status keeps the pre-status behavior: both
  // Active and Alumni are consistent with `brother`, so nothing moves.
  let target: Role | 'refused';
  let note: string;
  if (tier === 'brother' && status) {
    const desired = statusToRole(status);
    if (row.role === desired) return { kind: 'unchanged', role: row.role };
    target = desired;
    note = `portal claim-sync: tier=${tier} status=${status} (ADR-014)`;
  } else {
    if (tierAllowsRole(tier, row.role)) {
      return { kind: 'unchanged', role: row.role };
    }
    target = mapTierToRole(tier);
    note = `portal claim-sync: tier=${tier} (ADR-013)`;
  }
  if (target === 'refused') return { kind: 'refused' }; // unreachable (pending handled above)

  const attempt = async (toRole: Role): Promise<void> => {
    await transitionRole({
      targetUserId: userId,
      expectedFromRole: row.role,
      toRole,
      initiator: { id: null, kind: 'system' },
      note,
    });
  };

  try {
    await attempt(target);
    return { kind: 'synced', from: row.role, to: target, fallback: false };
  } catch (err) {
    if (!(err instanceof MinAdminInvariantError)) throw err;
    if (target !== 'Moderator') {
      try {
        await attempt('Moderator');
        return { kind: 'synced', from: row.role, to: 'Moderator', fallback: true };
      } catch (err2) {
        if (!(err2 instanceof MinAdminInvariantError)) throw err2;
      }
    }
    console.error(
      `[auth] claim-sync: portal tier '${tier}' demotes the last Admin (user ${userId}); ` +
        `min-Admin invariant keeps them Admin until another Admin exists (ADR-013).`,
    );
    return { kind: 'blocked-min-admin', role: row.role };
  }
}

/**
 * databaseHooks.user.create.before — refuse creation unless the mapped role
 * is a real app role. mapProfileToUser emits the sentinel 'refused' for
 * pending / unknown tiers, so a pending member never gets a user row
 * (mirrors the old HD-restriction guarantee). The thrown APIError surfaces
 * as a redirect to /login?error=membership_pending.
 */
export function refuseNonMemberUserCreate(user: Record<string, unknown>): void {
  if (!isAppRole(user['role'])) {
    throw membershipPendingError();
  }
}

/**
 * databaseHooks.session.create.before — pending gate + claim sync for
 * existing users. Throwing aborts the sign-in before a session row exists;
 * the generic-oauth callback turns the APIError into an error redirect.
 */
export async function syncPortalClaimsOnSessionCreate(session: {
  userId: string;
}): Promise<void> {
  const outcome = await syncRoleFromPortalTier(session.userId);
  if (outcome.kind === 'refused') {
    throw membershipPendingError();
  }
}
