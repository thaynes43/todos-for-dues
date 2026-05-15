import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { approveJob, createJob, transitionJob } from '../../src/job-state-machine';
import { ConcurrentTransitionError } from '../../src/errors';
import {
  getAuditRows,
  getJobState,
  insertEnrollment,
  insertJob,
  resetAndSeedUsers,
  startTestDb,
  type SeedUsers,
  type TestDb,
} from './_db';

let testDb: TestDb;
let users: SeedUsers;

beforeAll(async () => {
  testDb = await startTestDb();
}, 120_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  users = await resetAndSeedUsers(testDb.pool);
});

describe('createJob — initial row + audit (CMD-01, ST-01 + ST-02 collapsed)', () => {
  it('writes a job row in awaiting_moderation + a fromState:null audit row', async () => {
    const { jobId } = await createJob({
      posterId: users.alumni,
      description: 'Stuff a pinata',
      duesAmount: 25,
      recommendedPeopleCount: 3,
    });

    expect(await getJobState(testDb.pool, jobId)).toBe('awaiting_moderation');

    const audit = await getAuditRows(testDb.pool, jobId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      fromState: null,
      toState: 'awaiting_moderation',
      actorId: users.alumni,
      actorKind: 'user',
    });
  });

  it('createJob.afterCommit fires once with the new jobId after commit', async () => {
    let observed: string | null = null;
    let calls = 0;
    const { jobId } = await createJob({
      posterId: users.alumni,
      description: 'Paint the rush room',
      duesAmount: 15,
      recommendedPeopleCount: 2,
      afterCommit: async (id) => {
        calls++;
        observed = id;
      },
    });

    expect(calls).toBe(1);
    expect(observed).toBe(jobId);
  });

  it('createJob.afterCommit failure is logged but does not propagate or rollback', async () => {
    const consoleError = console.error;
    const errors: unknown[] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      const { jobId } = await createJob({
        posterId: users.alumni,
        description: 'Demolish the deck',
        duesAmount: 80,
        recommendedPeopleCount: 4,
        afterCommit: async () => {
          throw new Error('Resend rate-limited');
        },
      });

      // Row and audit still present (the transaction committed before afterCommit ran).
      expect(await getJobState(testDb.pool, jobId)).toBe('awaiting_moderation');
      expect(await getAuditRows(testDb.pool, jobId)).toHaveLength(1);
      // The error was logged.
      expect(errors.length).toBe(1);
    } finally {
      console.error = consoleError;
    }
  });
});

describe('approveJob — two-row pattern (CMD-02, ST-03 + ST-05)', () => {
  it('writes user-actor + system-actor audit rows in one tx; jobs.state = enrollment_open', async () => {
    const { jobId } = await createJob({
      posterId: users.alumni,
      description: 'Help paint',
      duesAmount: 30,
      recommendedPeopleCount: 2,
    });
    // Clear createJob's audit row to make assertions cleaner — actually we'll just count from after.
    const before = await getAuditRows(testDb.pool, jobId);
    expect(before).toHaveLength(1); // the createJob row

    await approveJob({ jobId, moderatorId: users.moderator });

    expect(await getJobState(testDb.pool, jobId)).toBe('enrollment_open');

    const audit = await getAuditRows(testDb.pool, jobId);
    expect(audit).toHaveLength(3); // create + two approve rows

    // The two approveJob audit rows, in order:
    const approveRows = audit.slice(1);
    expect(approveRows[0]).toMatchObject({
      fromState: 'awaiting_moderation',
      toState: 'approved',
      actorId: users.moderator,
      actorKind: 'user',
    });
    expect(approveRows[1]).toMatchObject({
      fromState: 'approved',
      toState: 'enrollment_open',
      actorId: null,
      actorKind: 'system',
    });
  });

  it('rejects approveJob when current state is not awaiting_moderation', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'enrollment_open',
    });
    await expect(approveJob({ jobId, moderatorId: users.moderator })).rejects.toBeInstanceOf(
      ConcurrentTransitionError,
    );
  });
});

describe('transitionJob — single-row transitions (ST-04..ST-17)', () => {
  it('ST-04: reject persists rejection_reason + audit note', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'awaiting_moderation',
    });
    await transitionJob({
      jobId,
      expectedFromState: 'awaiting_moderation',
      event: 'reject',
      actor: { id: users.moderator, kind: 'user' },
      note: 'Dues too low',
      beforeStateWrite: async (tx) => {
        const { jobs } = await import('@app/db/schema');
        const { eq } = await import('drizzle-orm');
        await tx.update(jobs).set({ rejectionReason: 'Dues too low' }).where(eq(jobs.id, jobId));
      },
    });
    expect(await getJobState(testDb.pool, jobId)).toBe('rejected');
    const { rows } = await testDb.pool.query<{ rejection_reason: string }>(
      `SELECT rejection_reason FROM jobs WHERE id = $1`,
      [jobId],
    );
    expect(rows[0]!.rejection_reason).toBe('Dues too low');
    const audit = await getAuditRows(testDb.pool, jobId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      fromState: 'awaiting_moderation',
      toState: 'rejected',
      note: 'Dues too low',
      actorKind: 'user',
    });
  });

  it('ST-06: lock persists work_date via beforeStateWrite', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'enrollment_open',
    });
    await insertEnrollment(testDb.pool, jobId, users.active1);
    const workDate = new Date(Date.now() + 7 * 86_400_000);
    const isoNote = workDate.toISOString();

    await transitionJob({
      jobId,
      expectedFromState: 'enrollment_open',
      event: 'lock',
      actor: { id: users.alumni, kind: 'user' },
      note: isoNote,
      beforeStateWrite: async (tx) => {
        const { jobs } = await import('@app/db/schema');
        const { eq } = await import('drizzle-orm');
        await tx.update(jobs).set({ workDate }).where(eq(jobs.id, jobId));
      },
    });

    expect(await getJobState(testDb.pool, jobId)).toBe('locked');
    const { rows } = await testDb.pool.query<{ work_date: string }>(
      `SELECT work_date FROM jobs WHERE id = $1`,
      [jobId],
    );
    expect(new Date(rows[0]!.work_date).toISOString()).toBe(workDate.toISOString());
    const audit = await getAuditRows(testDb.pool, jobId);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.note).toBe(isoNote);
  });

  it('ST-07: reschedule clears work_date; audit note carries the prior ISO date', async () => {
    const priorDate = new Date(Date.now() + 7 * 86_400_000);
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'locked',
      workDate: priorDate,
    });

    await transitionJob({
      jobId,
      expectedFromState: 'locked',
      event: 'reschedule',
      actor: { id: users.alumni, kind: 'user' },
      note: priorDate.toISOString(),
      beforeStateWrite: async (tx) => {
        const { jobs } = await import('@app/db/schema');
        const { eq } = await import('drizzle-orm');
        await tx.update(jobs).set({ workDate: null }).where(eq(jobs.id, jobId));
      },
    });

    expect(await getJobState(testDb.pool, jobId)).toBe('enrollment_open');
    const { rows } = await testDb.pool.query<{ work_date: string | null }>(
      `SELECT work_date FROM jobs WHERE id = $1`,
      [jobId],
    );
    expect(rows[0]!.work_date).toBeNull();
    const audit = await getAuditRows(testDb.pool, jobId);
    expect(audit[0]?.note).toBe(priorDate.toISOString());
  });

  it('ST-08 + ST-09: cancel writes cancellation_reason from both enrollment_open and locked', async () => {
    for (const fromState of ['enrollment_open', 'locked'] as const) {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: fromState,
        workDate: fromState === 'locked' ? new Date(Date.now() + 86_400_000) : null,
      });
      await transitionJob({
        jobId,
        expectedFromState: fromState,
        event: 'cancel',
        actor: { id: users.alumni, kind: 'user' },
        note: 'venue closed',
        beforeStateWrite: async (tx) => {
          const { jobs } = await import('@app/db/schema');
          const { eq } = await import('drizzle-orm');
          await tx.update(jobs).set({ cancellationReason: 'venue closed' }).where(eq(jobs.id, jobId));
        },
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('cancelled');
      const { rows } = await testDb.pool.query<{ cancellation_reason: string }>(
        `SELECT cancellation_reason FROM jobs WHERE id = $1`,
        [jobId],
      );
      expect(rows[0]!.cancellation_reason).toBe('venue closed');
    }
  });

  it('ST-10: complete persists confirmed attendees + per-active dues credit summing to dues_amount', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'locked',
      duesAmount: '10.00',
      workDate: new Date(Date.now() + 86_400_000),
    });
    await insertEnrollment(testDb.pool, jobId, users.active1);
    await insertEnrollment(testDb.pool, jobId, users.active2);
    await insertEnrollment(testDb.pool, jobId, users.active3);

    const split = { [users.active1]: 334, [users.active2]: 333, [users.active3]: 333 };
    expect(split[users.active1]! + split[users.active2]! + split[users.active3]!).toBe(1000);

    await transitionJob({
      jobId,
      expectedFromState: 'locked',
      event: 'complete',
      actor: { id: users.alumni, kind: 'user' },
      beforeStateWrite: async (tx) => {
        const { jobEnrollments } = await import('@app/db/schema');
        const { eq, sql } = await import('drizzle-orm');
        await tx
          .update(jobEnrollments)
          .set({ confirmedAttendeeAt: sql`now()` })
          .where(eq(jobEnrollments.jobId, jobId));
      },
      afterStateWrite: async (tx) => {
        const { jobs } = await import('@app/db/schema');
        const { eq } = await import('drizzle-orm');
        await tx.update(jobs).set({ perActiveDuesCredit: split }).where(eq(jobs.id, jobId));
      },
    });

    expect(await getJobState(testDb.pool, jobId)).toBe('completed');
    const { rows } = await testDb.pool.query<{ per_active_dues_credit: Record<string, number> }>(
      `SELECT per_active_dues_credit FROM jobs WHERE id = $1`,
      [jobId],
    );
    const persisted = rows[0]!.per_active_dues_credit;
    const sum = Object.values(persisted).reduce((acc, cents) => acc + cents, 0);
    expect(sum).toBe(1000);
  });

  it('ST-11: revert clears confirmed attendees + per_active_dues_credit', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'completed',
      duesAmount: '10.00',
      perActiveDuesCredit: { [users.active1]: 1000 },
    });
    await insertEnrollment(testDb.pool, jobId, users.active1);
    await testDb.pool.query(
      `UPDATE job_enrollments SET confirmed_attendee_at = now() WHERE job_id = $1`,
      [jobId],
    );

    await transitionJob({
      jobId,
      expectedFromState: 'completed',
      event: 'revert',
      actor: { id: users.alumni, kind: 'user' },
      beforeStateWrite: async (tx) => {
        const { jobs, jobEnrollments } = await import('@app/db/schema');
        const { eq } = await import('drizzle-orm');
        await tx
          .update(jobEnrollments)
          .set({ confirmedAttendeeAt: null })
          .where(eq(jobEnrollments.jobId, jobId));
        await tx.update(jobs).set({ perActiveDuesCredit: null }).where(eq(jobs.id, jobId));
      },
    });

    expect(await getJobState(testDb.pool, jobId)).toBe('locked');
    const { rows } = await testDb.pool.query<{
      per_active_dues_credit: unknown;
      confirmed_count: string;
    }>(
      `SELECT j.per_active_dues_credit,
              (SELECT COUNT(*)::text FROM job_enrollments e
               WHERE e.job_id = j.id AND e.confirmed_attendee_at IS NOT NULL) AS confirmed_count
       FROM jobs j WHERE j.id = $1`,
      [jobId],
    );
    expect(rows[0]!.per_active_dues_credit).toBeNull();
    expect(rows[0]!.confirmed_count).toBe('0');
  });

  it('ST-12: payment_sent fires afterCommit hook', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'completed',
    });
    let fired = 0;
    await transitionJob({
      jobId,
      expectedFromState: 'completed',
      event: 'payment_sent',
      actor: { id: users.alumni, kind: 'user' },
      afterCommit: async () => {
        fired++;
      },
    });
    expect(await getJobState(testDb.pool, jobId)).toBe('payment_sent');
    expect(fired).toBe(1);
  });

  it('ST-13: confirm_receipt transitions to closed', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'payment_sent',
    });
    await transitionJob({
      jobId,
      expectedFromState: 'payment_sent',
      event: 'confirm_receipt',
      actor: { id: users.active1, kind: 'user' },
    });
    expect(await getJobState(testDb.pool, jobId)).toBe('closed');
  });

  it('ST-14: dispute persists dispute_reason + fires afterCommit', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'payment_sent',
    });
    let fired = 0;
    await transitionJob({
      jobId,
      expectedFromState: 'payment_sent',
      event: 'dispute',
      actor: { id: users.active1, kind: 'user' },
      note: 'did not attend',
      beforeStateWrite: async (tx) => {
        const { jobs } = await import('@app/db/schema');
        const { eq } = await import('drizzle-orm');
        await tx.update(jobs).set({ disputeReason: 'did not attend' }).where(eq(jobs.id, jobId));
      },
      afterCommit: async () => {
        fired++;
      },
    });
    expect(await getJobState(testDb.pool, jobId)).toBe('disputed');
    expect(fired).toBe(1);
    const { rows } = await testDb.pool.query<{ dispute_reason: string }>(
      `SELECT dispute_reason FROM jobs WHERE id = $1`,
      [jobId],
    );
    expect(rows[0]!.dispute_reason).toBe('did not attend');
  });

  it('ST-15..ST-17: resolve_closed / resolve_cancelled / resolve_payment_sent each work', async () => {
    const cases = [
      { event: 'resolve_closed' as const, expected: 'closed' },
      { event: 'resolve_cancelled' as const, expected: 'cancelled' },
      { event: 'resolve_payment_sent' as const, expected: 'payment_sent' },
    ];
    for (const { event, expected } of cases) {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'disputed',
        disputeReason: 'did not attend',
      });
      await transitionJob({
        jobId,
        expectedFromState: 'disputed',
        event,
        actor: { id: users.admin, kind: 'user' },
        note: 'admin resolution note',
      });
      expect(await getJobState(testDb.pool, jobId)).toBe(expected);
      const audit = await getAuditRows(testDb.pool, jobId);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.note).toBe('admin resolution note');
    }
  });
});

describe('terminal states reject every event', () => {
  it('throws FsmViolationError for every event on closed, cancelled, rejected', async () => {
    const { FsmViolationError } = await import('../../src/errors');
    const terminals = ['closed', 'cancelled', 'rejected'] as const;
    const events = [
      'approve',
      'reject',
      'lock',
      'cancel',
      'reschedule',
      'complete',
      'revert',
      'payment_sent',
      'confirm_receipt',
      'dispute',
      'resolve_closed',
      'resolve_cancelled',
      'resolve_payment_sent',
    ] as const;
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'closed',
    });
    for (const fromState of terminals) {
      for (const event of events) {
        await expect(
          transitionJob({
            jobId,
            expectedFromState: fromState,
            // Cast: simulate a runtime caller bypassing the TS check.
            event: event as unknown as never,
            actor: { id: users.admin, kind: 'user' },
          }),
        ).rejects.toBeInstanceOf(FsmViolationError);
      }
    }
  });
});

describe('optimistic concurrency', () => {
  it('two concurrent transitions on the same job → one succeeds, one ConcurrentTransitionError', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'enrollment_open',
    });
    await insertEnrollment(testDb.pool, jobId, users.active1);

    const callLock = () =>
      transitionJob({
        jobId,
        expectedFromState: 'enrollment_open',
        event: 'lock',
        actor: { id: users.alumni, kind: 'user' },
        beforeStateWrite: async (tx) => {
          const { jobs } = await import('@app/db/schema');
          const { eq } = await import('drizzle-orm');
          await tx
            .update(jobs)
            .set({ workDate: new Date(Date.now() + 86_400_000) })
            .where(eq(jobs.id, jobId));
        },
      });
    const callCancel = () =>
      transitionJob({
        jobId,
        expectedFromState: 'enrollment_open',
        event: 'cancel',
        actor: { id: users.alumni, kind: 'user' },
      });

    const results = await Promise.allSettled([callLock(), callCancel()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedReason).toBeInstanceOf(ConcurrentTransitionError);

    const audit = await getAuditRows(testDb.pool, jobId);
    expect(audit).toHaveLength(1); // only the winning transition wrote an audit row
  });
});

describe('transaction rollback', () => {
  it('beforeStateWrite throw rolls back the UPDATE + skips the audit-log INSERT', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'enrollment_open',
    });

    await expect(
      transitionJob({
        jobId,
        expectedFromState: 'enrollment_open',
        event: 'cancel',
        actor: { id: users.alumni, kind: 'user' },
        beforeStateWrite: async () => {
          throw new Error('hook explosion');
        },
      }),
    ).rejects.toThrowError('hook explosion');

    expect(await getJobState(testDb.pool, jobId)).toBe('enrollment_open');
    expect(await getAuditRows(testDb.pool, jobId)).toHaveLength(0);
  });
});

describe('afterCommit failure does not propagate', () => {
  it('afterCommit throwing leaves the transition committed; error is logged', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'completed',
    });
    const consoleError = console.error;
    const errors: unknown[] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      await transitionJob({
        jobId,
        expectedFromState: 'completed',
        event: 'payment_sent',
        actor: { id: users.alumni, kind: 'user' },
        afterCommit: async () => {
          throw new Error('email API down');
        },
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('payment_sent');
      expect(await getAuditRows(testDb.pool, jobId)).toHaveLength(1);
      expect(errors.length).toBe(1);
    } finally {
      console.error = consoleError;
    }
  });
});

