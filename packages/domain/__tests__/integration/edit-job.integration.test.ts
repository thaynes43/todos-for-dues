import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { editJob } from '../../src/job-state-machine';
import { JobNotEditableError, NoEditChangesError } from '../../src/errors';
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

async function getContentChanges(jobId: string) {
  const { rows } = await testDb.pool.query<{
    job_id: string;
    actor_id: string;
    diff: unknown;
    state_at_edit: string;
  }>(
    `SELECT job_id, actor_id, diff, state_at_edit
     FROM job_content_changes WHERE job_id = $1 ORDER BY created_at`,
    [jobId],
  );
  return rows;
}

describe('editJob — content edits with optional re-moderation (PRD-011)', () => {
  describe('AC-01: cosmetic-equivalent edit in awaiting_moderation', () => {
    it('updates description; state stays awaiting_moderation; writes ONE content-change row; NO new state-transition row', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
        description: 'Clean garage',
      });

      const result = await editJob({
        jobId,
        actorId: users.alumni,
        edits: { description: 'Clean garage and shed' },
      });

      expect(result.state).toBe('awaiting_moderation');
      expect(result.material).toBe(true);
      expect(result.diff).toEqual({
        description: { before: 'Clean garage', after: 'Clean garage and shed' },
      });

      expect(await getJobState(testDb.pool, jobId)).toBe('awaiting_moderation');

      const contentChanges = await getContentChanges(jobId);
      expect(contentChanges).toHaveLength(1);
      expect(contentChanges[0]).toMatchObject({
        actor_id: users.alumni,
        state_at_edit: 'awaiting_moderation',
      });
      expect(contentChanges[0]!.diff).toEqual({
        description: { before: 'Clean garage', after: 'Clean garage and shed' },
      });

      // No state-transition row was written (we did NOT go through transitionJob).
      const audit = await getAuditRows(testDb.pool, jobId);
      expect(audit).toHaveLength(0);
    });
  });

  describe('AC-03: material edit in enrollment_open demotes to awaiting_moderation', () => {
    it('material edit in enrollment_open with 2 enrollees → state demotes; enrollees stay; content-change + state-transition rows both written', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
        duesAmount: '50.00',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);
      await insertEnrollment(testDb.pool, jobId, users.active2);

      const result = await editJob({
        jobId,
        actorId: users.alumni,
        edits: { duesAmount: 75 },
      });

      expect(result.state).toBe('awaiting_moderation');
      expect(result.material).toBe(true);
      expect(result.stateBeforeEdit).toBe('enrollment_open');
      expect(result.diff).toEqual({
        duesAmount: { before: 50, after: 75 },
      });

      expect(await getJobState(testDb.pool, jobId)).toBe('awaiting_moderation');

      // Enrollees are still on the job (PRD-011 AC-03).
      const { rows: enrolledRows } = await testDb.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM job_enrollments WHERE job_id = $1`,
        [jobId],
      );
      expect(enrolledRows[0]?.count).toBe('2');

      // Audit log: one state-transition row (enrollment_open → awaiting_moderation)
      // AND one content-change row, both written in the same transaction.
      const audit = await getAuditRows(testDb.pool, jobId);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        fromState: 'enrollment_open',
        toState: 'awaiting_moderation',
        actorId: users.alumni,
        actorKind: 'user',
      });

      const contentChanges = await getContentChanges(jobId);
      expect(contentChanges).toHaveLength(1);
      expect(contentChanges[0]).toMatchObject({
        actor_id: users.alumni,
        // state_at_edit captures the state BEFORE the demote (PRD-011 R-07).
        state_at_edit: 'enrollment_open',
      });
      expect(contentChanges[0]!.diff).toEqual({
        duesAmount: { before: 50, after: 75 },
      });
    });
  });

  describe('AC-04: notes-only / contact-only edit in enrollment_open stays in state', () => {
    it('cosmetic edit (additionalNotes) → state unchanged; only content-change row; no state-transition row', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });

      const result = await editJob({
        jobId,
        actorId: users.alumni,
        edits: { additionalNotes: 'Gate code: 1234' },
      });

      expect(result.state).toBe('enrollment_open');
      expect(result.material).toBe(false);

      expect(await getJobState(testDb.pool, jobId)).toBe('enrollment_open');

      const contentChanges = await getContentChanges(jobId);
      expect(contentChanges).toHaveLength(1);
      expect(contentChanges[0]).toMatchObject({
        actor_id: users.alumni,
        state_at_edit: 'enrollment_open',
      });
      expect(contentChanges[0]!.diff).toEqual({
        additionalNotes: { before: null, after: 'Gate code: 1234' },
      });

      const audit = await getAuditRows(testDb.pool, jobId);
      expect(audit).toHaveLength(0);
    });

    it('cosmetic edit (poster contact) → state unchanged; correct diff', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });

      const result = await editJob({
        jobId,
        actorId: users.alumni,
        edits: {
          posterContactKind: 'phone',
          posterContactValue: '+1 555 1234',
        },
      });

      expect(result.material).toBe(false);
      expect(await getJobState(testDb.pool, jobId)).toBe('enrollment_open');

      const contentChanges = await getContentChanges(jobId);
      expect(contentChanges).toHaveLength(1);
      expect(contentChanges[0]!.diff).toEqual({
        posterContactKind: { before: 'email', after: 'phone' },
        posterContactValue: { before: 'unknown', after: '+1 555 1234' },
      });
    });
  });

  describe('R-04: rejects edits in non-editable states', () => {
    it('throws JobNotEditableError when the job is in locked', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'locked',
      });
      await expect(
        editJob({
          jobId,
          actorId: users.alumni,
          edits: { description: 'changed' },
        }),
      ).rejects.toBeInstanceOf(JobNotEditableError);
    });

    it('throws JobNotEditableError when the job is in cancelled', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'cancelled',
      });
      await expect(
        editJob({
          jobId,
          actorId: users.alumni,
          edits: { description: 'changed' },
        }),
      ).rejects.toBeInstanceOf(JobNotEditableError);
    });

    it('throws JobNotEditableError when the job does not exist', async () => {
      await expect(
        editJob({
          jobId: '00000000-0000-0000-0000-000000000000',
          actorId: users.alumni,
          edits: { description: 'changed' },
        }),
      ).rejects.toBeInstanceOf(JobNotEditableError);
    });
  });

  describe('material edit in awaiting_moderation stays in state', () => {
    it('description edit in awaiting_moderation → state unchanged; material flag true; no state-transition row', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
        description: 'Original',
      });

      const result = await editJob({
        jobId,
        actorId: users.alumni,
        edits: { description: 'Updated' },
      });

      expect(result.material).toBe(true);
      expect(result.state).toBe('awaiting_moderation');
      const audit = await getAuditRows(testDb.pool, jobId);
      expect(audit).toHaveLength(0);
      const contentChanges = await getContentChanges(jobId);
      expect(contentChanges).toHaveLength(1);
    });
  });

  describe('diff shape — changed-only (PLAN-017 Q-PLN-04)', () => {
    it('does not include unchanged fields in the diff', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
        description: 'Original',
        duesAmount: '50.00',
      });

      const result = await editJob({
        jobId,
        actorId: users.alumni,
        // Submit edits matching the current values for some fields, change one.
        edits: {
          description: 'Original', // unchanged
          duesAmount: 75, // changed
        },
      });

      expect(Object.keys(result.diff)).toEqual(['duesAmount']);
    });

    it('throws NoEditChangesError when no fields actually changed', async () => {
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'awaiting_moderation',
        description: 'Original',
      });

      await expect(
        editJob({
          jobId,
          actorId: users.alumni,
          edits: { description: 'Original' },
        }),
      ).rejects.toBeInstanceOf(NoEditChangesError);
    });
  });

  describe('atomicity — content + audit + (optional) state in one transaction', () => {
    it('material edit writes both rows or neither (no orphan content-change row on a failed transition)', async () => {
      // Seed two jobs; we'll race a material edit against an unrelated concurrent
      // lock so that one of the operations loses the optimistic-state check.
      const jobId = await insertJob(testDb.pool, {
        posterId: users.alumni,
        state: 'enrollment_open',
      });
      await insertEnrollment(testDb.pool, jobId, users.active1);

      // Simulate a concurrent change: directly move the state to 'locked'.
      // (Using SQL because this is a contrived race; in prod, lock would go via FSM.)
      await testDb.pool.query(`UPDATE jobs SET state = 'locked' WHERE id = $1`, [jobId]);

      // The pre-flight read happens first; if the actual transitionJob optimistic
      // check fails because state moved between read and tx, we get
      // ConcurrentTransitionError. Either way no partial state should remain.
      await expect(
        editJob({
          jobId,
          actorId: users.alumni,
          edits: { duesAmount: 99 },
        }),
      ).rejects.toThrow();

      // No content-change row should exist (transaction rolled back).
      const contentChanges = await getContentChanges(jobId);
      expect(contentChanges).toHaveLength(0);
    });
  });
});
