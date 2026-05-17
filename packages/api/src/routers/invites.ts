import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { inviteTokens, users, INVITE_TOKEN_ROLES } from '@app/db/schema';
import { router } from '../trpc';
import { adminProcedure } from '../middleware/role';

const MintInput = z.object({
  preselectedRole: z.enum(INVITE_TOKEN_ROLES),
});

const RevokeInput = z.object({
  id: z.string().uuid(),
});

export const invitesRouter = router({
  // PRD-003 R-11..R-13 / PLAN-014 §3 — Admin mints an invite for Active or Alumni.
  // The Zod enum is defense-in-depth alongside the DB CHECK constraint.
  mint: adminProcedure
    .input(MintInput)
    .mutation(async ({ ctx, input }) => {
      const token = randomBytes(16).toString('base64url');
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
          createdBy: inviteTokens.createdBy,
        });
      if (!row) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      return row;
    }),

  // PRD-003 AC-11 — outstanding (un-revoked) invites only, newest first.
  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: inviteTokens.id,
        token: inviteTokens.token,
        preselectedRole: inviteTokens.preselectedRole,
        createdAt: inviteTokens.createdAt,
        createdByDisplayName: users.displayName,
      })
      .from(inviteTokens)
      .leftJoin(users, eq(users.id, inviteTokens.createdBy))
      .where(isNull(inviteTokens.revokedAt))
      .orderBy(desc(inviteTokens.createdAt));
    return rows;
  }),

  // PRD-003 AC-12 — Admin revokes; already-revoked or unknown id returns NOT_FOUND.
  revoke: adminProcedure
    .input(RevokeInput)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(inviteTokens)
        .set({ revokedAt: sql`now()` })
        .where(and(eq(inviteTokens.id, input.id), isNull(inviteTokens.revokedAt)))
        .returning({ revokedAt: inviteTokens.revokedAt });
      if (!row || row.revokedAt === null) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return { revokedAt: row.revokedAt };
    }),
});
