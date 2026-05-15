import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordRelationshipEvent } from '../../src/job-state-machine';
import {
  getAuditRows,
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

describe('recordRelationshipEvent — enroll / unenroll (DESIGN-002 §4.1.5)', () => {
  it('enroll: writes job_enrollments row + audit row atomically (fromState == toState == currentState)', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'enrollment_open',
    });
    await recordRelationshipEvent({
      jobId,
      currentState: 'enrollment_open',
      event: 'enroll',
      actor: { id: users.active1, kind: 'user' },
      beforeAuditWrite: async (tx) => {
        const { jobEnrollments } = await import('@app/db/schema');
        await tx.insert(jobEnrollments).values({
          jobId,
          activeId: users.active1,
        });
      },
    });

    const { rows: enrollment } = await testDb.pool.query<{ active_id: string }>(
      `SELECT active_id FROM job_enrollments WHERE job_id = $1`,
      [jobId],
    );
    expect(enrollment).toHaveLength(1);
    expect(enrollment[0]!.active_id).toBe(users.active1);

    const audit = await getAuditRows(testDb.pool, jobId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      fromState: 'enrollment_open',
      toState: 'enrollment_open',
      actorId: users.active1,
      actorKind: 'user',
      note: 'enroll',
    });
  });

  it('unenroll: deletes job_enrollments row + writes audit row atomically', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'enrollment_open',
    });
    await insertEnrollment(testDb.pool, jobId, users.active1);

    await recordRelationshipEvent({
      jobId,
      currentState: 'enrollment_open',
      event: 'unenroll',
      actor: { id: users.active1, kind: 'user' },
      beforeAuditWrite: async (tx) => {
        const { jobEnrollments } = await import('@app/db/schema');
        const { and, eq } = await import('drizzle-orm');
        await tx
          .delete(jobEnrollments)
          .where(
            and(eq(jobEnrollments.jobId, jobId), eq(jobEnrollments.activeId, users.active1)),
          );
      },
    });

    const { rows: enrollment } = await testDb.pool.query(
      `SELECT * FROM job_enrollments WHERE job_id = $1`,
      [jobId],
    );
    expect(enrollment).toHaveLength(0);

    const audit = await getAuditRows(testDb.pool, jobId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      fromState: 'enrollment_open',
      toState: 'enrollment_open',
      actorId: users.active1,
      actorKind: 'user',
      note: 'unenroll',
    });
  });

  it('rolls back on beforeAuditWrite throw — neither write lands', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'enrollment_open',
    });

    await expect(
      recordRelationshipEvent({
        jobId,
        currentState: 'enrollment_open',
        event: 'enroll',
        actor: { id: users.active1, kind: 'user' },
        beforeAuditWrite: async () => {
          throw new Error('hook explosion');
        },
      }),
    ).rejects.toThrowError('hook explosion');

    const { rows: enrollment } = await testDb.pool.query(
      `SELECT * FROM job_enrollments WHERE job_id = $1`,
      [jobId],
    );
    expect(enrollment).toHaveLength(0);

    const audit = await getAuditRows(testDb.pool, jobId);
    expect(audit).toHaveLength(0);
  });
});
