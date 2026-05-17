import { desc, eq, sql } from 'drizzle-orm';
import {
  jobs,
  jobStateTransitions,
  users,
  JOB_STATES,
  type JobState,
  type Role,
} from '@app/db/schema';
import { router } from '../trpc';
import { adminProcedure } from '../middleware/role';

export const adminRouter = router({
  // PRD-007 R-02 / AC-03 — live aggregate counts grouped by job state.
  getAggregateCounts: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ state: jobs.state, count: sql<number>`count(*)::int` })
      .from(jobs)
      .groupBy(jobs.state);
    const base: Record<JobState, number> = {} as Record<JobState, number>;
    for (const s of JOB_STATES) base[s] = 0;
    for (const row of rows) {
      base[row.state as JobState] = row.count;
    }
    return base;
  }),

  // PRD-007 R-04 / AC-05 — disputed jobs with disputer info + age.
  listDisputed: adminProcedure.query(async ({ ctx }) => {
    // Latest jobStateTransition row with toState='disputed' per job — that's the
    // disputer. We aggregate via a subquery: pick the latest disputed transition.
    const disputedJobs = await ctx.db
      .select({
        id: jobs.id,
        description: jobs.description,
        duesAmount: jobs.duesAmount,
        postedBy: jobs.postedBy,
        disputeReason: jobs.disputeReason,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(eq(jobs.state, 'disputed' as JobState))
      .orderBy(desc(jobs.updatedAt));

    const results: Array<{
      id: string;
      description: string;
      duesAmount: string;
      postedBy: string;
      disputeReason: string | null;
      createdAt: Date;
      updatedAt: Date;
      disputer: {
        id: string | null;
        displayName: string | null;
        role: Role | null;
      } | null;
      disputedAt: Date | null;
    }> = [];

    for (const job of disputedJobs) {
      // PLAN-011 Trap 4 option (a): the disputer + age-of-dispute come from
      // the latest `to_state: 'disputed'` row in job_state_transitions, not
      // the latest transition overall — guard against post-dispute writes
      // by filtering on toState.
      const [transition] = await ctx.db
        .select({
          actorId: jobStateTransitions.actorId,
          createdAt: jobStateTransitions.createdAt,
        })
        .from(jobStateTransitions)
        .where(
          sql`${jobStateTransitions.jobId} = ${job.id} AND ${jobStateTransitions.toState} = 'disputed'`,
        )
        .orderBy(desc(jobStateTransitions.createdAt))
        .limit(1);

      let disputer: {
        id: string | null;
        displayName: string | null;
        role: Role | null;
      } | null = null;
      if (transition?.actorId) {
        const [user] = await ctx.db
          .select({
            id: users.id,
            displayName: users.displayName,
            role: users.role,
          })
          .from(users)
          .where(eq(users.id, transition.actorId));
        disputer = user
          ? { id: user.id, displayName: user.displayName, role: user.role }
          : { id: transition.actorId, displayName: null, role: null };
      }

      results.push({
        ...job,
        disputer,
        disputedAt: transition?.createdAt ?? null,
      });
    }

    return results;
  }),
});
