import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { jobs, jobEnrollments } from '@app/db/schema';
import { authedProcedure } from '../trpc';

function pickJobId(input: unknown): string {
  if (input && typeof input === 'object' && 'jobId' in input) {
    const jobId = (input as { jobId?: unknown }).jobId;
    if (typeof jobId === 'string' && jobId.length > 0) return jobId;
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'jobId required' });
}

/**
 * Loads the job by `input.jobId` and requires the caller to be the posting
 * Alumni. Adds `ctx.job` for downstream use.
 */
export const jobPosterProcedure = authedProcedure.use(async ({ ctx, getRawInput, next }) => {
  const raw = await getRawInput();
  const jobId = pickJobId(raw);

  const [job] = await ctx.db
    .select({ id: jobs.id, postedBy: jobs.postedBy, state: jobs.state })
    .from(jobs)
    .where(eq(jobs.id, jobId));
  if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
  if (job.postedBy !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
  return next({ ctx: { ...ctx, job } });
});

/**
 * Requires the caller to be enrolled in the job referenced by `input.jobId`.
 */
export const enrolledProcedure = authedProcedure.use(async ({ ctx, getRawInput, next }) => {
  const raw = await getRawInput();
  const jobId = pickJobId(raw);
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' });

  const [row] = await ctx.db
    .select({ jobId: jobEnrollments.jobId })
    .from(jobEnrollments)
    .where(
      and(eq(jobEnrollments.jobId, jobId), eq(jobEnrollments.activeId, ctx.userId)),
    );
  if (!row) throw new TRPCError({ code: 'FORBIDDEN' });
  return next();
});
