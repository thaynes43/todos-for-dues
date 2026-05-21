import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/auth', () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from '@app/auth';
import { chapterBus } from '@app/api/events';
import { GET } from '../../app/api/events/chapter/route';

beforeEach(() => {
  vi.mocked(getServerSession).mockReset();
  chapterBus.reset();
});

afterEach(() => {
  chapterBus.reset();
});

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/events/chapter', {
    method: 'GET',
    headers,
    signal: new AbortController().signal,
  });
}

describe('GET /api/events/chapter — auth gate (PRD-012 AC-06)', () => {
  it('returns 401 when there is no session', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null as never);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(res.headers.get('Content-Type')).not.toMatch(/event-stream/);
  });

  it('returns 401 when session has no user.id', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      session: { id: 's' },
      user: {},
    } as never);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 200 + SSE headers + connected comment for a valid session', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      session: { id: 's' },
      user: { id: 'u-1' },
    } as never);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/event-stream/);
    expect(res.headers.get('Cache-Control')).toMatch(/no-cache/);
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain(': connected');
    expect(text).toContain('retry: 3000');
    await reader.cancel();
  });
});
