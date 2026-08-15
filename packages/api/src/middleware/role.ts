import { TRPCError } from '@trpc/server';
import { statusCanClaim, statusCanPost } from '@app/auth';
import type { Role } from '@app/db/schema';
import { authedProcedure } from '../trpc';

const PRIVILEGED_ROLES: ReadonlySet<Role> = new Set(['Moderator', 'Admin']);

export function isPrivileged(role: Role): boolean {
  return PRIVILEGED_ROLES.has(role);
}

/**
 * Claiming capability (ADR-015) — gated on MEMBER STATUS, never role. A member
 * whose fresh portal status is `active` can claim/enroll in jobs; everyone
 * else (status `alumni`, undeclared, no registry row, or portal unavailable)
 * is refused. Privileged roles are no exception — an Admin claims iff their own
 * status is `active`. Orthogonal to role by construction.
 */
export const claimProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (!statusCanClaim(await ctx.memberStatus())) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});

/**
 * Posting capability (ADR-015) — gated on MEMBER STATUS, never role. A member
 * whose fresh portal status is `alumni` can post jobs; everyone else is
 * refused. Privileged roles included: a Moderator posts iff their own status
 * is `alumni`.
 */
export const postProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (!statusCanPost(await ctx.memberStatus())) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});

export const moderatorProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.userRole !== 'Moderator' && ctx.userRole !== 'Admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});

export const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.userRole !== 'Admin') throw new TRPCError({ code: 'FORBIDDEN' });
  return next();
});

export const privilegedProcedure = authedProcedure.use(({ ctx, next }) => {
  if (!ctx.userRole || !isPrivileged(ctx.userRole)) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});
