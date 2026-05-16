import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  caller,
  getAuditRows,
  getJobState,
  makeCtx,
  resetAndSeedUsers,
  startTestDb,
  type SeedUsers,
  type TestDb,
} from '../integration/_setup';
import { verifyInviteToken } from '@app/auth';

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

/**
 * API-level walking skeleton — mirror of PLAN-008's Playwright spec at the
 * procedure layer. Calls procedures programmatically and asserts the final
 * job state + the audit-log shape.
 */
describe('walking skeleton — full happy path through tRPC procedures', () => {
  it('invites.generate → jobs.post → approve → enroll → lock → complete → markPaymentSent → confirmReceipt = closed; 7 audit rows', async () => {
    const admin = caller(makeCtx({ userId: users.admin, role: 'Admin' }));
    const alumni = caller(makeCtx({ userId: users.alumni, role: 'Alumni' }));
    const mod = caller(makeCtx({ userId: users.moderator, role: 'Moderator' }));
    const active = caller(makeCtx({ userId: users.active1, role: 'Active' }));

    // 1. Admin generates an Active invite token; the verify helper accepts it.
    const invite = await admin.invites.generate({ preselectedRole: 'Active' });
    await expect(verifyInviteToken(invite.token)).resolves.toEqual({
      preselectedRole: 'Active',
    });

    // (signup is owned by DESIGN-004; here we use the seed roster as the
    // already-signed-up Active for the procedure-level walking skeleton.)

    // 2. Alumni posts a job.
    const { jobId } = await alumni.jobs.post({
      description: 'Walking skeleton job',
      duesAmount: 60,
      recommendedPeopleCount: 1,
    });
    expect(await getJobState(testDb.pool, jobId)).toBe('awaiting_moderation');

    // 3. Moderator approves.
    await mod.jobs.approve({ jobId });
    expect(await getJobState(testDb.pool, jobId)).toBe('enrollment_open');

    // 4. Active enrolls.
    await active.jobs.enroll({ jobId });

    // 5. Alumni locks with a future work date.
    const workDate = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await alumni.jobs.lock({ jobId, workDate });
    expect(await getJobState(testDb.pool, jobId)).toBe('locked');

    // 6. Alumni completes with the Active as the only attendee.
    await alumni.jobs.complete({ jobId, confirmedAttendees: [users.active1] });
    expect(await getJobState(testDb.pool, jobId)).toBe('completed');

    // 7. Alumni marks payment sent.
    await alumni.jobs.markPaymentSent({ jobId });
    expect(await getJobState(testDb.pool, jobId)).toBe('payment_sent');

    // 8. Active confirms receipt → closed.
    const closeResult = await active.jobs.confirmReceipt({ jobId });
    expect(closeResult).toMatchObject({ state: 'closed', alreadyClosed: false });
    expect(await getJobState(testDb.pool, jobId)).toBe('closed');

    // Audit rows in order — create + approve(2) + enroll + lock + complete + payment_sent + confirm_receipt = 8 rows.
    const audit = await getAuditRows(testDb.pool, jobId);
    const transitions = audit.map((r) => `${r.fromState ?? 'null'}->${r.toState}`);
    expect(transitions).toEqual([
      'null->awaiting_moderation',
      'awaiting_moderation->approved',
      'approved->enrollment_open',
      'enrollment_open->enrollment_open', // enroll relationship event
      'enrollment_open->locked',
      'locked->completed',
      'completed->payment_sent',
      'payment_sent->closed',
    ]);
  });

  it('runs cleanly 5 times in a row (no flake)', async () => {
    for (let i = 0; i < 5; i++) {
      users = await resetAndSeedUsers(testDb.pool);
      const alumni = caller(makeCtx({ userId: users.alumni, role: 'Alumni' }));
      const mod = caller(makeCtx({ userId: users.moderator, role: 'Moderator' }));
      const active = caller(makeCtx({ userId: users.active1, role: 'Active' }));

      const { jobId } = await alumni.jobs.post({
        description: `iteration ${i}`,
        duesAmount: 25,
        recommendedPeopleCount: 1,
      });
      await mod.jobs.approve({ jobId });
      await active.jobs.enroll({ jobId });
      await alumni.jobs.lock({
        jobId,
        workDate: new Date(Date.now() + 86_400_000).toISOString(),
      });
      await alumni.jobs.complete({ jobId, confirmedAttendees: [users.active1] });
      await alumni.jobs.markPaymentSent({ jobId });
      const result = await active.jobs.confirmReceipt({ jobId });
      expect(result.state).toBe('closed');
    }
  });
});
