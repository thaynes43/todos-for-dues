import { db } from '@app/db';
import {
  jobs,
  jobStateTransitions,
  type ActorKind,
  type JobState,
} from '@app/db/schema';
import { sql } from 'drizzle-orm';
import { ConcurrentTransitionError, FsmViolationError } from './errors';

// Each entry is: from -> { eventName: to }.
// Adding a new transition = add an entry here AND a new test.
// Terminal states have an empty object. `posted` and `approved` are transient and
// never persisted in jobs.state — see createJob() and approveJob() below.
export const JOB_TRANSITIONS = {
  awaiting_moderation: {
    approve: 'enrollment_open', // ST-03 + ST-05 collapsed; approveJob() writes two audit rows
    reject: 'rejected', // ST-04
  },
  approved: {}, // transient; never persisted
  enrollment_open: {
    lock: 'locked', // ST-06
    cancel: 'cancelled', // ST-08
  },
  locked: {
    reschedule: 'enrollment_open', // ST-07
    complete: 'completed', // ST-10
    cancel: 'cancelled', // ST-09
  },
  completed: {
    revert: 'locked', // ST-11
    payment_sent: 'payment_sent', // ST-12
  },
  payment_sent: {
    confirm_receipt: 'closed', // ST-13
    dispute: 'disputed', // ST-14
  },
  disputed: {
    resolve_closed: 'closed', // ST-15
    resolve_cancelled: 'cancelled', // ST-16
    resolve_payment_sent: 'payment_sent', // ST-17
  },
  // Terminal states have no outgoing transitions.
  closed: {},
  cancelled: {},
  rejected: {},
} as const satisfies Record<JobState, Partial<Record<string, JobState>>>;

export type JobEvent<S extends JobState> = keyof (typeof JOB_TRANSITIONS)[S];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface TransitionJobInput<S extends JobState, E extends JobEvent<S>> {
  jobId: string;
  expectedFromState: S;
  event: E;
  actor: { id: string; kind: ActorKind } | { id: null; kind: 'system' };
  note?: string;
  beforeStateWrite?: (tx: Tx) => Promise<void>;
  afterStateWrite?: (tx: Tx) => Promise<void>;
  afterCommit?: () => Promise<void>;
}

export async function transitionJob<S extends JobState, E extends JobEvent<S>>(
  input: TransitionJobInput<S, E>,
): Promise<void> {
  const toState = (JOB_TRANSITIONS[input.expectedFromState] as Record<string, JobState | undefined>)[
    input.event as string
  ];
  if (!toState) {
    throw new FsmViolationError(
      `No transition '${String(input.event)}' from '${input.expectedFromState}'`,
    );
  }

  await db.transaction(async (tx) => {
    const result = await tx
      .update(jobs)
      .set({ state: toState, updatedAt: sql`now()` })
      .where(
        sql`${jobs.id} = ${input.jobId} AND ${jobs.state} = ${input.expectedFromState}`,
      )
      .returning({ id: jobs.id });

    if (result.length === 0) {
      throw new ConcurrentTransitionError(
        `Job ${input.jobId} is not in state '${input.expectedFromState}' (state changed concurrently or job missing)`,
      );
    }

    if (input.beforeStateWrite) await input.beforeStateWrite(tx);
    if (input.afterStateWrite) await input.afterStateWrite(tx);

    await tx.insert(jobStateTransitions).values({
      jobId: input.jobId,
      fromState: input.expectedFromState,
      toState,
      actorId: input.actor.id,
      actorKind: input.actor.kind,
      note: input.note ?? null,
    });
  });

  if (input.afterCommit) {
    try {
      await input.afterCommit();
    } catch (err) {
      // Log but don't fail — the transition committed; side effect is best-effort.
      console.error(`afterCommit hook failed for job ${input.jobId}:`, err);
    }
  }
}

export interface CreateJobInput {
  posterId: string;
  description: string;
  duesAmount: number;
  recommendedPeopleCount: number;
  afterCommit?: (jobId: string) => Promise<void>;
}

export async function createJob(input: CreateJobInput): Promise<{ jobId: string }> {
  const { jobId } = await db.transaction(async (tx) => {
    const [job] = await tx
      .insert(jobs)
      .values({
        postedBy: input.posterId,
        description: input.description,
        duesAmount: input.duesAmount.toFixed(2),
        recommendedPeopleCount: input.recommendedPeopleCount,
        state: 'awaiting_moderation',
      })
      .returning({ id: jobs.id });

    if (!job) {
      throw new Error('createJob: insert returned no rows');
    }

    await tx.insert(jobStateTransitions).values({
      jobId: job.id,
      fromState: null,
      toState: 'awaiting_moderation',
      actorId: input.posterId,
      actorKind: 'user',
    });

    return { jobId: job.id };
  });

  if (input.afterCommit) {
    try {
      await input.afterCommit(jobId);
    } catch (err) {
      console.error(`createJob.afterCommit failed for job ${jobId}:`, err);
    }
  }

  return { jobId };
}

export interface ApproveJobInput {
  jobId: string;
  moderatorId: string;
}

export async function approveJob(input: ApproveJobInput): Promise<void> {
  await db.transaction(async (tx) => {
    const result = await tx
      .update(jobs)
      .set({ state: 'enrollment_open', updatedAt: sql`now()` })
      .where(sql`${jobs.id} = ${input.jobId} AND ${jobs.state} = 'awaiting_moderation'`)
      .returning({ id: jobs.id });

    if (result.length === 0) {
      throw new ConcurrentTransitionError(
        `Job ${input.jobId} is not in state 'awaiting_moderation' (state changed concurrently or job missing)`,
      );
    }

    // User-actor audit row for the conceptual approval (ST-03; never persisted as 'approved').
    await tx.insert(jobStateTransitions).values({
      jobId: input.jobId,
      fromState: 'awaiting_moderation',
      toState: 'approved',
      actorId: input.moderatorId,
      actorKind: 'user',
    });
    // System-actor audit row for the immediate enrollment-open transition (ST-05).
    await tx.insert(jobStateTransitions).values({
      jobId: input.jobId,
      fromState: 'approved',
      toState: 'enrollment_open',
      actorId: null,
      actorKind: 'system',
    });
  });
}

export interface RecordRelationshipEventInput {
  jobId: string;
  // The job's current state at the moment of the event — both fromState and toState
  // are set to this value so the audit-log row is self-describing as a non-FSM event.
  currentState: JobState;
  event: 'enroll' | 'unenroll';
  actor: { id: string; kind: 'user' };
  // Optional: persist relationship-table mutations atomically with the audit row.
  beforeAuditWrite?: (tx: Tx) => Promise<void>;
}

export async function recordRelationshipEvent(
  input: RecordRelationshipEventInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (input.beforeAuditWrite) await input.beforeAuditWrite(tx);

    await tx.insert(jobStateTransitions).values({
      jobId: input.jobId,
      fromState: input.currentState,
      toState: input.currentState,
      actorId: input.actor.id,
      actorKind: input.actor.kind,
      note: input.event,
    });
  });
}
