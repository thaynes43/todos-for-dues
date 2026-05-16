import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('resend', () => ({
  Resend: vi.fn(function Resend() {
    return { emails: { send: mockSend } };
  }),
}));

import {
  insertJob,
  resetFixtures,
  seedSettings,
  seedUsers,
  startNotificationsTestDb,
  type NotificationsTestDb,
  type SeededUsers,
} from './_setup';
import { sendAlumniRejectionEmail } from '../src/helpers/alumni-rejection';

let testDb: NotificationsTestDb;
let users: SeededUsers;

const ORIGINAL_API_KEY = process.env.RESEND_API_KEY;

beforeAll(async () => {
  testDb = await startNotificationsTestDb();
  process.env.RESEND_API_KEY = 'test-key';
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = ORIGINAL_API_KEY;
  }
});

beforeEach(async () => {
  await resetFixtures(testDb.pool);
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: 'mocked-id' }, error: null });
  users = await seedUsers(testDb.pool);
});

describe('sendAlumniRejectionEmail()', () => {
  it('sends to the posting Alumni\'s own email — NOT a chapter setting', async () => {
    await seedSettings(testDb.pool, { chapterName: 'Chapter' });
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      description: 'Some posting',
      state: 'rejected',
    });

    await sendAlumniRejectionEmail({ jobId, reason: 'Duplicate posting' });

    const payload = mockSend.mock.calls[0]![0];
    expect(payload.to).toBe('alumni@test.invalid');
  });

  it('passes job description and rejection reason; uses idempotency key job:<jobId>:rejected', async () => {
    await seedSettings(testDb.pool, { chapterName: 'Chapter' });
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      description: 'Clean the lawn',
      state: 'rejected',
    });

    await sendAlumniRejectionEmail({ jobId, reason: 'Already approved earlier today' });

    const payload = mockSend.mock.calls[0]![0];
    expect(payload.html).toContain('Clean the lawn');
    expect(payload.html).toContain('Already approved earlier today');
    expect(payload.headers).toEqual({
      'Idempotency-Key': `job:${jobId}:rejected`,
    });
  });
});
