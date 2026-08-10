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
import { sendTreasurerEmail } from '../src/helpers/treasurer-breakdown';

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

describe('sendTreasurerEmail()', () => {
  it('composes recipient from chapter_settings + chapter name in subject; uses idempotency key', async () => {
    await seedSettings(testDb.pool, {
      treasurer: 'treasurer@chapter.invalid',
      chapterName: 'Sigma Phi Omicron — UMass Lowell',
    });
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      description: 'Clean the chapter house',
      duesAmount: '100.00',
      perActiveDuesCredit: {
        [users.active1]: '50.00',
        [users.active2]: '50.00',
      },
    });

    await sendTreasurerEmail({ jobId });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const payload = mockSend.mock.calls[0]![0];
    expect(payload.to).toBe('treasurer@chapter.invalid');
    expect(payload.subject).toContain('Sigma Phi Omicron — UMass Lowell');
    expect(payload.subject).toContain('payment sent');
    expect(payload.subject).toContain('Clean the chapter house');
    expect(payload.headers).toEqual({
      'Idempotency-Key': `job:${jobId}:payment_sent`,
    });
  });

  it('renders all line items (displayName + amount) and total', async () => {
    await seedSettings(testDb.pool, {
      treasurer: 'treasurer@chapter.invalid',
      chapterName: 'Chapter',
    });
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      description: 'job',
      duesAmount: '100.00',
      perActiveDuesCredit: {
        [users.active1]: '50.00',
        [users.active2]: '50.00',
      },
    });

    await sendTreasurerEmail({ jobId });

    const html = mockSend.mock.calls[0]![0].html as string;
    expect(html).toContain('Alice Active');
    expect(html).toContain('Bob Active');
    expect(html).toContain('$50.00');
    expect(html).toContain('$100.00');
    expect(html).toContain(jobId);
  });

  it('throws if job not found', async () => {
    await seedSettings(testDb.pool, {
      treasurer: 't@x.invalid',
      chapterName: 'Chapter',
    });
    await expect(
      sendTreasurerEmail({ jobId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow(/not found/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('throws if job has no perActiveDuesCredit', async () => {
    await seedSettings(testDb.pool, {
      treasurer: 't@x.invalid',
      chapterName: 'Chapter',
    });
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'completed',
      perActiveDuesCredit: null,
    });
    await expect(sendTreasurerEmail({ jobId })).rejects.toThrow(/per-Active credit/);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
