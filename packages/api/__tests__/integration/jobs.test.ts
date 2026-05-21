import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setResendForTests } from '@app/notifications';
import { JobNotEditableError, NoEditChangesError } from '@app/domain';
import {
  caller,
  getAuditRows,
  getJobState,
  insertEnrollment,
  insertJob,
  makeCtx,
  resetAndSeedUsers,
  startTestDb,
  unauthedCtx,
  type SeedUsers,
  type TestDb,
} from './_setup';

const mockSend = vi.fn();

let testDb: TestDb;
let users: SeedUsers;

const FUTURE_DATE = () => new Date(Date.now() + 7 * 86_400_000).toISOString();
const ORIGINAL_API_KEY = process.env.RESEND_API_KEY;

beforeAll(async () => {
  testDb = await startTestDb();
  process.env.RESEND_API_KEY = 'test-key';
  __setResendForTests({ emails: { send: mockSend as never } });
}, 180_000);

afterAll(async () => {
  __setResendForTests(undefined);
  await testDb?.stop();
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = ORIGINAL_API_KEY;
  }
});

beforeEach(async () => {
  users = await resetAndSeedUsers(testDb.pool);
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: 'mocked-id' }, error: null });
});

async function seedNotificationSettings(): Promise<void> {
  for (const [key, value] of [
    ['admin_recipient_email', 'admins@chapter.invalid'],
    ['treasurer_recipient_email', 'treasurer@chapter.invalid'],
    ['moderators_recipient_email', 'mods@chapter.invalid'],
    ['chapter_display_name', 'Test Chapter'],
  ] as const) {
    await testDb.pool.query(
      `INSERT INTO chapter_settings (key, value) VALUES ($1, to_jsonb($2::text))
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  }
}

describe('jobs router', () => {
  // ─── post ──────────────────────────────────────────────────────────
  describe('post — PRD-002 CMD-01', () => {
    it('AC-01: Alumni posts a valid job; state=awaiting_moderation; audit row recorded', async () => {
      const { jobId } = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.post({
        description: 'Clean the lawn',
        duesAmount: 50,
        recommendedPeopleCount: 3,
        posterContactKind: 'email',
        posterContactValue: 'test-contact@example.com',
        location: 'Test location',
        estimatedDurationHours: 1.5,
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

    it('AC-02: rejects dues = 0', async () => {
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.post({
          description: 'x',
          duesAmount: 0,
          recommendedPeopleCount: 1,
          posterContactKind: 'email',
          posterContactValue: 'test-contact@example.com',
          location: 'Test location',
          estimatedDurationHours: 1.5,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('AC-03: rejects dues = -10', async () => {
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.post({
          description: 'x',
          duesAmount: -10,
          recommendedPeopleCount: 1,
          posterContactKind: 'email',
          posterContactValue: 'test-contact@example.com',
          location: 'Test location',
          estimatedDurationHours: 1.5,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('AC-04: rejects empty description', async () => {
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.post({
          description: '   ',
          duesAmount: 25,
          recommendedPeopleCount: 1,
          posterContactKind: 'email',
          posterContactValue: 'test-contact@example.com',
          location: 'Test location',
          estimatedDurationHours: 1.5,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('AC-05: rejects recommended count = 0', async () => {
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.post({
          description: 'x',
          duesAmount: 25,
          recommendedPeopleCount: 0,
          posterContactKind: 'email',
          posterContactValue: 'test-contact@example.com',
          location: 'Test location',
          estimatedDurationHours: 1.5,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('rejects without session — UNAUTHORIZED', async () => {
      await expect(
        caller(unauthedCtx()).jobs.post({
          description: 'x',
          duesAmount: 25,
          recommendedPeopleCount: 1,
          posterContactKind: 'email',
          posterContactValue: 'test-contact@example.com',
          location: 'Test location',
          estimatedDurationHours: 1.5,
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects Active — FORBIDDEN', async () => {
      await expect(
        caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.post({
          description: 'x',
          duesAmount: 25,
          recommendedPeopleCount: 1,
          posterContactKind: 'email',
          posterContactValue: 'test-contact@example.com',
          location: 'Test location',
          estimatedDurationHours: 1.5,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── approve ───────────────────────────────────────────────────────
  describe('approve — PRD-002 CMD-02', () => {
    it('AC-08: Moderator approves; two audit rows; state=enrollment_open', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
      });
      await caller(makeCtx({ userId: users.moderator, role: 'Moderator' })).jobs.approve({
        jobId,
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('enrollment_open');
      const audit = await getAuditRows(testDb.pool, jobId);
      expect(audit.map((r) => r.toState)).toEqual(['approved', 'enrollment_open']);
      expect(audit[0]?.actorId).toBe(users.moderator);
      expect(audit[1]?.actorKind).toBe('system');
    });

    it('AC-09: Moderator approves a job they themselves posted (self-approval)', async () => {
      const c = caller(makeCtx({ userId: users.moderator, role: 'Moderator' }));
      const { jobId } = await c.jobs.post({
        description: 'mod self-post',
        duesAmount: 10,
        recommendedPeopleCount: 1,
        posterContactKind: 'email',
        posterContactValue: 'test-contact@example.com',
        location: 'Test location',
        estimatedDurationHours: 1.5,
      });
      await c.jobs.approve({ jobId });
      expect(await getJobState(testDb.pool, jobId)).toBe('enrollment_open');
    });

    it('rejects non-Moderator — FORBIDDEN', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
      });
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.approve({ jobId }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── reject ────────────────────────────────────────────────────────
  describe('reject — PRD-002 CMD-03', () => {
    it('AC-10: Moderator rejects with reason; reason persisted', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
      });
      await caller(makeCtx({ userId: users.moderator, role: 'Moderator' })).jobs.reject({
        jobId,
        reason: 'duplicate posting',
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('rejected');
      const { rows } = await testDb.pool.query<{ rejection_reason: string }>(
        `SELECT rejection_reason FROM jobs WHERE id = $1`,
        [jobId],
      );
      expect(rows[0]?.rejection_reason).toBe('duplicate posting');
    });

    it('AC-11: empty reason → BAD_REQUEST', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
      });
      await expect(
        caller(makeCtx({ userId: users.moderator, role: 'Moderator' })).jobs.reject({
          jobId,
          reason: '   ',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('AC-13: rejected is terminal — subsequent transition → INTERNAL_SERVER_ERROR (FSM violation)', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'rejected',
      });
      // Try to lock from rejected (via jobPosterProcedure → invalid event from terminal)
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.lock({
          jobId,
          workDate: FUTURE_DATE(),
        }),
      ).rejects.toBeTruthy();
    });
  });

  // ─── enroll ────────────────────────────────────────────────────────
  describe('enroll — PRD-004 CMD-04', () => {
    it('AC-02: Active enrolls in enrollment_open job', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.enroll({ jobId });
      const { rows } = await testDb.pool.query(
        `SELECT * FROM job_enrollments WHERE job_id = $1 AND active_id = $2`,
        [jobId, users.active1],
      );
      expect(rows).toHaveLength(1);
      // Relationship-event audit row written once
      const audit = await getAuditRows(testDb.pool, jobId);
      expect(audit.filter((r) => r.note === 'enroll')).toHaveLength(1);
    });

    it('AC-03: enroll is idempotent — second call no-ops', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      const c = caller(makeCtx({ userId: users.active1, role: 'Active' }));
      await c.jobs.enroll({ jobId });
      await c.jobs.enroll({ jobId });
      const { rows } = await testDb.pool.query(
        `SELECT * FROM job_enrollments WHERE job_id = $1 AND active_id = $2`,
        [jobId, users.active1],
      );
      expect(rows).toHaveLength(1);
      const audit = await getAuditRows(testDb.pool, jobId);
      expect(audit.filter((r) => r.note === 'enroll')).toHaveLength(1);
    });

    it('rejects when job not in enrollment_open', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
      });
      await expect(
        caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.enroll({ jobId }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('rejects non-Active — FORBIDDEN', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.enroll({ jobId }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── unenroll ──────────────────────────────────────────────────────
  describe('unenroll — PRD-004 CMD-05', () => {
    it('AC-04: Active unenrolls; row gone; audit row written', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.unenroll({ jobId });
      const { rows } = await testDb.pool.query(
        `SELECT * FROM job_enrollments WHERE job_id = $1 AND active_id = $2`,
        [jobId, users.active1],
      );
      expect(rows).toHaveLength(0);
      const audit = await getAuditRows(testDb.pool, jobId);
      expect(audit.filter((r) => r.note === 'unenroll')).toHaveLength(1);
    });

    it('AC-05: cannot unenroll once locked', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'locked',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await expect(
        caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.unenroll({ jobId }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('idempotent — unenroll when not enrolled is a no-op', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.unenroll({ jobId });
      const audit = await getAuditRows(testDb.pool, jobId);
      expect(audit.filter((r) => r.note === 'unenroll')).toHaveLength(0);
    });
  });

  // ─── lock ──────────────────────────────────────────────────────────
  describe('lock — PRD-004 CMD-06', () => {
    it('AC-08: poster locks with future workDate; state=locked; workDate persisted', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      const workDate = FUTURE_DATE();
      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.lock({
        jobId,
        workDate,
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('locked');
      const { rows } = await testDb.pool.query<{ work_date: string }>(
        `SELECT work_date FROM jobs WHERE id = $1`,
        [jobId],
      );
      expect(rows[0]?.work_date).toBeTruthy();
    });

    it('AC-09: non-poster Alumni → FORBIDDEN', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await expect(
        caller(makeCtx({ userId: users.alumni2, role: 'Alumni' })).jobs.lock({
          jobId,
          workDate: FUTURE_DATE(),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('AC-10: workDate in the past → BAD_REQUEST', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      const past = new Date(Date.now() - 86_400_000).toISOString();
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.lock({
          jobId,
          workDate: past,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('AC-11: zero enrollees → BAD_REQUEST', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.lock({
          jobId,
          workDate: FUTURE_DATE(),
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // ─── reschedule ────────────────────────────────────────────────────
  describe('reschedule — PRD-004 CMD-07', () => {
    it('AC-12: reschedule preserves roster; state→enrollment_open; workDate cleared', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'locked',
        workDate: new Date(Date.now() + 86_400_000),
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await insertEnrollment(testDb.pool, jobId, users.active2);

      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.reschedule({
        jobId,
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('enrollment_open');
      const { rows: jobRows } = await testDb.pool.query<{ work_date: string | null }>(
        `SELECT work_date FROM jobs WHERE id = $1`,
        [jobId],
      );
      expect(jobRows[0]?.work_date).toBeNull();
      const { rows: enrollmentRows } = await testDb.pool.query(
        `SELECT * FROM job_enrollments WHERE job_id = $1`,
        [jobId],
      );
      expect(enrollmentRows).toHaveLength(2);
    });

    it('rejects non-poster — FORBIDDEN', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'locked',
        workDate: new Date(Date.now() + 86_400_000),
      });
      await expect(
        caller(makeCtx({ userId: users.alumni2, role: 'Alumni' })).jobs.reschedule({ jobId }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── cancel ────────────────────────────────────────────────────────
  describe('cancel — PRD-004 CMD-08', () => {
    it('AC-13: poster cancels from enrollment_open; reason persisted', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.cancel({
        jobId,
        reason: 'no longer needed',
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('cancelled');
      const { rows } = await testDb.pool.query<{ cancellation_reason: string }>(
        `SELECT cancellation_reason FROM jobs WHERE id = $1`,
        [jobId],
      );
      expect(rows[0]?.cancellation_reason).toBe('no longer needed');
    });

    it('AC-14: poster cancels from locked', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'locked',
        workDate: new Date(Date.now() + 86_400_000),
      });
      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.cancel({
        jobId,
        reason: 'overlapping commitments',
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('cancelled');
    });

    it('AC-15: cancelled is terminal — subsequent transition fails', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'cancelled',
      });
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.complete({
          jobId,
          confirmedAttendees: [users.active1],
        }),
      ).rejects.toBeTruthy();
    });

    it('rejects non-poster — FORBIDDEN', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await expect(
        caller(makeCtx({ userId: users.alumni2, role: 'Alumni' })).jobs.cancel({
          jobId,
          reason: 'oops',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── edit — PRD-011 CMD-15 ─────────────────────────────────────────
  describe('edit — PRD-011 CMD-15', () => {
    it('AC-01: poster edits description in awaiting_moderation; state stays; content row written', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
        description: 'Clean garage',
      });
      const result = await caller(
        makeCtx({ userId: users.alumni, role: 'Alumni' }),
      ).jobs.edit({
        jobId,
        edits: { description: 'Clean garage and shed' },
      });
      expect(result.state).toBe('awaiting_moderation');
      expect(result.material).toBe(true);
      expect(result.diff).toEqual({
        description: { before: 'Clean garage', after: 'Clean garage and shed' },
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('awaiting_moderation');
      const { rows } = await testDb.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM job_content_changes WHERE job_id = $1`,
        [jobId],
      );
      expect(rows[0]?.count).toBe('1');
    });

    it('AC-02: rejects edit on locked job — BAD_REQUEST w/ JobNotEditableError cause', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'locked',
        workDate: new Date(Date.now() + 86_400_000),
      });
      try {
        await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.edit({
          jobId,
          edits: { description: 'cannot' },
        });
        throw new Error('expected throw');
      } catch (err) {
        // In-process: TRPCError carries the typed cause. The wire-shape
        // data.appCode is produced by errorFormatter when serialized over HTTP.
        const e = err as { code?: string; cause?: unknown };
        expect(e.code).toBe('BAD_REQUEST');
        expect(e.cause).toBeInstanceOf(JobNotEditableError);
        expect((e.cause as JobNotEditableError).code).toBe('JOB_NOT_EDITABLE_IN_STATE');
      }
    });

    it('AC-03: material edit in enrollment_open demotes job; enrollees stay; re-review email fires', async () => {
      await seedNotificationSettings();
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
        duesAmount: '50.00',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await insertEnrollment(testDb.pool, jobId, users.active2);

      mockSend.mockClear();
      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.edit({
        jobId,
        edits: { duesAmount: 75 },
      });

      expect(await getJobState(testDb.pool, jobId)).toBe('awaiting_moderation');

      // Enrollees preserved.
      const { rows: enrolled } = await testDb.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM job_enrollments WHERE job_id = $1`,
        [jobId],
      );
      expect(enrolled[0]?.count).toBe('2');

      // Moderator + 2x Active emails fired (3 total).
      expect(mockSend).toHaveBeenCalled();
      const calls = mockSend.mock.calls.map((c) => c[0] as { to: string; subject: string });
      const modCall = calls.find((c) => c.subject.startsWith('[Re-review]'));
      expect(modCall).toBeDefined();
      expect(modCall?.to).toBe('mods@chapter.invalid');

      const activeCalls = calls.filter(
        (c) =>
          c.to === 'active1@test.invalid' || c.to === 'active2@test.invalid',
      );
      expect(activeCalls).toHaveLength(2);
    });

    it('AC-04: notes-only edit in enrollment_open stays in state; NO re-review email; NO active email', async () => {
      await seedNotificationSettings();
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);

      mockSend.mockClear();
      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.edit({
        jobId,
        edits: { additionalNotes: 'Gate code: 1234' },
      });

      expect(await getJobState(testDb.pool, jobId)).toBe('enrollment_open');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('AC-07: rejects payload with non-whitelisted field (posterId) — Zod error', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
      });
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.edit({
          jobId,
          // The tRPC client type rejects this at compile time; cast to bypass for the runtime check.
          edits: { posterId: users.alumni2 } as unknown as Record<string, never>,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('rejects non-poster — FORBIDDEN', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
      });
      await expect(
        caller(makeCtx({ userId: users.alumni2, role: 'Alumni' })).jobs.edit({
          jobId,
          edits: { description: 'sneaky' },
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects unauthenticated caller — UNAUTHORIZED', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
      });
      await expect(
        caller(unauthedCtx()).jobs.edit({
          jobId,
          edits: { description: 'attempt' },
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('no-op edit (same values) → BAD_REQUEST with NoEditChangesError cause', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
        description: 'Original',
      });
      try {
        await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.edit({
          jobId,
          edits: { description: 'Original' },
        });
        throw new Error('expected throw');
      } catch (err) {
        const e = err as { code?: string; cause?: unknown };
        expect(e.code).toBe('BAD_REQUEST');
        expect(e.cause).toBeInstanceOf(NoEditChangesError);
      }
    });
  });

  // ─── complete + dues split ─────────────────────────────────────────
  describe('complete — PRD-005 CMD-09', () => {
    it('AC-04: even 4-attendee split — sum equals total exactly', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'locked',
        duesAmount: '100.00',
        workDate: new Date(Date.now() + 86_400_000),
      });
      for (const a of [users.active1, users.active2, users.active3]) {
        await insertEnrollment(testDb.pool, jobId, a);
      }
      // 4th enrollee
      await testDb.pool.query(
        `INSERT INTO users (email, display_name, role) VALUES ('active4@test.invalid', 'Dan Active', 'Active') RETURNING id`,
      );
      const { rows: dRows } = await testDb.pool.query<{ id: string }>(
        `SELECT id FROM users WHERE email='active4@test.invalid'`,
      );
      const active4 = dRows[0]!.id;
      await insertEnrollment(testDb.pool, jobId, active4);

      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.complete({
        jobId,
        confirmedAttendees: [users.active1, users.active2, users.active3, active4],
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('completed');
      const { rows } = await testDb.pool.query<{ per_active_dues_credit: Record<string, string> }>(
        `SELECT per_active_dues_credit FROM jobs WHERE id = $1`,
        [jobId],
      );
      const credit = rows[0]!.per_active_dues_credit;
      const sum = Object.values(credit).reduce((a, b) => a + parseFloat(b), 0);
      expect(sum).toBeCloseTo(100, 2);
      // Even split: every attendee gets exactly 25.00
      for (const v of Object.values(credit)) expect(v).toBe('25.00');
    });

    it('AC-05: uneven 3-way split — surplus on alphabetically-first attendees, sum = total', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'locked',
        duesAmount: '100.00',
        workDate: new Date(Date.now() + 86_400_000),
      });
      for (const a of [users.active1, users.active2, users.active3]) {
        await insertEnrollment(testDb.pool, jobId, a);
      }

      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.complete({
        jobId,
        confirmedAttendees: [users.active1, users.active2, users.active3],
      });
      const { rows } = await testDb.pool.query<{ per_active_dues_credit: Record<string, string> }>(
        `SELECT per_active_dues_credit FROM jobs WHERE id = $1`,
        [jobId],
      );
      const credit = rows[0]!.per_active_dues_credit;
      // Alice (alphabetically first) gets the extra cent.
      // 10000 cents / 3 = 3333 cents/attendee, surplus = 1
      expect(credit[users.active1]).toBe('33.34');
      expect(credit[users.active2]).toBe('33.33');
      expect(credit[users.active3]).toBe('33.33');
      const sum = Object.values(credit).reduce((a, b) => a + parseFloat(b), 0);
      expect(sum).toBeCloseTo(100, 2);
    });

    it('AC-02: confirmedAttendees must be enrolled', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'locked',
        workDate: new Date(Date.now() + 86_400_000),
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.complete({
          jobId,
          confirmedAttendees: [users.active1, users.active2],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('AC-10: non-poster Alumni → FORBIDDEN', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'locked',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await expect(
        caller(makeCtx({ userId: users.alumni2, role: 'Alumni' })).jobs.complete({
          jobId,
          confirmedAttendees: [users.active1],
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── revertCompletion ─────────────────────────────────────────────
  describe('revertCompletion — PRD-005 CMD-10', () => {
    it('AC-06: revert from completed clears attendance + credit, state→locked', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'completed',
        perActiveDuesCredit: { [users.active1]: '50.00' },
      });
      await testDb.pool.query(
        `INSERT INTO job_enrollments (job_id, active_id, confirmed_attendee_at) VALUES ($1, $2, now())`,
        [jobId, users.active1],
      );

      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.revertCompletion({
        jobId,
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('locked');
      const { rows } = await testDb.pool.query<{
        confirmed_attendee_at: Date | null;
        per_active_dues_credit: unknown;
      }>(
        `SELECT je.confirmed_attendee_at, j.per_active_dues_credit
         FROM job_enrollments je JOIN jobs j ON je.job_id = j.id
         WHERE je.job_id = $1`,
        [jobId],
      );
      expect(rows[0]?.confirmed_attendee_at).toBeNull();
      expect(rows[0]?.per_active_dues_credit).toBeNull();
    });

    it('AC-09: no revert from payment_sent — call fails with CONFLICT (state guard)', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'payment_sent',
      });
      // The procedure pins expectedFromState='completed'; the live state is
      // payment_sent so the state-guard fails and we surface CONCURRENT_TRANSITION
      // mapped to CONFLICT — caller cannot revert.
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.revertCompletion({ jobId }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(await getJobState(testDb.pool, jobId)).toBe('payment_sent');
    });
  });

  // ─── markPaymentSent ───────────────────────────────────────────────
  describe('markPaymentSent — PRD-005 CMD-11', () => {
    it('AC-07: poster marks payment_sent', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'completed',
      });
      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.markPaymentSent({
        jobId,
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('payment_sent');
    });

    it('AC-09: non-poster → FORBIDDEN', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'completed',
      });
      await expect(
        caller(makeCtx({ userId: users.alumni2, role: 'Alumni' })).jobs.markPaymentSent({
          jobId,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── confirmReceipt + race ─────────────────────────────────────────
  describe('confirmReceipt — PRD-006 CMD-12', () => {
    it('AC-01: enrolled Active confirms; state=closed', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'payment_sent',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      const result = await caller(makeCtx({ userId: users.active1, role: 'Active' }))
        .jobs.confirmReceipt({ jobId });
      expect(result).toEqual({
        state: 'closed',
        closedBy: users.active1,
        alreadyClosed: false,
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('closed');
    });

    it('AC-02: Admin can confirm without enrollment', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'payment_sent',
      });
      // No enrollment for Admin
      const result = await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .jobs.confirmReceipt({ jobId });
      expect(result.state).toBe('closed');
    });

    it('AC-03: non-enrolled Active → FORBIDDEN', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'payment_sent',
      });
      await expect(
        caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.confirmReceipt({
          jobId,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('AC-04: race — exactly one wins; loser returns alreadyClosed=true; only one transition row', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'payment_sent',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await insertEnrollment(testDb.pool, jobId, users.active2);

      const c1 = caller(makeCtx({ userId: users.active1, role: 'Active' }));
      const c2 = caller(makeCtx({ userId: users.active2, role: 'Active' }));
      const [r1, r2] = await Promise.all([
        c1.jobs.confirmReceipt({ jobId }),
        c2.jobs.confirmReceipt({ jobId }),
      ]);
      const results = [r1, r2];
      const winners = results.filter((r) => r.alreadyClosed === false);
      const losers = results.filter((r) => r.alreadyClosed === true);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(losers[0]!.closedBy).toBe(winners[0]!.closedBy);

      // Only one transition row to 'closed'
      const { rows } = await testDb.pool.query(
        `SELECT * FROM job_state_transitions WHERE job_id = $1 AND to_state = 'closed'`,
        [jobId],
      );
      expect(rows).toHaveLength(1);
    });

    it('AC-12: closed terminal — subsequent transition fails', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'closed',
      });
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.markPaymentSent({
          jobId,
        }),
      ).rejects.toBeTruthy();
    });
  });

  // ─── dispute ───────────────────────────────────────────────────────
  describe('dispute — PRD-006 CMD-13', () => {
    it('AC-05: enrolled Active disputes; reason persisted; state=disputed', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'payment_sent',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.dispute({
        jobId,
        reason: 'never received',
      });
      expect(await getJobState(testDb.pool, jobId)).toBe('disputed');
      const { rows } = await testDb.pool.query<{ dispute_reason: string }>(
        `SELECT dispute_reason FROM jobs WHERE id = $1`,
        [jobId],
      );
      expect(rows[0]?.dispute_reason).toBe('never received');
    });

    it('AC-06: non-enrolled non-Admin → FORBIDDEN', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'payment_sent',
      });
      await expect(
        caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.dispute({
          jobId,
          reason: 'huh',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('AC-07: empty reason → BAD_REQUEST', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'payment_sent',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await expect(
        caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.dispute({
          jobId,
          reason: '   ',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // ─── resolveDispute* ───────────────────────────────────────────────
  describe('resolveDispute* — PRD-006 CMD-14a/b/c', () => {
    it('AC-08: resolve_closed', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'disputed',
        disputeReason: 'never received',
      });
      await caller(makeCtx({ userId: users.admin, role: 'Admin' })).jobs.resolveDisputeAsClosed(
        { jobId, note: 'resolved off-platform' },
      );
      expect(await getJobState(testDb.pool, jobId)).toBe('closed');
    });

    it('AC-10: resolve_cancelled', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'disputed',
        disputeReason: 'no attendance',
      });
      await caller(makeCtx({ userId: users.admin, role: 'Admin' })).jobs.resolveDisputeAsCancelled(
        { jobId, note: 'cancelled by admin' },
      );
      expect(await getJobState(testDb.pool, jobId)).toBe('cancelled');
    });

    it('AC-11: resolve_payment_sent', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'disputed',
        disputeReason: 'pending receipt',
      });
      await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .jobs.resolveDisputeAsPaymentSent({ jobId, note: 're-trying' });
      expect(await getJobState(testDb.pool, jobId)).toBe('payment_sent');
    });

    it('rejects non-Admin', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'disputed',
      });
      await expect(
        caller(makeCtx({ userId: users.moderator, role: 'Moderator' }))
          .jobs.resolveDisputeAsClosed({ jobId, note: 'x' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── Queries ───────────────────────────────────────────────────────

  describe('listByState — BCC-02 Q-01', () => {
    it('Admin sees jobs in any state', async () => {
      await insertJob(testDb.pool, { posterId: users.alumni, state: 'awaiting_moderation' });
      const list = await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .jobs.listByState({ state: 'awaiting_moderation' });
      expect(list).toHaveLength(1);
    });

    it('Active restricted to enrollment_open', async () => {
      await expect(
        caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.listByState({
          state: 'awaiting_moderation',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('Alumni sees own awaiting_moderation only', async () => {
      const myJob = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
      });
      await insertJob(testDb.pool, {
        posterId: users.alumni2,
        state: 'awaiting_moderation',
      });
      const list = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' }))
        .jobs.listByState({ state: 'awaiting_moderation' });
      expect(list.map((j) => j.id)).toEqual([myJob]);
    });
  });

  describe('getById — BCC-02 Q-02 / PRD-004 R-05 role-aware roster', () => {
    it('AC-06: enrolled Active sees roster', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await insertEnrollment(testDb.pool, jobId, users.active2);

      const result = await caller(makeCtx({ userId: users.active1, role: 'Active' }))
        .jobs.getById({ jobId });
      expect(result.roster).toHaveLength(2);
      expect(result.enrolleeCount).toBe(2);
    });

    it('AC-07: non-enrolled Active sees only count', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await insertEnrollment(testDb.pool, jobId, users.active2);

      const result = await caller(makeCtx({ userId: users.active1, role: 'Active' }))
        .jobs.getById({ jobId });
      expect(result.roster).toBeNull();
      expect(result.enrolleeCount).toBe(1);
    });

    it('Alumni poster sees roster', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      const result = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' }))
        .jobs.getById({ jobId });
      expect(result.roster).toHaveLength(1);
    });

    // PLAN-010 projection extensions ────────────────────────────────────
    it('projects closedBy.displayName when state=closed (PLAN-010)', async () => {
      const c = caller(makeCtx({ userId: users.alumni, role: 'Alumni' }));
      const { jobId } = await c.jobs.post({
        description: 'closeable',
        duesAmount: 20,
        recommendedPeopleCount: 1,
        posterContactKind: 'email',
        posterContactValue: 'test-contact@example.com',
        location: 'Test location',
        estimatedDurationHours: 1.5,
      });
      await caller(makeCtx({ userId: users.moderator, role: 'Moderator' })).jobs.approve({
        jobId,
      });
      await caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.enroll({ jobId });
      // Drive the lock → complete → markPaymentSent → confirmReceipt path.
      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.lock({
        jobId,
        workDate: FUTURE_DATE(),
      });
      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.complete({
        jobId,
        confirmedAttendees: [users.active1],
      });
      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.markPaymentSent({
        jobId,
      });
      await caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.confirmReceipt({
        jobId,
      });

      const result = await caller(makeCtx({ userId: users.active1, role: 'Active' }))
        .jobs.getById({ jobId });
      expect(result.state).toBe('closed');
      expect(result.closedBy?.displayName).toBeTruthy();
    });

    it('projects viewerCredit for an enrolled Active when completed', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'completed',
        perActiveDuesCredit: { [users.active1]: '12.34' },
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await testDb.pool.query(
        `UPDATE job_enrollments SET confirmed_attendee_at = now() WHERE job_id = $1 AND active_id = $2`,
        [jobId, users.active1],
      );

      const result = await caller(makeCtx({ userId: users.active1, role: 'Active' }))
        .jobs.getById({ jobId });
      expect(result.viewerCredit).toEqual({ confirmed: true, amount: '12.34' });
    });

    it('viewerCredit.confirmed=false for an enrolled-but-not-confirmed Active (Q-PLN-01)', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'completed',
        perActiveDuesCredit: { [users.active2]: '25.00' },
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await insertEnrollment(testDb.pool, jobId, users.active2);
      await testDb.pool.query(
        `UPDATE job_enrollments SET confirmed_attendee_at = now() WHERE job_id = $1 AND active_id = $2`,
        [jobId, users.active2],
      );

      const result = await caller(makeCtx({ userId: users.active1, role: 'Active' }))
        .jobs.getById({ jobId });
      expect(result.viewerCredit).toEqual({ confirmed: false, amount: null });
    });

    it('viewerCredit is null for non-Active viewers', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'completed',
      });
      const result = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' }))
        .jobs.getById({ jobId });
      expect(result.viewerCredit).toBeNull();
    });
  });

  describe('getHistory — PRD-007 R-06', () => {
    it('AC-07: Admin gets full audit history', async () => {
      const c = caller(makeCtx({ userId: users.alumni, role: 'Alumni' }));
      const { jobId } = await c.jobs.post({
        description: 'x',
        duesAmount: 10,
        recommendedPeopleCount: 1,
        posterContactKind: 'email',
        posterContactValue: 'test-contact@example.com',
        location: 'Test location',
        estimatedDurationHours: 1.5,
      });
      await caller(makeCtx({ userId: users.moderator, role: 'Moderator' })).jobs.approve({
        jobId,
      });
      const history = await caller(makeCtx({ userId: users.admin, role: 'Admin' }))
        .jobs.getHistory({ jobId });
      expect(history).toHaveLength(3); // create + approve(2 rows)
    });

    it('rejects non-Admin', async () => {
      const jobId = await insertJob(testDb.pool, { posterId: users.alumni });
      await expect(
        caller(makeCtx({ userId: users.moderator, role: 'Moderator' }))
          .jobs.getHistory({ jobId }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('listMyPosted — PRD-002 R-11', () => {
    it('AC-14: Alumni gets only their own posts', async () => {
      const myJob = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
      });
      await insertJob(testDb.pool, {
        posterId: users.alumni2,
        state: 'awaiting_moderation',
      });
      const list = await caller(makeCtx({ userId: users.alumni, role: 'Alumni' }))
        .jobs.listMyPosted();
      expect(list.map((j) => j.id)).toEqual([myJob]);
    });

    it('rejects Active', async () => {
      await expect(
        caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.listMyPosted(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('listMyEnrolled — PRD-004 R-06', () => {
    it('returns enrolled jobs', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      const list = await caller(makeCtx({ userId: users.active1, role: 'Active' }))
        .jobs.listMyEnrolled();
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe(jobId);
    });

    it('rejects Alumni', async () => {
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.listMyEnrolled(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('listModerationQueue — PRD-002 R-06', () => {
    it('AC-06: Moderator sees queue oldest-first', async () => {
      const j1 = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
        description: 'first',
      });
      await new Promise((r) => setTimeout(r, 10));
      const j2 = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
        description: 'second',
      });
      const queue = await caller(makeCtx({ userId: users.moderator, role: 'Moderator' }))
        .jobs.listModerationQueue();
      expect(queue.map((j) => j.id)).toEqual([j1, j2]);
    });

    it('AC-07: non-Moderator → FORBIDDEN', async () => {
      await expect(
        caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.listModerationQueue(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── PLAN-007: afterCommit fires the right Resend helper ─────────────
  describe('afterCommit notification helpers (PLAN-007)', () => {
    it('post → afterCommit fires sendModeratorQueueEmail once', async () => {
      await seedNotificationSettings();
      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.post({
        description: 'Plant some shrubs',
        duesAmount: 25,
        recommendedPeopleCount: 2,
        posterContactKind: 'email',
        posterContactValue: 'test-contact@example.com',
        location: 'Test location',
        estimatedDurationHours: 1.5,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const payload = mockSend.mock.calls[0]![0];
      expect(payload.to).toBe('mods@chapter.invalid');
      expect(payload.subject).toContain('Test Chapter');
      expect(payload.subject).toContain('moderation');
      expect(payload.headers?.['Idempotency-Key']).toMatch(/^job:.+:moderation_queue$/);
    });

    it('markPaymentSent → afterCommit fires sendTreasurerEmail once', async () => {
      await seedNotificationSettings();
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'completed',
        duesAmount: '100.00',
        perActiveDuesCredit: {
          [users.active1]: '50.00',
          [users.active2]: '50.00',
        },
      });

      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.markPaymentSent({
        jobId,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const payload = mockSend.mock.calls[0]![0];
      expect(payload.to).toBe('treasurer@chapter.invalid');
      expect(payload.subject).toContain('Test Chapter');
      expect(payload.subject).toContain('payment-sent');
      expect(payload.headers?.['Idempotency-Key']).toBe(`job:${jobId}:payment_sent`);
    });

    it('dispute → afterCommit fires sendAdminDisputeEmail once', async () => {
      await seedNotificationSettings();
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'payment_sent',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);

      await caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.dispute({
        jobId,
        reason: 'never received',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const payload = mockSend.mock.calls[0]![0];
      expect(payload.to).toBe('admins@chapter.invalid');
      expect(payload.subject).toContain('Test Chapter');
      expect(payload.subject).toContain('DISPUTE');
      // No idempotency key for dispute — re-disputes are legitimately separate.
      expect(payload.headers).toBeUndefined();
    });

    it('afterCommit failure does not roll back the FSM transition', async () => {
      await seedNotificationSettings();
      mockSend.mockRejectedValue(new Error('Resend down for maintenance'));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'completed',
        duesAmount: '50.00',
        perActiveDuesCredit: { [users.active1]: '50.00' },
      });

      // The mutation should succeed despite Resend rejecting; afterCommit
      // failures are swallowed by the domain layer.
      await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.markPaymentSent({
        jobId,
      });

      expect(await getJobState(testDb.pool, jobId)).toBe('payment_sent');
      const audit = await getAuditRows(testDb.pool, jobId);
      expect(audit.map((r) => r.toState)).toContain('payment_sent');
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringMatching(/afterCommit hook failed/i),
        expect.anything(),
      );
      errSpy.mockRestore();
    });
  });
});
