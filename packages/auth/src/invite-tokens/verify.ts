import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@app/db';
import { inviteTokens, type InviteTokenRole } from '@app/db/schema';
import { InviteTokenError } from '../errors';

export async function verifyInviteToken(
  token: string,
): Promise<{ preselectedRole: InviteTokenRole }> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new InviteTokenError('not_found', 'Invite link is invalid or has been revoked.');
  }

  const [row] = await db
    .select({
      preselectedRole: inviteTokens.preselectedRole,
      revokedAt: inviteTokens.revokedAt,
    })
    .from(inviteTokens)
    .where(eq(inviteTokens.token, trimmed))
    .limit(1);

  if (!row) {
    throw new InviteTokenError('not_found', 'Invite link is invalid or has been revoked.');
  }
  if (row.revokedAt !== null) {
    throw new InviteTokenError('revoked', 'Invite link is invalid or has been revoked.');
  }

  return { preselectedRole: row.preselectedRole };
}

/**
 * Same as verifyInviteToken but enforces revokedAt IS NULL in the WHERE clause,
 * useful when caller doesn't need to distinguish not_found vs revoked.
 */
export async function findActiveInviteToken(
  token: string,
): Promise<{ preselectedRole: InviteTokenRole } | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const [row] = await db
    .select({ preselectedRole: inviteTokens.preselectedRole })
    .from(inviteTokens)
    .where(and(eq(inviteTokens.token, trimmed), isNull(inviteTokens.revokedAt)))
    .limit(1);
  return row ?? null;
}
