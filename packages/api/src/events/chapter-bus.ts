import { DEFAULT_CHAPTER_ID, type ChapterEvent, type ChapterEventKind } from './types';

/**
 * Per-chapter in-memory pub/sub for SSE fan-out (PLAN-018 Track A).
 *
 * Single-pod assumption per PRD-012 Q-02 / PLAN-018 §6 — the multi-pod
 * LISTEN/NOTIFY adapter is deferred. When that lands the public API
 * (`publish` / `subscribe`) is the seam; the wire format is unchanged.
 *
 * Buffer policy per PRD-012 R-04:
 *   - per-chapter ring; cap = MAX_BUFFERED_EVENTS (1000)
 *   - retention = MAX_RETENTION_MS (5 minutes)
 *   - reconnects with `Last-Event-ID` replay events with `event_id > N`
 *     still in the window; older clients re-fetch via tRPC on page load.
 *
 * Event IDs are monotonic per chapter — `${chapterId}:${counter}` keeps the
 * `>` comparison cheap and stable across the bus's lifetime in a single pod.
 * The counter resets on pod restart; clients that reconnect with a
 * pre-restart id fall through to the "no replay" branch and pull fresh
 * data on the next page navigation (R-06 graceful degradation).
 */

export const MAX_BUFFERED_EVENTS = 1000;
export const MAX_RETENTION_MS = 5 * 60 * 1000;

interface BufferedEntry {
  event: ChapterEvent;
  counter: number;
  bufferedAt: number;
}

type Listener = (event: ChapterEvent) => void;

interface ChapterChannel {
  buffer: BufferedEntry[];
  listeners: Set<Listener>;
  counter: number;
}

export interface PublishInput {
  chapterId?: string;
  jobId: string;
  eventKind: ChapterEventKind;
  actorId: string;
  occurredAt?: Date;
}

export interface SubscribeOptions {
  lastEventId?: string | null;
  /** Override the global clock for tests; defaults to `Date.now`. */
  now?: () => number;
}

export class ChapterEventBus {
  private readonly channels = new Map<string, ChapterChannel>();

  publish(input: PublishInput): ChapterEvent {
    const chapterId = input.chapterId ?? DEFAULT_CHAPTER_ID;
    const channel = this.getOrCreate(chapterId);
    channel.counter += 1;
    const event: ChapterEvent = {
      event_id: `${chapterId}:${channel.counter}`,
      chapter_id: chapterId,
      job_id: input.jobId,
      event_kind: input.eventKind,
      actor_id: input.actorId,
      occurred_at: (input.occurredAt ?? new Date()).toISOString(),
    };
    channel.buffer.push({
      event,
      counter: channel.counter,
      bufferedAt: Date.now(),
    });
    this.evict(channel);
    for (const listener of channel.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error(
          `chapterBus.publish: subscriber callback threw for ${event.event_id}:`,
          err,
        );
      }
    }
    return event;
  }

  /**
   * Subscribe a listener for `chapterId`. Returns an unsubscribe function.
   *
   * If `lastEventId` is provided, replays any buffered events with a
   * counter strictly greater than the client's last counter that are
   * still inside the retention window. Replay happens synchronously
   * before this function returns (and before any new event the caller
   * might publish next), so the listener observes the full ordered
   * sequence without gaps.
   */
  subscribe(
    chapterIdOrInput: string,
    listener: Listener,
    options: SubscribeOptions = {},
  ): () => void {
    const chapterId = chapterIdOrInput || DEFAULT_CHAPTER_ID;
    const channel = this.getOrCreate(chapterId);
    this.evict(channel, options.now);

    if (options.lastEventId) {
      const since = parseEventCounter(chapterId, options.lastEventId);
      if (since !== null) {
        for (const entry of channel.buffer) {
          if (entry.counter > since) {
            try {
              listener(entry.event);
            } catch (err) {
              console.error(
                `chapterBus.subscribe: replay callback threw for ${entry.event.event_id}:`,
                err,
              );
            }
          }
        }
      }
    }

    channel.listeners.add(listener);
    return () => {
      channel.listeners.delete(listener);
    };
  }

  /** Returns the current buffer for a chapter (test helper). */
  bufferSnapshot(chapterId: string = DEFAULT_CHAPTER_ID): ChapterEvent[] {
    return (this.channels.get(chapterId)?.buffer ?? []).map((e) => e.event);
  }

  /** Test helper — drops all state for the chapter. */
  reset(chapterId?: string): void {
    if (chapterId) {
      this.channels.delete(chapterId);
    } else {
      this.channels.clear();
    }
  }

  listenerCount(chapterId: string = DEFAULT_CHAPTER_ID): number {
    return this.channels.get(chapterId)?.listeners.size ?? 0;
  }

  private getOrCreate(chapterId: string): ChapterChannel {
    let channel = this.channels.get(chapterId);
    if (!channel) {
      channel = { buffer: [], listeners: new Set(), counter: 0 };
      this.channels.set(chapterId, channel);
    }
    return channel;
  }

  private evict(channel: ChapterChannel, now: () => number = Date.now): void {
    const threshold = now() - MAX_RETENTION_MS;
    let dropTo = 0;
    while (dropTo < channel.buffer.length) {
      const entry = channel.buffer[dropTo];
      if (!entry) break;
      if (entry.bufferedAt < threshold) {
        dropTo += 1;
      } else {
        break;
      }
    }
    if (dropTo > 0) channel.buffer.splice(0, dropTo);
    const overflow = channel.buffer.length - MAX_BUFFERED_EVENTS;
    if (overflow > 0) channel.buffer.splice(0, overflow);
  }
}

function parseEventCounter(chapterId: string, eventId: string): number | null {
  const prefix = `${chapterId}:`;
  if (!eventId.startsWith(prefix)) return null;
  const rest = eventId.slice(prefix.length);
  const n = Number.parseInt(rest, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Process-singleton bus. Importing this module twice in the same Node
 * process gives the same instance (ES module cache), so the mutation
 * publishers in `routers/jobs.ts` and the SSE route handler agree on a
 * single in-memory channel.
 */
export const chapterBus = new ChapterEventBus();
