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
import { sendAdminDisputeEmail } from '../src/helpers/admin-dispute';

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

describe('sendAdminDisputeEmail()', () => {
  it('composes recipient from admin_recipient_email setting; subject includes chapter name + job description', async () => {
    await seedSettings(testDb.pool, {
      admin: 'admins@chapter.invalid',
      chapterName: 'Sigma Phi Omicron',
    });
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      description: 'Clean the lawn',
      state: 'disputed',
    });

    await sendAdminDisputeEmail({
      jobId,
      disputerId: users.active1,
      reason: 'Payment never received',
    });

    const payload = mockSend.mock.calls[0]![0];
    expect(payload.to).toBe('admins@chapter.invalid');
    expect(payload.subject).toContain('Sigma Phi Omicron');
    expect(payload.subject).toContain('DISPUTE');
    expect(payload.subject).toContain('Clean the lawn');
  });

  it('passes disputer display name + role, reason, job ID, and admin drill-in URL', async () => {
    await seedSettings(testDb.pool, {
      admin: 'a@x.invalid',
      chapterName: 'Chapter',
    });
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      description: 'job',
      state: 'disputed',
    });

    await sendAdminDisputeEmail({
      jobId,
      disputerId: users.active1,
      reason: 'specific reason text',
    });

    const html = mockSend.mock.calls[0]![0].html as string;
    expect(html).toContain('Alice Active');
    expect(html).toContain('Active'); // role
    expect(html).toContain('specific reason text');
    expect(html).toContain(jobId);
    expect(html).toContain(`https://app.test.invalid/admin/jobs/${jobId}`);
  });

  it('omits the Idempotency-Key header — re-disputes are legitimate distinct events', async () => {
    await seedSettings(testDb.pool, {
      admin: 'a@x.invalid',
      chapterName: 'Chapter',
    });
    const jobId = await insertJob(testDb.pool, {
      posterId: users.alumni,
      state: 'disputed',
    });

    await sendAdminDisputeEmail({
      jobId,
      disputerId: users.active1,
      reason: 'r',
    });
    expect(mockSend.mock.calls[0]![0].headers).toBeUndefined();
  });
});
