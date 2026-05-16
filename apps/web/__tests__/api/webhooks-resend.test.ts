import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

// Use a deterministic raw secret value (base64 of "the-secret-bytes!") so we
// can compute expected signatures without depending on whsec_ prefix parsing.
const RAW_SECRET = 'dGhlLXNlY3JldC1ieXRlcyE=';
const SECRET = `whsec_${RAW_SECRET}`;
const SECRET_BUF = Buffer.from(RAW_SECRET, 'base64');

function signPayload(id: string, timestamp: string, body: string): string {
  const sig = createHmac('sha256', SECRET_BUF)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return `v1,${sig}`;
}

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.RESEND_WEBHOOK_SECRET;
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.RESEND_WEBHOOK_SECRET;
  } else {
    process.env.RESEND_WEBHOOK_SECRET = originalSecret;
  }
  vi.restoreAllMocks();
});

// Lazy import keeps the route fresh per test (so env reads are picked up).
async function loadRoute() {
  vi.resetModules();
  return import('../../app/api/webhooks/resend/route');
}

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/webhooks/resend', {
    method: 'POST',
    body,
    headers,
  });
}

describe('POST /api/webhooks/resend', () => {
  it('returns 200 on a valid signed payload', async () => {
    const { POST } = await loadRoute();
    const id = 'msg_test_001';
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } });
    const sig = signPayload(id, ts, body);

    const res = await POST(
      makeRequest(body, {
        'svix-id': id,
        'svix-timestamp': ts,
        'svix-signature': sig,
        'content-type': 'application/json',
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });

  it('returns 401 when svix headers are missing', async () => {
    const { POST } = await loadRoute();
    const body = JSON.stringify({ type: 'email.delivered' });
    const res = await POST(
      makeRequest(body, {}) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 on a tampered body (signature mismatch)', async () => {
    const { POST } = await loadRoute();
    const id = 'msg_test_002';
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: 'email.delivered' });
    const sig = signPayload(id, ts, body);

    const tamperedBody = JSON.stringify({ type: 'email.bounced' });
    const res = await POST(
      makeRequest(tamperedBody, {
        'svix-id': id,
        'svix-timestamp': ts,
        'svix-signature': sig,
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when timestamp is older than 5 minutes', async () => {
    const { POST } = await loadRoute();
    const id = 'msg_test_003';
    const ts = String(Math.floor(Date.now() / 1000) - 10 * 60); // 10 min ago
    const body = JSON.stringify({ type: 'email.delivered' });
    const sig = signPayload(id, ts, body);

    const res = await POST(
      makeRequest(body, {
        'svix-id': id,
        'svix-timestamp': ts,
        'svix-signature': sig,
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when RESEND_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const { POST } = await loadRoute();
    const body = JSON.stringify({ type: 'email.delivered' });
    const res = await POST(
      makeRequest(body, {
        'svix-id': 'x',
        'svix-timestamp': '0',
        'svix-signature': 'v1,abc',
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(401);
  });

  it('logs bounce events via console.warn', async () => {
    const { POST } = await loadRoute();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const id = 'msg_test_bounce';
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({
      type: 'email.bounced',
      data: { to: 'bounced@example.invalid', email_id: 'em_999' },
    });
    const sig = signPayload(id, ts, body);

    const res = await POST(
      makeRequest(body, {
        'svix-id': id,
        'svix-timestamp': ts,
        'svix-signature': sig,
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[email:bounce]'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bounced@example.invalid'));
  });

  it('ignores delivered / opened / clicked events (no warn log)', async () => {
    const { POST } = await loadRoute();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const eventType of ['email.delivered', 'email.opened', 'email.clicked']) {
      const id = `msg-${eventType}`;
      const ts = String(Math.floor(Date.now() / 1000));
      const body = JSON.stringify({
        type: eventType,
        data: { to: 'x@example.invalid', email_id: 'em' },
      });
      const sig = signPayload(id, ts, body);
      const res = await POST(
        makeRequest(body, {
          'svix-id': id,
          'svix-timestamp': ts,
          'svix-signature': sig,
        }) as unknown as Parameters<typeof POST>[0],
      );
      expect(res.status).toBe(200);
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('accepts any of multiple space-separated signatures', async () => {
    const { POST } = await loadRoute();
    const id = 'msg_test_multi';
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: 'email.delivered' });
    const good = signPayload(id, ts, body);
    const bogus = 'v1,deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

    const res = await POST(
      makeRequest(body, {
        'svix-id': id,
        'svix-timestamp': ts,
        'svix-signature': `${bogus} ${good}`,
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(200);
  });
});
