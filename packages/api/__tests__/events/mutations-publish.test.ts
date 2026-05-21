import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setResendForTests } from '@app/notifications';
import {
  caller,
  insertEnrollment,
  insertJob,
  makeCtx,
  resetAndSeedUsers,
  startTestDb,
  type SeedUsers,
  type TestDb,
} from '../integration/_setup';
import {
  chapterBus,
  DEFAULT_CHAPTER_ID,
  type ChapterEvent,
  type ChapterEventKind,
} from '../../src/events';

const mockSend = vi.fn();
let testDb: TestDb;
let users: SeedUsers;

beforeAll(async () => {
  testDb = await startTestDb();
  process.env.RESEND_API_KEY = 'test-key';
  __setResendForTests({ emails: { send: mockSend as never } });
}, 180_000);

afterAll(async () => {
  __setResendForTests(undefined);
  await testDb?.stop();
  delete process.env.RESEND_API_KEY;
});

beforeEach(async () => {
  users = await resetAndSeedUsers(testDb.pool);
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: 'mocked-id' }, error: null });
  await testDb.pool.query(
    `INSERT INTO chapter_settings (key, value) VALUES
      ('admin_recipient_email', to_jsonb('admins@chapter.invalid'::text)),
      ('treasurer_recipient_email', to_jsonb('treasurer@chapter.invalid'::text)),
      ('moderators_recipient_email', to_jsonb('mods@chapter.invalid'::text)),
      ('chapter_display_name', to_jsonb('Test Chapter'::text))
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  );
  chapterBus.reset();
});

function listenAll(): ChapterEvent[] {
  const seen: ChapterEvent[] = [];
  chapterBus.subscribe(DEFAULT_CHAPTER_ID, (e) => seen.push(e));
  return seen;
}

function kindsOnly(events: ChapterEvent[]): ChapterEventKind[] {
  return events.map((e) => e.event_kind);
}

const FUTURE_DATE = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

describe('mutation procedures publish chapter SSE events (PRD-012 / PLAN-018 Track C)', () => {
  it('post → job.posted', async () => {
    const seen = listenAll();
    const { jobId } = await caller(
      makeCtx({ userId: users.alumni, role: 'Alumni' }),
    ).jobs.post({
      description: 'Mow the lawn',
      duesAmount: 50,
      recommendedPeopleCount: 3,
      posterContactKind: 'email',
      posterContactValue: 'alumni@chapter.invalid',
      location: 'Front yard',
      estimatedDurationHours: 1.5,
    });
    expect(kindsOnly(seen)).toEqual(['job.posted']);
    expect(seen[0]).toMatchObject({
      job_id: jobId,
      chapter_id: DEFAULT_CHAPTER_ID,
      actor_id: users.alumni,
    });
  });

  it('approve → job.approved', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'awaiting_moderation',
    });
    const seen = listenAll();
    await caller(makeCtx({ userId: users.moderator, role: 'Moderator' })).jobs.approve({
      jobId,
    });
    expect(kindsOnly(seen)).toEqual(['job.approved']);
    expect(seen[0]?.actor_id).toBe(users.moderator);
  });

  it('reject → job.rejected', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'awaiting_moderation',
    });
    const seen = listenAll();
    await caller(makeCtx({ userId: users.moderator, role: 'Moderator' })).jobs.reject({
      jobId,
      reason: 'Not a chapter task',
    });
    expect(kindsOnly(seen)).toEqual(['job.rejected']);
  });

  it('enroll → job.enrolled (idempotent: no event on second enroll)', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'enrollment_open',
    });
    const seen = listenAll();
    await caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.enroll({ jobId });
    await caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.enroll({ jobId });
    expect(kindsOnly(seen)).toEqual(['job.enrolled']);
  });

  it('unenroll → job.unenrolled', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'enrollment_open',
    });
    await insertEnrollment(testDb.pool, jobId, users.active1);
    const seen = listenAll();
    await caller(makeCtx({ userId: users.active1, role: 'Active' })).jobs.unenroll({ jobId });
    expect(kindsOnly(seen)).toEqual(['job.unenrolled']);
  });

  it('lock → job.locked', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'enrollment_open',
    });
    await insertEnrollment(testDb.pool, jobId, users.active1);
    const seen = listenAll();
    await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.lock({
      jobId,
      workDate: FUTURE_DATE(),
    });
    expect(kindsOnly(seen)).toEqual(['job.locked']);
  });

  it('reschedule → job.rescheduled', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'locked',
      workDate: new Date(Date.now() + 7 * 86_400_000),
    });
    const seen = listenAll();
    await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.reschedule({
      jobId,
    });
    expect(kindsOnly(seen)).toEqual(['job.rescheduled']);
  });

  it('cancel → job.cancelled', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'enrollment_open',
    });
    const seen = listenAll();
    await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.cancel({
      jobId,
      reason: 'no longer needed',
    });
    expect(kindsOnly(seen)).toEqual(['job.cancelled']);
  });

  it('edit → job.edited', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'awaiting_moderation',
    });
    const seen = listenAll();
    await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.edit({
      jobId,
      edits: { description: 'Updated description' },
    });
    expect(kindsOnly(seen)).toEqual(['job.edited']);
  });

  it('complete → job.completed', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'locked',
      workDate: new Date(Date.now() + 7 * 86_400_000),
    });
    await insertEnrollment(testDb.pool, jobId, users.active1);
    const seen = listenAll();
    await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.complete({
      jobId,
      confirmedAttendees: [users.active1],
    });
    expect(kindsOnly(seen)).toEqual(['job.completed']);
  });

  it('revertCompletion → job.revert_completion', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'completed',
    });
    const seen = listenAll();
    await caller(
      makeCtx({ userId: users.alumni, role: 'Alumni' }),
    ).jobs.revertCompletion({ jobId });
    expect(kindsOnly(seen)).toEqual(['job.revert_completion']);
  });

  it('markPaymentSent → job.payment_sent', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'completed',
    });
    const seen = listenAll();
    await caller(
      makeCtx({ userId: users.alumni, role: 'Alumni' }),
    ).jobs.markPaymentSent({ jobId });
    expect(kindsOnly(seen)).toEqual(['job.payment_sent']);
  });

  it('confirmReceipt → job.confirmed_received (winner publishes, loser does not)', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'payment_sent',
    });
    await insertEnrollment(testDb.pool, jobId, users.active1);
    await insertEnrollment(testDb.pool, jobId, users.active2);
    const seen = listenAll();
    await caller(
      makeCtx({ userId: users.active1, role: 'Active' }),
    ).jobs.confirmReceipt({ jobId });
    // Second call is the loser path (already closed) — must NOT publish again.
    const second = await caller(
      makeCtx({ userId: users.active2, role: 'Active' }),
    ).jobs.confirmReceipt({ jobId });
    expect(second.alreadyClosed).toBe(true);
    expect(kindsOnly(seen)).toEqual(['job.confirmed_received']);
  });

  it('dispute → job.disputed', async () => {
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'payment_sent',
    });
    await insertEnrollment(testDb.pool, jobId, users.active1);
    const seen = listenAll();
    await caller(
      makeCtx({ userId: users.active1, role: 'Active' }),
    ).jobs.dispute({ jobId, reason: 'Never received Venmo' });
    expect(kindsOnly(seen)).toEqual(['job.disputed']);
  });

  it('resolveDispute (closed/cancelled/paymentSent) → job.dispute_resolved', async () => {
    const j1 = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'disputed',
      disputeReason: 'x',
    });
    const j2 = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'disputed',
      disputeReason: 'x',
    });
    const j3 = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'disputed',
      disputeReason: 'x',
    });
    const seen = listenAll();
    await caller(
      makeCtx({ userId: users.admin, role: 'Admin' }),
    ).jobs.resolveDisputeAsClosed({ jobId: j1, note: 'ok' });
    await caller(
      makeCtx({ userId: users.admin, role: 'Admin' }),
    ).jobs.resolveDisputeAsCancelled({ jobId: j2, note: 'reverted' });
    await caller(
      makeCtx({ userId: users.admin, role: 'Admin' }),
    ).jobs.resolveDisputeAsPaymentSent({ jobId: j3, note: 'try again' });
    expect(kindsOnly(seen)).toEqual([
      'job.dispute_resolved',
      'job.dispute_resolved',
      'job.dispute_resolved',
    ]);
  });

  it('event payload is IDs only (R-07 / C-07 privacy)', async () => {
    const seen = listenAll();
    await caller(makeCtx({ userId: users.alumni, role: 'Alumni' })).jobs.post({
      description: 'super-secret description',
      duesAmount: 999,
      recommendedPeopleCount: 1,
      posterContactKind: 'phone',
      posterContactValue: '5551234',
      location: 'private',
      estimatedDurationHours: 1,
    });
    const e = seen[0]!;
    expect(Object.keys(e).sort()).toEqual(
      ['actor_id', 'chapter_id', 'event_id', 'event_kind', 'job_id', 'occurred_at'].sort(),
    );
    const json = JSON.stringify(e);
    expect(json).not.toMatch(/super-secret/);
    expect(json).not.toMatch(/5551234/);
    expect(json).not.toMatch(/private/);
    expect(json).not.toMatch(/999/);
  });
});
