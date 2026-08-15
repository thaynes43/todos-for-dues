import { initTRPC, TRPCError } from '@trpc/server';
import {
  auth,
  getMemberStatusGate,
  type MemberStatusGate,
  type Session,
} from '@app/auth';
import { db } from '@app/db';
import type { Role } from '@app/db/schema';
import {
  ConcurrentTransitionError,
  FsmViolationError,
  JobNotEditableError,
  MinAdminInvariantError,
  NoEditChangesError,
} from '@app/domain';

export interface TRPCContext {
  db: typeof db;
  session: Session;
  userId: string | null;
  userRole: Role | null;
  /**
   * Lazily-resolved, per-request-memoized member-status gate for the caller
   * (ADR-015). Access gates (claim vs. post) key on this fresh portal read,
   * never on role. Resolved on first call and cached for the life of the
   * request; `unavailable` (fail closed) when there is no user or the portal
   * is unreachable.
   */
  memberStatus: () => Promise<MemberStatusGate>;
};

export const createTRPCContext = async ({
  req,
}: {
  req: Request;
}): Promise<TRPCContext> => {
  const session = await auth.api.getSession({ headers: req.headers });
  const userRoleRaw = (session?.user as { role?: string } | undefined)?.role;
  const userRole = isRole(userRoleRaw) ? userRoleRaw : null;
  const userId = session?.user.id ?? null;

  let memberStatusPromise: Promise<MemberStatusGate> | undefined;
  const memberStatus = (): Promise<MemberStatusGate> => {
    if (!userId) return Promise.resolve('unavailable');
    memberStatusPromise ??= getMemberStatusGate(userId);
    return memberStatusPromise;
  };

  return {
    db,
    session,
    userId,
    userRole,
    memberStatus,
  };
};

function isRole(value: unknown): value is Role {
  return value === 'Member' || value === 'Moderator' || value === 'Admin';
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
    if (cause instanceof JobNotEditableError) {
      return {
        ...shape,
        data: {
          ...shape.data,
          appCode: 'JOB_NOT_EDITABLE_IN_STATE' as const,
        },
      };
    }
    if (cause instanceof NoEditChangesError) {
      return {
        ...shape,
        data: {
          ...shape.data,
          appCode: 'NO_EDIT_CHANGES' as const,
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
    if (err instanceof JobNotEditableError) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: err.message,
        cause: err,
      });
    }
    if (err instanceof NoEditChangesError) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: err.message,
        cause: err,
      });
    }
    throw err;
  }
}
