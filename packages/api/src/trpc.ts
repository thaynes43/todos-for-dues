import { initTRPC } from '@trpc/server';
import { db } from '@app/db';

export interface TRPCContext {
  db: typeof db;
  session: null;
  userId: string | null;
  userRole: null;
}

export const createTRPCContext = async (_opts: { req: Request }): Promise<TRPCContext> => {
  return {
    db,
    session: null,
    userId: null,
    userRole: null,
  };
};

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
