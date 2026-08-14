import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { users, type Role } from '@app/db/schema';
import {
  MEMBER_STATUSES,
  getMemberStatus,
  putMemberStatus,
  syncRoleFromMemberStatus,
  type MemberStatus,
} from '@app/auth';
import {
  authedProcedure,
  mapDomainErrors,
  router,
  type TRPCContext,
} from '../trpc';

/**
 * ADR-014 — member status (`active`|`alumni`) via the portal registry
 * (sigo-alumni backlog item 07). The registry is the ONLY durable store:
 * `get` reads fresh from the portal on every call, `set` PUTs then re-GETs.
 * Nothing is cached app-side.
 *
 * Role projection: a fetched status is projected onto the app's
 * Active/Alumni role partition through `transitionRole`
 * (`syncRoleFromMemberStatus`) so display and access never diverge.
 * Privileged users (Moderator/Admin) are NEVER re-roled here — for them
 * status is a displayable/settable roster fact only; their role follows
 * portal tier (ADR-013).
 *
 * `kind: 'unavailable'` = the portal hasn't shipped the endpoint yet (or is
 * unreachable) — the UI falls back to local-only `users.changeRole`.
 */

export interface MemberStatusState {
  kind: 'ok' | 'undeclared' | 'no-registry-row' | 'unavailable';
  /** Declared portal status; null unless kind === 'ok'. */
  status: MemberStatus | null;
  /** The user's app role AFTER any projection ran. */
  role: Role;
}

async function freshRole(
  db: TRPCContext['db'],
  userId: string,
): Promise<Role> {
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
  return row.role as Role;
}

export const memberStatusRouter = router({
  /**
   * Fresh read from the portal registry (re-read on page load — never
   * persisted). A declared status that conflicts with the user's current
   * Active/Alumni role is synced through `transitionRole` (system
   * initiator) before returning.
   */
  get: authedProcedure.query(async ({ ctx }): Promise<MemberStatusState> => {
    const read = await getMemberStatus(ctx.userId);
    if (read.kind === 'ok') {
      await mapDomainErrors(() =>
        syncRoleFromMemberStatus(ctx.userId, read.status),
      );
    }
    return {
      kind: read.kind,
      status: read.kind === 'ok' ? read.status : null,
      role: await freshRole(ctx.db, ctx.userId),
    };
  }),

  /**
   * PUT to the portal registry, then re-GET (contract: after PUT, re-read
   * and update the session view) and sync the role. User-initiated, so the
   * audit row carries the user as initiator.
   */
  set: authedProcedure
    .input(z.object({ status: z.enum(MEMBER_STATUSES) }))
    .mutation(async ({ ctx, input }): Promise<MemberStatusState> => {
      const write = await putMemberStatus(ctx.userId, input.status);
      if (write.kind !== 'ok') {
        return {
          kind: write.kind,
          status: null,
          role: await freshRole(ctx.db, ctx.userId),
        };
      }
      const read = await getMemberStatus(ctx.userId);
      if (read.kind === 'ok') {
        await mapDomainErrors(() =>
          syncRoleFromMemberStatus(ctx.userId, read.status, {
            id: ctx.userId,
            kind: 'user',
          }),
        );
      }
      return {
        kind: read.kind,
        status: read.kind === 'ok' ? read.status : null,
        role: await freshRole(ctx.db, ctx.userId),
      };
    }),
});
