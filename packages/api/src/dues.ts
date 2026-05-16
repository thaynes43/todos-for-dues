import { inArray } from 'drizzle-orm';
import { users } from '@app/db/schema';
import type { TRPCContext } from './trpc';

/**
 * Cents-rounded split of `total` across `attendeeIds`. ADC-01 INV-05 +
 * PRD-005 R-04: the alphabetically-first attendees absorb the cent surplus.
 *
 * total: dollars (e.g., 100.00 for $100). attendees: user IDs of confirmed
 * attendees. Returns `Record<userId, "X.XX">` (string for jsonb persistence).
 *
 * Tiebreak when display names are missing/equal: lexicographic on the user ID.
 */
export async function computeDuesSplit(
  total: number,
  attendeeIds: readonly string[],
  ctx: Pick<TRPCContext, 'db'>,
): Promise<Record<string, string>> {
  if (attendeeIds.length === 0) {
    throw new Error('computeDuesSplit: attendeeIds must be non-empty');
  }

  const rows = await ctx.db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, [...attendeeIds]));

  const nameById = new Map(rows.map((r) => [r.id, r.displayName ?? '']));
  const sorted = [...attendeeIds].sort((a, b) => {
    const an = nameById.get(a) ?? '';
    const bn = nameById.get(b) ?? '';
    if (an !== bn) return an < bn ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const totalCents = Math.round(total * 100);
  const n = sorted.length;
  const centsPer = Math.floor(totalCents / n);
  const surplus = totalCents - centsPer * n;

  const out: Record<string, string> = {};
  for (let i = 0; i < sorted.length; i++) {
    const id = sorted[i]!;
    const cents = centsPer + (i < surplus ? 1 : 0);
    out[id] = (cents / 100).toFixed(2);
  }
  return out;
}
