import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { MEMBER_STATUSES, getMemberStatus, setMemberStatus } from '@app/auth';
import { authedProcedure, router } from '../trpc';

/**
 * Member status (sigo-alumni backlog item 07) — the portal registry is the
 * single source of truth; this router is a thin, cache-free proxy over the
 * portal's `/api/member/status`. `get` runs on every profile page load;
 * `set` writes and then re-reads so the client view is current truth, never
 * a local echo. The portal API is not built yet — `get` reports
 * `available: false` until it ships, and the UI stays hidden.
 */
export const memberStatusRouter = router({
  get: authedProcedure.query(({ ctx }) => getMemberStatus(ctx.userId)),

  set: authedProcedure
    .input(z.object({ status: z.enum(MEMBER_STATUSES) }))
    .mutation(async ({ ctx, input }) => {
      const result = await setMemberStatus(ctx.userId, input.status);
      if (!result.ok) {
        if (result.reason === 'no-registry-row') {
          // Contract: PUT 404/409 = no linked registry row (Pending users
          // have no status). The client hides the control on this.
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
      }
      // Contract: after PUT, re-GET and update the session view.
      return getMemberStatus(ctx.userId);
    }),
});
