import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('resend', () => ({
  Resend: vi.fn(function Resend(this: unknown) {
    return { emails: { send: mockSend } };
  }),
}));

import { sendEmail } from '../src/send-email';

function Template({ greeting }: { greeting: string }): React.ReactElement {
  return React.createElement('p', null, greeting);
}

const SAMPLE_TEMPLATE = React.createElement(Template, { greeting: 'Hello world' });

const ORIGINAL_API_KEY = process.env.RESEND_API_KEY;

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: 'mocked-id' }, error: null });
  process.env.RESEND_API_KEY = 'test-key';
});

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = ORIGINAL_API_KEY;
  }
  delete process.env.RESEND_FROM_ADDRESS;
});

describe('sendEmail()', () => {
  it('skips and logs when RESEND_API_KEY missing', async () => {
    delete process.env.RESEND_API_KEY;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendEmail({
      to: 'foo@bar.invalid',
      subject: 'test',
      template: SAMPLE_TEMPLATE,
    });

    expect(result).toEqual({ skipped: true, reason: 'no RESEND_API_KEY' });
    expect(mockSend).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[email:dev] to=foo@bar.invalid subject="test"'),
    );
    logSpy.mockRestore();
  });

  it('renders HTML + plaintext from the React Email template and forwards them', async () => {
    await sendEmail({
      to: 'foo@bar.invalid',
      subject: 'hi',
      template: SAMPLE_TEMPLATE,
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const payload = mockSend.mock.calls[0]![0] as {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(payload.to).toBe('foo@bar.invalid');
    expect(payload.subject).toBe('hi');
    expect(payload.html).toContain('Hello world');
    expect(payload.text).toContain('Hello world');
    expect(payload.from).toMatch(/noreply@todos-for-dues\.app/);
  });

  it('uses RESEND_FROM_ADDRESS when set', async () => {
    process.env.RESEND_FROM_ADDRESS = 'Custom <custom@example.invalid>';
    await sendEmail({
      to: 'x@y.invalid',
      subject: 's',
      template: SAMPLE_TEMPLATE,
    });
    expect(mockSend.mock.calls[0]![0].from).toBe('Custom <custom@example.invalid>');
  });

  it('passes Idempotency-Key header when provided', async () => {
    await sendEmail({
      to: 'x@y.invalid',
      subject: 's',
      template: SAMPLE_TEMPLATE,
      idempotencyKey: 'job:abc:payment_sent',
    });
    expect(mockSend.mock.calls[0]![0].headers).toEqual({
      'Idempotency-Key': 'job:abc:payment_sent',
    });
  });

  it('omits headers when no idempotencyKey provided', async () => {
    await sendEmail({
      to: 'x@y.invalid',
      subject: 's',
      template: SAMPLE_TEMPLATE,
    });
    expect(mockSend.mock.calls[0]![0].headers).toBeUndefined();
  });

  it('throws on Resend error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Recipient suppressed', name: 'application_error' },
    });

    await expect(
      sendEmail({
        to: 'x@y.invalid',
        subject: 's',
        template: SAMPLE_TEMPLATE,
      }),
    ).rejects.toThrow(/Recipient suppressed/);
  });

  it('returns the Resend message id on success', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg-123' }, error: null });
    const result = await sendEmail({
      to: 'x@y.invalid',
      subject: 's',
      template: SAMPLE_TEMPLATE,
    });
    expect(result).toEqual({ id: 'msg-123' });
  });
});
