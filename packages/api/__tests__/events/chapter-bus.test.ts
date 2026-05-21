import { describe, expect, it } from 'vitest';
import {
  ChapterEventBus,
  DEFAULT_CHAPTER_ID,
  MAX_BUFFERED_EVENTS,
  type ChapterEvent,
} from '../../src/events';

const ACTOR = '00000000-0000-0000-0000-0000000000aa';
const JOB = '11111111-1111-1111-1111-111111111111';

function collect(): {
  events: ChapterEvent[];
  listener: (e: ChapterEvent) => void;
} {
  const events: ChapterEvent[] = [];
  return { events, listener: (e) => events.push(e) };
}

describe('ChapterEventBus', () => {
  describe('publish + subscribe', () => {
    it('fans out events to live subscribers in publish order', () => {
      const bus = new ChapterEventBus();
      const a = collect();
      const b = collect();
      bus.subscribe(DEFAULT_CHAPTER_ID, a.listener);
      bus.subscribe(DEFAULT_CHAPTER_ID, b.listener);

      bus.publish({ jobId: JOB, eventKind: 'job.posted', actorId: ACTOR });
      bus.publish({ jobId: JOB, eventKind: 'job.approved', actorId: ACTOR });

      expect(a.events.map((e) => e.event_kind)).toEqual([
        'job.posted',
        'job.approved',
      ]);
      expect(b.events.map((e) => e.event_kind)).toEqual([
        'job.posted',
        'job.approved',
      ]);
    });

    it('produces monotonic per-chapter event ids', () => {
      const bus = new ChapterEventBus();
      const e1 = bus.publish({ jobId: JOB, eventKind: 'job.posted', actorId: ACTOR });
      const e2 = bus.publish({ jobId: JOB, eventKind: 'job.approved', actorId: ACTOR });
      const e3 = bus.publish({ jobId: JOB, eventKind: 'job.enrolled', actorId: ACTOR });
      expect(e1.event_id).toBe(`${DEFAULT_CHAPTER_ID}:1`);
      expect(e2.event_id).toBe(`${DEFAULT_CHAPTER_ID}:2`);
      expect(e3.event_id).toBe(`${DEFAULT_CHAPTER_ID}:3`);
    });

    it('isolates events per chapter', () => {
      const bus = new ChapterEventBus();
      const aCh = collect();
      const bCh = collect();
      bus.subscribe('alpha', aCh.listener);
      bus.subscribe('bravo', bCh.listener);

      bus.publish({ chapterId: 'alpha', jobId: JOB, eventKind: 'job.posted', actorId: ACTOR });
      bus.publish({ chapterId: 'bravo', jobId: JOB, eventKind: 'job.enrolled', actorId: ACTOR });

      expect(aCh.events).toHaveLength(1);
      expect(aCh.events[0]?.event_kind).toBe('job.posted');
      expect(aCh.events[0]?.event_id.startsWith('alpha:')).toBe(true);
      expect(bCh.events).toHaveLength(1);
      expect(bCh.events[0]?.event_kind).toBe('job.enrolled');
      expect(bCh.events[0]?.event_id.startsWith('bravo:')).toBe(true);
    });

    it('unsubscribe stops further deliveries', () => {
      const bus = new ChapterEventBus();
      const a = collect();
      const unsub = bus.subscribe(DEFAULT_CHAPTER_ID, a.listener);
      bus.publish({ jobId: JOB, eventKind: 'job.posted', actorId: ACTOR });
      unsub();
      bus.publish({ jobId: JOB, eventKind: 'job.approved', actorId: ACTOR });
      expect(a.events.map((e) => e.event_kind)).toEqual(['job.posted']);
      expect(bus.listenerCount(DEFAULT_CHAPTER_ID)).toBe(0);
    });

    it('listener throw does not break other listeners or the publisher', () => {
      const bus = new ChapterEventBus();
      const errors: unknown[] = [];
      const origErr = console.error;
      console.error = (...args: unknown[]) => errors.push(args);
      try {
        bus.subscribe(DEFAULT_CHAPTER_ID, () => {
          throw new Error('boom');
        });
        const good = collect();
        bus.subscribe(DEFAULT_CHAPTER_ID, good.listener);
        expect(() =>
          bus.publish({ jobId: JOB, eventKind: 'job.posted', actorId: ACTOR }),
        ).not.toThrow();
        expect(good.events).toHaveLength(1);
        expect(errors.length).toBeGreaterThan(0);
      } finally {
        console.error = origErr;
      }
    });

    it('contains only ID/metadata fields — privacy invariant (R-07 / C-07)', () => {
      const bus = new ChapterEventBus();
      const e = bus.publish({ jobId: JOB, eventKind: 'job.posted', actorId: ACTOR });
      expect(Object.keys(e).sort()).toEqual(
        ['actor_id', 'chapter_id', 'event_id', 'event_kind', 'job_id', 'occurred_at'].sort(),
      );
    });
  });

  describe('Last-Event-ID replay', () => {
    it('replays only events strictly greater than the lastEventId, in order', () => {
      const bus = new ChapterEventBus();
      bus.publish({ jobId: JOB, eventKind: 'job.posted', actorId: ACTOR });
      const second = bus.publish({
        jobId: JOB,
        eventKind: 'job.approved',
        actorId: ACTOR,
      });
      bus.publish({ jobId: JOB, eventKind: 'job.enrolled', actorId: ACTOR });
      bus.publish({ jobId: JOB, eventKind: 'job.locked', actorId: ACTOR });

      const replayed = collect();
      bus.subscribe(DEFAULT_CHAPTER_ID, replayed.listener, {
        lastEventId: second.event_id,
      });

      expect(replayed.events.map((e) => e.event_kind)).toEqual([
        'job.enrolled',
        'job.locked',
      ]);
    });

    it('replays NOTHING when lastEventId is at or past the head', () => {
      const bus = new ChapterEventBus();
      bus.publish({ jobId: JOB, eventKind: 'job.posted', actorId: ACTOR });
      const head = bus.publish({
        jobId: JOB,
        eventKind: 'job.approved',
        actorId: ACTOR,
      });
      const r = collect();
      bus.subscribe(DEFAULT_CHAPTER_ID, r.listener, { lastEventId: head.event_id });
      expect(r.events).toEqual([]);
    });

    it('replays NOTHING and does not crash on malformed/foreign lastEventId', () => {
      const bus = new ChapterEventBus();
      bus.publish({ jobId: JOB, eventKind: 'job.posted', actorId: ACTOR });
      const r = collect();
      bus.subscribe(DEFAULT_CHAPTER_ID, r.listener, { lastEventId: 'other-chapter:7' });
      const r2 = collect();
      bus.subscribe(DEFAULT_CHAPTER_ID, r2.listener, { lastEventId: 'nonsense' });
      expect(r.events).toEqual([]);
      expect(r2.events).toEqual([]);
    });

    it('subscriber after replay still receives newly published events', () => {
      const bus = new ChapterEventBus();
      const first = bus.publish({
        jobId: JOB,
        eventKind: 'job.posted',
        actorId: ACTOR,
      });
      bus.publish({ jobId: JOB, eventKind: 'job.approved', actorId: ACTOR });

      const r = collect();
      bus.subscribe(DEFAULT_CHAPTER_ID, r.listener, { lastEventId: first.event_id });
      bus.publish({ jobId: JOB, eventKind: 'job.enrolled', actorId: ACTOR });

      expect(r.events.map((e) => e.event_kind)).toEqual([
        'job.approved',
        'job.enrolled',
      ]);
    });
  });

  describe('retention window', () => {
    it('caps buffer at MAX_BUFFERED_EVENTS (capacity invariant)', () => {
      const bus = new ChapterEventBus();
      for (let i = 0; i < MAX_BUFFERED_EVENTS + 50; i++) {
        bus.publish({ jobId: JOB, eventKind: 'job.posted', actorId: ACTOR });
      }
      const snap = bus.bufferSnapshot();
      expect(snap.length).toBe(MAX_BUFFERED_EVENTS);
      // After overflow, the oldest events are evicted — first buffered counter
      // is therefore `(total - cap) + 1`.
      const first = snap[0]!;
      const last = snap[snap.length - 1]!;
      expect(first.event_id).toBe(`${DEFAULT_CHAPTER_ID}:51`);
      expect(last.event_id).toBe(
        `${DEFAULT_CHAPTER_ID}:${MAX_BUFFERED_EVENTS + 50}`,
      );
    });
  });
});
