import { TRPCError } from '@trpc/server';
import type { Role } from '@app/db/schema';
import { authedProcedure } from '../trpc';

const PRIVILEGED_ROLES: ReadonlySet<Role> = new Set(['Moderator', 'Admin']);

export function isPrivileged(role: Role): boolean {
  return PRIVILEGED_ROLES.has(role);
}

export const activeProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.userRole !== 'Active') throw new TRPCError({ code: 'FORBIDDEN' });
  return next();
});

/**
 * Alumni capability — includes Alumni-role, Moderator, and Admin (elevation
 * preserves the Alumni posting capability per DESIGN-003 §4.2 note). Only
 * Active is excluded.
 */
export const alumniProcedure = authedProcedure.use(({ ctx, next }) => {
  if (
    ctx.userRole !== 'Alumni' &&
    ctx.userRole !== 'Moderator' &&
    ctx.userRole !== 'Admin'
  ) {
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
