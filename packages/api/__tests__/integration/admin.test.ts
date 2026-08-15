import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  caller,
  insertEnrollment,
  insertJob,
  makeCtx,
  resetAndSeedUsers,
  startTestDb,
  type SeedUsers,
  type TestDb,
} from './_setup';

let testDb: TestDb;
let users: SeedUsers;

beforeAll(async () => {
  testDb = await startTestDb();
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  users = await resetAndSeedUsers(testDb.pool);
});

describe('admin router', () => {
  describe('getAggregateCounts — PRD-007 R-02 / AC-03', () => {
    it('returns a map of state → count, zero for absent states', async () => {
      await insertJob(testDb.pool, { posterId: users.alumni, state: 'awaiting_moderation' });
      await insertJob(testDb.pool, { posterId: users.alumni, state: 'awaiting_moderation' });
      await insertJob(testDb.pool, { posterId: users.alumni, state: 'enrollment_open' });
      await insertJob(testDb.pool, { posterId: users.alumni, state: 'closed' });

      const result = await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .admin.getAggregateCounts();
      expect(result.awaiting_moderation).toBe(2);
      expect(result.enrollment_open).toBe(1);
      expect(result.closed).toBe(1);
      expect(result.disputed).toBe(0);
    });

    it('AC-02: non-Admin returns FORBIDDEN', async () => {
      await expect(
        caller(makeCtx({ userId: users.moderator, role: 'Moderator' }))
          .admin.getAggregateCounts(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('listDisputed — PRD-007 R-04 / AC-05', () => {
    it('returns disputed jobs with disputer info', async () => {
      // Seed a job in disputed via FSM transitions to get a clean audit trail.
      const c = caller(makeCtx({ userId: users.alumni, role: 'Alumni' }));
      const moderator = caller(makeCtx({ userId: users.moderator, role: 'Moderator' }));
      const active = caller(makeCtx({ userId: users.active1, role: 'Active' }));

      const { jobId } = await c.jobs.post({
        description: 'Pull weeds',
        duesAmount: 30,
        recommendedPeopleCount: 1,
        posterContactKind: 'email',
        posterContactValue: 'test-contact@example.com',
        location: 'Test location',
        estimatedDurationHours: 1.5,
      });
      await moderator.jobs.approve({ jobId });
      await active.jobs.enroll({ jobId });
      await c.jobs.lock({
        jobId,
        workDate: new Date(Date.now() + 86_400_000).toISOString(),
      });
      await c.jobs.complete({ jobId, confirmedAttendees: [users.active1] });
      await c.jobs.markPaymentSent({ jobId });
      await active.jobs.dispute({ jobId, reason: 'Did not receive payment' });

      const list = await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .admin.listDisputed();
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe(jobId);
      expect(list[0]!.disputeReason).toBe('Did not receive payment');
      expect(list[0]!.disputer?.id).toBe(users.active1);
      // ADR-015: the disputer's ROLE is Member (their orthogonal member
      // status is active — but that never touches role).
      expect(list[0]!.disputer?.role).toBe('Member');
      expect(list[0]!.disputedAt).toBeInstanceOf(Date);
    });

    it('disputedAt reflects the latest dispute transition after dispute → resolve → re-dispute (PLAN-011 Trap 4)', async () => {
      // Drive a job through dispute → resolve-as-payment-sent (false alarm)
      // → re-dispute. The disputedAt projection should track the re-dispute
      // timestamp, not the original one, because the FSM filters on the
      // latest to_state = 'disputed' row.
      const c = caller(makeCtx({ userId: users.alumni, role: 'Alumni' }));
      const moderator = caller(makeCtx({ userId: users.moderator, role: 'Moderator' }));
      const active = caller(makeCtx({ userId: users.active1, role: 'Active' }));
      const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));

      const { jobId } = await c.jobs.post({
        description: 'Pull weeds II',
        duesAmount: 30,
        recommendedPeopleCount: 1,
        posterContactKind: 'email',
        posterContactValue: 'test-contact@example.com',
        location: 'Test location',
        estimatedDurationHours: 1.5,
      });
      await moderator.jobs.approve({ jobId });
      await active.jobs.enroll({ jobId });
      await c.jobs.lock({
        jobId,
        workDate: new Date(Date.now() + 86_400_000).toISOString(),
      });
      await c.jobs.complete({ jobId, confirmedAttendees: [users.active1] });
      await c.jobs.markPaymentSent({ jobId });
      await active.jobs.dispute({ jobId, reason: 'first dispute' });

      const firstDisputeAt = (
        await testDb.pool.query<{ created_at: Date }>(
          `SELECT created_at FROM job_state_transitions WHERE job_id = $1 AND to_state = 'disputed' ORDER BY created_at DESC LIMIT 1`,
          [jobId],
        )
      ).rows[0]!.created_at;

      await admin.jobs.resolveDisputeAsPaymentSent({
        jobId,
        note: 'false-alarm — treasurer just credited',
      });
      // Re-dispute. Sleep a sliver so the created_at timestamps differ.
      await new Promise((r) => setTimeout(r, 10));
      await active.jobs.dispute({ jobId, reason: 'second dispute' });

      const latestDisputeAt = (
        await testDb.pool.query<{ created_at: Date }>(
          `SELECT created_at FROM job_state_transitions WHERE job_id = $1 AND to_state = 'disputed' ORDER BY created_at DESC LIMIT 1`,
          [jobId],
        )
      ).rows[0]!.created_at;
      expect(latestDisputeAt.getTime()).toBeGreaterThan(firstDisputeAt.getTime());

      const list = await admin.admin.listDisputed();
      const row = list.find((r) => r.id === jobId);
      // Latest dispute wins (not the first).
      expect(row?.disputedAt?.getTime()).toBe(latestDisputeAt.getTime());
      expect(row?.disputer?.id).toBe(users.active1);
    });

    it('AC-02: non-Admin returns FORBIDDEN', async () => {
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).admin.listDisputed(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('returns empty array when no disputed jobs', async () => {
      // Seed one closed job to verify filtering
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'closed',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);

      const list = await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .admin.listDisputed();
      expect(list).toEqual([]);
    });
  });
});
