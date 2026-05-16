import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { desc, eq, sql } from 'drizzle-orm';
import { inviteTokens, INVITE_TOKEN_ROLES } from '@app/db/schema';
import { router } from '../trpc';
import { adminProcedure } from '../middleware/role';

function publicBaseUrl(): string {
  return (
    process.env.PUBLIC_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    'http://localhost:3000'
  );
}

export const invitesRouter = router({
  // PRD-001 R-01 — Admin generates an invite URL for an Active or Alumni role.
  generate: adminProcedure
    .input(z.object({ preselectedRole: z.enum(INVITE_TOKEN_ROLES) }))
    .mutation(async ({ ctx, input }) => {
      const token = crypto.randomUUID().replace(/-/g, '');
      const [row] = await ctx.db
        .insert(inviteTokens)
        .values({
          token,
          preselectedRole: input.preselectedRole,
          createdBy: ctx.userId,
        })
        .returning({
          id: inviteTokens.id,
          token: inviteTokens.token,
          preselectedRole: inviteTokens.preselectedRole,
          createdAt: inviteTokens.createdAt,
        });
      if (!row) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      return {
        id: row.id,
        token: row.token,
        preselectedRole: row.preselectedRole,
        url: `${publicBaseUrl()}/signup?token=${row.token}`,
        createdAt: row.createdAt,
      };
    }),

  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(inviteTokens)
      .orderBy(desc(inviteTokens.createdAt));
  }),

  revoke: adminProcedure
    .input(z.object({ tokenId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(inviteTokens)
        .set({ revokedAt: sql`now()` })
        .where(eq(inviteTokens.id, input.tokenId))
        .returning({ id: inviteTokens.id });
      if (result.length === 0) throw new TRPCError({ code: 'NOT_FOUND' });
    }),
});
