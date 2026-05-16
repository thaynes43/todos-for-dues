import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { asc, desc, eq } from 'drizzle-orm';
import { users, userRoleTransitions, ROLES, type Role } from '@app/db/schema';
import { transitionRole } from '@app/domain';
import {
  authedProcedure,
  mapDomainErrors,
  publicProcedure,
  router,
} from '../trpc';
import { adminProcedure } from '../middleware/role';

const SELF_SERVICE_ROLES = z.enum(['Active', 'Alumni']);

export const usersRouter = router({
  // PRD-008 R-01/R-04 self-service role change. Schema enumerates only the
  // non-privileged roles — self-elevation requests get a Zod BAD_REQUEST
  // before they reach any business logic.
  changeRole: authedProcedure
    .input(z.object({ toRole: SELF_SERVICE_ROLES }))
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        await transitionRole({
          targetUserId: ctx.userId,
          expectedFromRole: ctx.userRole,
          toRole: input.toRole,
          initiator: { id: ctx.userId, kind: 'user' },
        });
      });
    }),

  // PRD-008 R-02/R-03 — Admin grants any role to any user.
  grantRole: adminProcedure
    .input(
      z.object({
        targetUserId: z.string().uuid(),
        toRole: z.enum(ROLES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapDomainErrors(async () => {
        const [target] = await ctx.db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, input.targetUserId));
        if (!target) throw new TRPCError({ code: 'NOT_FOUND' });
        await transitionRole({
          targetUserId: input.targetUserId,
          expectedFromRole: target.role as Role,
          toRole: input.toRole,
          initiator: { id: ctx.userId, kind: 'admin' },
        });
      });
    }),

  // PRD-007 R-08 / PRD-008 R-08 — Admin list of all users.
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.displayName));
  }),

  // PRD-008 R-10 — role change history for a target user.
  getRoleHistory: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(userRoleTransitions)
        .where(eq(userRoleTransitions.userId, input.userId))
        .orderBy(desc(userRoleTransitions.createdAt));
    }),

  // BCC-01 Q-01 GetSession — null when unauthenticated.
  getSession: publicProcedure.query(({ ctx }) => ctx.session),

  // BCC-01 Q-02 GetUserById — roster + audit-log display.
  getById: authedProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          id: users.id,
          displayName: users.displayName,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, input.userId));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      return row;
    }),
});
