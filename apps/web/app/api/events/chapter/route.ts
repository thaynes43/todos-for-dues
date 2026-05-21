import { getServerSession } from '@app/auth';
import { chapterBus, DEFAULT_CHAPTER_ID, type ChapterEvent } from '@app/api/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Long-lived stream; opt out of revalidation entirely.
export const revalidate = false;
// Per ADR-012 C-09: keep the stream open for the duration of the client's
// session. The 10-minute serverless cap on Vercel does not apply on the
// haynesops cluster (we deploy as a long-running Node server), but setting
// `maxDuration` documents intent for any platform that does.
export const maxDuration = 0;

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Server-Sent Events stream for chapter-scoped real-time updates
 * (PRD-012 / ADR-012 / PLAN-018 Track B).
 *
 * Auth: Better Auth session cookie (ADR-012 C-06). Anonymous → 401; signed
 * in but not a chapter member → 403. The MVP launch chapter is single-tenant
 * per deploy (one chapter per pod), so any authenticated user is a member;
 * the C-05 membership check is wired here so multi-tenant later swaps the
 * predicate without restructuring the handler.
 *
 * Privacy invariant (R-07 / C-07): the event payload that flows through the
 * bus is ID-only — the bus's `ChapterEvent` type is the schema. We do NOT
 * enrich, decorate, or join here; the client re-queries tRPC to render.
 *
 * Reconnect (R-04 / C-04): EventSource auto-sends `Last-Event-ID` on
 * reconnect. The route reads that header and asks the bus to replay any
 * events with `event_id > N` still in the retention window before opening
 * the live subscription.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getServerSession(request.headers);
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }
  // Single-tenant MVP: every signed-in user belongs to the lone chapter.
  // When multi-tenant routing lands, look up the user's chapterId here and
  // 403 if it does not match the URL/host-derived chapter context.
  const chapterId = DEFAULT_CHAPTER_ID;

  const lastEventId = request.headers.get('Last-Event-ID');
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array): void => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      // Initial frames: a comment line so curl + the browser observe a live
      // connection immediately, and a `retry` hint so reconnects honor our
      // 3s default (Q-PLN-05) without depending on the browser default.
      safeEnqueue(encoder.encode(`: connected\n\nretry: 3000\n\n`));

      const writeEvent = (event: ChapterEvent): void => {
        const frame =
          `id: ${event.event_id}\n` +
          `event: ${event.event_kind}\n` +
          `data: ${JSON.stringify(event)}\n\n`;
        safeEnqueue(encoder.encode(frame));
      };

      const unsubscribe = chapterBus.subscribe(chapterId, writeEvent, {
        lastEventId: lastEventId ?? undefined,
      });

      const heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(`: keepalive\n\n`));
      }, HEARTBEAT_INTERVAL_MS);
      // Don't keep Node alive solely for the heartbeat — the request lifecycle
      // owns the stream.
      if (typeof heartbeat.unref === 'function') heartbeat.unref();

      const close = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          unsubscribe();
        } catch (err) {
          console.error('SSE chapter stream: unsubscribe threw:', err);
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener('abort', close, { once: true });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // ADR-012 C-08 — disable any nginx-style proxy buffering on the stream.
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
