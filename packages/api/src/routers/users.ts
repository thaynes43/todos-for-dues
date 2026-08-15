import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { asc, desc, eq } from 'drizzle-orm';
import { users, userRoleTransitions } from '@app/db/schema';
import { authedProcedure, publicProcedure, router } from '../trpc';
import { adminProcedure } from '../middleware/role';

// ADR-015: roles are portal-derived ONLY. The self-service `changeRole` and
// admin `grantRole` procedures were REMOVED — they wrote `users.role`
// directly, which is exactly the landmine the owner stepped on (a status
// toggle rewrote his Admin role). Claim-sync (packages/auth) is now the sole
// role writer; membership status moves through `memberStatus` and never
// touches role. Both writes were already ephemeral under SSO claim-sync
// (ADR-013 C-07), so nothing user-visible is lost.
export const usersRouter = router({
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
  // S-M1 (AUDIT-2026-08): display-only projection. Any authed user can map a
  // userId to a display name (roster rendering), but email/role are PII and
  // live behind `getByIdAdmin` below — the PLAN-012 projection widening made
  // them harvestable by every member.
  getById: authedProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          id: users.id,
          displayName: users.displayName,
        })
        .from(users)
        .where(eq(users.id, input.userId));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      return row;
    }),

  // PLAN-012 Step 6 — Admin per-user detail header needs email + role.
  // Admin-gated counterpart of `getById` (S-M1 split).
  getByIdAdmin: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          id: users.id,
          displayName: users.displayName,
          email: users.email,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, input.userId));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      return row;
    }),
});
