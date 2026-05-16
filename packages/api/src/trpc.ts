import { initTRPC, TRPCError } from '@trpc/server';
import { auth, type Session } from '@app/auth';
import { db } from '@app/db';
import type { Role } from '@app/db/schema';
import {
  ConcurrentTransitionError,
  FsmViolationError,
  MinAdminInvariantError,
} from '@app/domain';

export interface TRPCContext {
  db: typeof db;
  session: Session;
  userId: string | null;
  userRole: Role | null;
}

export const createTRPCContext = async ({
  req,
}: {
  req: Request;
}): Promise<TRPCContext> => {
  const session = await auth.api.getSession({ headers: req.headers });
  const userRoleRaw = (session?.user as { role?: string } | undefined)?.role;
  const userRole = isRole(userRoleRaw) ? userRoleRaw : null;
  return {
    db,
    session,
    userId: session?.user.id ?? null,
    userRole,
  };
};

function isRole(value: unknown): value is Role {
  return (
    value === 'Active' ||
    value === 'Alumni' ||
    value === 'Moderator' ||
    value === 'Admin'
  );
}

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    if (cause instanceof MinAdminInvariantError) {
      return {
        ...shape,
        data: {
          ...shape.data,
          appCode: 'MIN_ADMIN_INVARIANT_VIOLATED' as const,
        },
      };
    }
    if (cause instanceof ConcurrentTransitionError) {
      return {
        ...shape,
        data: {
          ...shape.data,
          appCode: 'CONCURRENT_TRANSITION' as const,
        },
      };
    }
    if (cause instanceof FsmViolationError) {
      return {
        ...shape,
        data: {
          ...shape.data,
          appCode: 'FSM_VIOLATION' as const,
        },
      };
    }
    return shape;
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session || !ctx.userId || !ctx.userRole) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId: ctx.userId,
      userRole: ctx.userRole,
    },
  });
});

/**
 * Maps the typed domain errors to the right TRPCError code. Procedures wrap
 * their domain calls in `mapDomainErrors(async () => { ... })`. Procedures
 * that special-case the error (e.g., `jobs.confirmReceipt` for the idempotent
 * close race) catch the typed error directly.
 */
export async function mapDomainErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MinAdminInvariantError) {
      throw new TRPCError({
        code: 'UNPROCESSABLE_CONTENT',
        message: err.message,
        cause: err,
      });
    }
    if (err instanceof ConcurrentTransitionError) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: err.message,
        cause: err,
      });
    }
    if (err instanceof FsmViolationError) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: err.message,
        cause: err,
      });
    }
    throw err;
  }
}
