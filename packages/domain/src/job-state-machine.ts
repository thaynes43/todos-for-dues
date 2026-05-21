import { db } from '@app/db';
import {
  jobContentChanges,
  jobs,
  jobStateTransitions,
  type ActorKind,
  type JobState,
} from '@app/db/schema';
import { eq, sql } from 'drizzle-orm';
import {
  ConcurrentTransitionError,
  FsmViolationError,
  JobNotEditableError,
  NoEditChangesError,
} from './errors';

// Each entry is: from -> { eventName: to }.
// Adding a new transition = add an entry here AND a new test.
// Terminal states have an empty object. `posted` and `approved` are transient and
// never persisted in jobs.state — see createJob() and approveJob() below.
export const JOB_TRANSITIONS = {
  awaiting_moderation: {
    approve: 'enrollment_open', // ST-03 + ST-05 collapsed; approveJob() writes two audit rows
    reject: 'rejected', // ST-04
  },
  approved: {
    // PRD-011 R-05: material edit while approved demotes back to awaiting_moderation.
    // Routed through editJob(); the addendum on ADR-008 (2026-05-21) authorizes this arrow.
    material_edit: 'awaiting_moderation',
  },
  enrollment_open: {
    lock: 'locked', // ST-06
    cancel: 'cancelled', // ST-08
    // PRD-011 R-05: material edit while enrollment_open also demotes; enrollees stay enrolled.
    material_edit: 'awaiting_moderation',
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
  // PRD-010 R-01..R-07 — the tRPC layer (Zod on jobs.post) is the canonical
  // validation gate and always sends explicit values. These are optional on
  // the domain helper so unit tests that don't care about the enrichment
  // fields can omit them and fall back to the DB-default fill — matching the
  // same DEFAULTs the migration applies on a populated DB.
  posterContactKind?: 'email' | 'phone';
  posterContactValue?: string;
  location?: string;
  estimatedDurationHours?: number;
  additionalNotes?: string | null;
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
        // When omitted, the DB DEFAULTs from migration 0009 fill these in;
        // production traffic always provides them via the tRPC layer.
        ...(input.posterContactKind !== undefined && {
          posterContactKind: input.posterContactKind,
        }),
        ...(input.posterContactValue !== undefined && {
          posterContactValue: input.posterContactValue,
        }),
        ...(input.location !== undefined && { location: input.location }),
        ...(input.estimatedDurationHours !== undefined && {
          estimatedDurationHours: input.estimatedDurationHours.toFixed(2),
        }),
        additionalNotes: input.additionalNotes ?? null,
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

// PRD-011 — job content edit (EditJob command).
//
// Editable fields per R-03 (whitelist). Material fields per R-05 trigger a
// demote back to `awaiting_moderation` when the job is currently in `approved`
// or `enrollment_open`. Cosmetic-only edits leave state unchanged (R-06).
// Every successful edit writes a `job_content_changes` audit row with the diff
// (changed fields only — PLAN-017 Q-PLN-04). All writes atomic in one tx.
//
// The state change (material + approved|enrollment_open) is routed through
// `transitionJob` so the single-writer invariant on `jobs.state` holds and the
// `no-direct-state-writes` static-analysis test stays green.

export interface JobEditableFields {
  description?: string;
  duesAmount?: number;
  recommendedPeopleCount?: number;
  posterContactKind?: 'email' | 'phone';
  posterContactValue?: string;
  location?: string;
  estimatedDurationHours?: number;
  additionalNotes?: string | null;
}

export interface EditJobInput {
  jobId: string;
  actorId: string;
  edits: JobEditableFields;
}

export interface EditJobResult {
  state: JobState;
  material: boolean;
  diff: Record<string, { before: unknown; after: unknown }>;
  // The state the job was in immediately *before* the edit landed (and any
  // resulting demote). The tRPC layer uses this to decide whether to fire the
  // moderator [Re-review] email + per-Active notification fan-out.
  stateBeforeEdit: JobState;
}

const EDITABLE_STATES: ReadonlySet<JobState> = new Set([
  'awaiting_moderation',
  'approved',
  'enrollment_open',
]);

// PRD-011 R-05 — material fields. Cosmetic = anything in JobEditableFields not
// in this set (posterContactKind, posterContactValue, additionalNotes).
const MATERIAL_FIELDS: ReadonlySet<keyof JobEditableFields> = new Set([
  'description',
  'duesAmount',
  'recommendedPeopleCount',
  'location',
  'estimatedDurationHours',
]);

/**
 * Per-field comparison normalizer.
 *
 * Numerics on the row read back as PG `numeric` strings (`duesAmount`,
 * `estimatedDurationHours`); incoming `edits` are `number`s. Normalize both
 * sides to plain JS numbers before diffing so e.g. `'25.00'` vs. `25` does NOT
 * register as a change. Null-equal-to-null is intentional.
 */
function valuesDiffer(field: keyof JobEditableFields, before: unknown, after: unknown): boolean {
  if (field === 'duesAmount' || field === 'estimatedDurationHours') {
    const b = before == null ? null : Number(before);
    const a = after == null ? null : Number(after);
    return b !== a;
  }
  if (field === 'additionalNotes') {
    const b = (before ?? null) as string | null;
    const a = (after ?? null) as string | null;
    return b !== a;
  }
  return before !== after;
}

type JobRow = {
  state: JobState;
  description: string;
  duesAmount: string;
  recommendedPeopleCount: number;
  posterContactKind: 'email' | 'phone';
  posterContactValue: string;
  location: string;
  estimatedDurationHours: string;
  additionalNotes: string | null;
};

function buildDiff(
  current: JobRow,
  edits: JobEditableFields,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(edits) as Array<keyof JobEditableFields>) {
    const after = edits[key];
    if (after === undefined) continue;
    const before = current[key as keyof JobRow] as unknown;
    if (valuesDiffer(key, before, after)) {
      // Store numerics as numbers (not PG strings) so the diff is consumer-friendly.
      const normalizedBefore =
        key === 'duesAmount' || key === 'estimatedDurationHours'
          ? before == null
            ? null
            : Number(before)
          : before;
      diff[key] = { before: normalizedBefore, after: after as unknown };
    }
  }
  return diff;
}

function isMaterialDiff(diff: Record<string, unknown>): boolean {
  for (const key of Object.keys(diff)) {
    if (MATERIAL_FIELDS.has(key as keyof JobEditableFields)) return true;
  }
  return false;
}

type Tx2 = Parameters<Parameters<typeof db.transaction>[0]>[0];

function buildJobUpdateSet(edits: JobEditableFields): Record<string, unknown> {
  const set: Record<string, unknown> = { updatedAt: sql`now()` };
  if (edits.description !== undefined) set.description = edits.description;
  if (edits.duesAmount !== undefined) set.duesAmount = edits.duesAmount.toFixed(2);
  if (edits.recommendedPeopleCount !== undefined) {
    set.recommendedPeopleCount = edits.recommendedPeopleCount;
  }
  if (edits.posterContactKind !== undefined) set.posterContactKind = edits.posterContactKind;
  if (edits.posterContactValue !== undefined) set.posterContactValue = edits.posterContactValue;
  if (edits.location !== undefined) set.location = edits.location;
  if (edits.estimatedDurationHours !== undefined) {
    set.estimatedDurationHours = edits.estimatedDurationHours.toFixed(2);
  }
  if (edits.additionalNotes !== undefined) {
    set.additionalNotes = edits.additionalNotes ?? null;
  }
  return set;
}

async function applyEditUpdateAndAudit(
  tx: Tx2,
  input: EditJobInput,
  diff: Record<string, { before: unknown; after: unknown }>,
  stateAtEdit: JobState,
): Promise<void> {
  const set = buildJobUpdateSet(input.edits);
  await tx.update(jobs).set(set).where(eq(jobs.id, input.jobId));
  await tx.insert(jobContentChanges).values({
    jobId: input.jobId,
    actorId: input.actorId,
    diff,
    stateAtEdit,
  });
}

export async function editJob(input: EditJobInput): Promise<EditJobResult> {
  // Pre-flight read so we can validate state + compute diff before opening a tx.
  // The transitionJob optimistic check (or the in-tx re-read below) protects
  // against concurrent state changes.
  const [pre] = await db
    .select({
      state: jobs.state,
      description: jobs.description,
      duesAmount: jobs.duesAmount,
      recommendedPeopleCount: jobs.recommendedPeopleCount,
      posterContactKind: jobs.posterContactKind,
      posterContactValue: jobs.posterContactValue,
      location: jobs.location,
      estimatedDurationHours: jobs.estimatedDurationHours,
      additionalNotes: jobs.additionalNotes,
    })
    .from(jobs)
    .where(eq(jobs.id, input.jobId));

  if (!pre) {
    throw new JobNotEditableError(`Job ${input.jobId} not found`);
  }
  if (!EDITABLE_STATES.has(pre.state)) {
    throw new JobNotEditableError(
      `Job ${input.jobId} is in state '${pre.state}' and cannot be edited`,
    );
  }

  const diff = buildDiff(pre, input.edits);
  if (Object.keys(diff).length === 0) {
    throw new NoEditChangesError('No changes detected — the edit is a no-op.');
  }

  const material = isMaterialDiff(diff);

  // R-05 demote path: material edit while in approved or enrollment_open.
  if (material && (pre.state === 'approved' || pre.state === 'enrollment_open')) {
    await transitionJob({
      jobId: input.jobId,
      expectedFromState: pre.state,
      event: 'material_edit',
      actor: { id: input.actorId, kind: 'user' },
      beforeStateWrite: async (tx) => {
        await applyEditUpdateAndAudit(tx, input, diff, pre.state);
      },
    });
    return {
      state: 'awaiting_moderation',
      material: true,
      diff,
      stateBeforeEdit: pre.state,
    };
  }

  // No-state-change path (cosmetic-only, or material-but-already-awaiting_moderation).
  // Open a normal tx; re-check state inside to catch concurrent terminal moves.
  await db.transaction(async (tx) => {
    const [recheck] = await tx
      .select({ state: jobs.state })
      .from(jobs)
      .where(eq(jobs.id, input.jobId));
    if (!recheck) {
      throw new JobNotEditableError(`Job ${input.jobId} not found`);
    }
    if (!EDITABLE_STATES.has(recheck.state)) {
      throw new JobNotEditableError(
        `Job ${input.jobId} is in state '${recheck.state}' and cannot be edited`,
      );
    }
    await applyEditUpdateAndAudit(tx, input, diff, recheck.state);
  });

  return {
    state: pre.state,
    material,
    diff,
    stateBeforeEdit: pre.state,
  };
}
