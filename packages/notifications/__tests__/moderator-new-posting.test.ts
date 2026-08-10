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
import { sendModeratorQueueEmail } from '../src/helpers/moderator-new-posting';

let testDb: NotificationsTestDb;
let users: SeededUsers;

const ORIGINAL_API_KEY = process.env.RESEND_API_KEY;
const ORIGINAL_PUBLIC_BASE = process.env.PUBLIC_BASE_URL;

beforeAll(async () => {
  testDb = await startNotificationsTestDb();
  process.env.RESEND_API_KEY = 'test-key';
  process.env.PUBLIC_BASE_URL = 'https://app.test.invalid';
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = ORIGINAL_API_KEY;
  }
  if (ORIGINAL_PUBLIC_BASE === undefined) {
    delete process.env.PUBLIC_BASE_URL;
  } else {
    process.env.PUBLIC_BASE_URL = ORIGINAL_PUBLIC_BASE;
  }
});

beforeEach(async () => {
  await resetFixtures(testDb.pool);
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: 'mocked-id' }, error: null });
  users = await seedUsers(testDb.pool);
});

describe('sendModeratorQueueEmail()', () => {
  it('composes recipient from moderators_recipient_email setting; subject includes chapter name + job description', async () => {
    await seedSettings(testDb.pool, {
      moderators: 'mods@chapter.invalid',
      chapterName: 'Sigma Phi Omicron',
    });
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      description: 'Clean the lawn',
      duesAmount: '50.00',
      recommendedPeopleCount: 3,
      state: 'awaiting_moderation',
    });

    await sendModeratorQueueEmail({ jobId });

    const payload = mockSend.mock.calls[0]![0];
    expect(payload.to).toBe('mods@chapter.invalid');
    expect(payload.subject).toContain('Sigma Phi Omicron');
    expect(payload.subject).toContain('new posting');
    expect(payload.subject).toContain('Clean the lawn');
  });

  it('passes job description, dues amount, recommended count, poster name, and queue URL', async () => {
    await seedSettings(testDb.pool, {
      moderators: 'mods@x.invalid',
      chapterName: 'Chapter',
    });
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      description: 'Clean the lawn',
      duesAmount: '50.00',
      recommendedPeopleCount: 3,
      state: 'awaiting_moderation',
    });

    await sendModeratorQueueEmail({ jobId });

    const html = mockSend.mock.calls[0]![0].html as string;
    expect(html).toContain('Clean the lawn');
    expect(html).toContain('$50.00');
    expect(html).toContain('3');
    expect(html).toContain('Alumni Adam');
    expect(html).toContain('https://app.test.invalid/moderation-queue');
  });

  it('uses Idempotency-Key job:<jobId>:moderation_queue', async () => {
    await seedSettings(testDb.pool, {
      moderators: 'mods@x.invalid',
      chapterName: 'Chapter',
    });
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'awaiting_moderation',
    });

    await sendModeratorQueueEmail({ jobId });

    expect(mockSend.mock.calls[0]![0].headers).toEqual({
      'Idempotency-Key': `job:${jobId}:moderation_queue`,
    });
  });
});
