import 'server-only';
import { headers } from 'next/headers';
import { appRouter, createTRPCContext } from '@app/api';
import { createCallerFactory } from '@app/api/trpc';

const callerFactory = createCallerFactory(appRouter);

export async function getServerCaller() {
  const h = await headers();
  const req = new Request('http://internal/api/trpc', { headers: h });
  const ctx = await createTRPCContext({ req });
  return callerFactory(ctx);
}
