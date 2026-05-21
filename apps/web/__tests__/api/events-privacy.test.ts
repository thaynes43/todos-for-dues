import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/auth', () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from '@app/auth';
import { chapterBus, DEFAULT_CHAPTER_ID } from '@app/api/events';
// Import the route module at top-level so it shares the same `chapterBus`
// singleton as this test file. Re-importing under `vi.resetModules()` would
// give the route a different bus instance and our publish() would never
// reach the stream.
import { GET } from '../../app/api/events/chapter/route';

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue({
    session: { id: 's' },
    user: { id: 'user-1' },
  } as never);
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

async function readUntil(
  res: Response,
  predicate: (acc: string) => boolean,
  timeoutMs = 1_500,
): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let acc = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      if (predicate(acc)) return acc;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return acc;
}

describe('GET /api/events/chapter — privacy + SSE framing (PRD-012 R-07 / AC-05)', () => {
  it('emits IDs-only frames; the raw stream never carries PII or content', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    setTimeout(() => {
      chapterBus.publish({
        chapterId: DEFAULT_CHAPTER_ID,
        jobId: 'job-aaa',
        eventKind: 'job.posted',
        actorId: 'user-1',
      });
    }, 10);

    const out = await readUntil(res, (acc) => acc.includes('event: job.posted'));
    expect(out).toContain('id: default:1');
    expect(out).toContain('event: job.posted');
    expect(out).toMatch(/data: \{[^\n]*\}/);

    const match = out.match(/data: (\{[^\n]*\})/);
    expect(match).not.toBeNull();
    const payload = JSON.parse(match![1]!);
    expect(Object.keys(payload).sort()).toEqual(
      ['actor_id', 'chapter_id', 'event_id', 'event_kind', 'job_id', 'occurred_at'].sort(),
    );
  });

  it('replays buffered events with Last-Event-ID', async () => {
    const first = chapterBus.publish({
      chapterId: DEFAULT_CHAPTER_ID,
      jobId: 'job-aaa',
      eventKind: 'job.posted',
      actorId: 'user-1',
    });
    chapterBus.publish({
      chapterId: DEFAULT_CHAPTER_ID,
      jobId: 'job-aaa',
      eventKind: 'job.approved',
      actorId: 'user-mod',
    });
    const res = await GET(makeRequest({ 'Last-Event-ID': first.event_id }));
    expect(res.status).toBe(200);

    const out = await readUntil(res, (acc) => acc.includes('event: job.approved'));
    expect(out).not.toContain('event: job.posted');
    expect(out).toContain('event: job.approved');
  });
});
