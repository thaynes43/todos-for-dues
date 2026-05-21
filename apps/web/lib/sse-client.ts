'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import type { ChapterEvent, ChapterEventKind } from '@app/api/events';

/**
 * Client SSE consumer (PRD-012 R-05 / PLAN-018 Track D).
 *
 * One EventSource per signed-in session — mounted at the AppShell layer in
 * `<RealtimeProvider>` (PLAN-018 Q-PLN-01). On each chapter event:
 *   1. invalidate the affected tRPC React Query keys via `trpc.useUtils()`
 *      (which produces the correct `[['jobs','X'], ...]` key shape), and
 *   2. call `router.refresh()` so server-component pages re-render with
 *      fresh data.
 *
 * Per-event behavior is keyed by `event_kind`. The map below is exhaustive
 * over `ChapterEventKind`; TypeScript flags any new kind we forget.
 *
 * Debounce (PLAN-018 Q-PLN-02 — 250ms): bursts of mutations coalesce into
 * ONE `router.refresh()` per window and ONE invalidate per key. Without
 * this, a moderator approving 5 jobs in a row would trigger 5 server
 * re-renders in the Active's tab — wasted work.
 *
 * Failure mode (R-06): if `new EventSource(...)` throws (constructor blocked
 * by the browser or a test) we swallow the error — the rest of the app is
 * unaffected and behaves as today (initial render + own-mutation
 * `router.refresh()` + manual refresh as the floor).
 */

const SSE_URL = '/api/events/chapter';
const REFRESH_DEBOUNCE_MS = 250;

/**
 * Names of the tRPC `jobs.*` query procedures to invalidate for a given
 * event kind. Each name resolves through `trpc.useUtils().jobs[name]` to
 * the right `invalidate()` call below.
 */
type JobQueryName =
  | 'listByState'
  | 'listMyPosted'
  | 'listMyEnrolled'
  | 'listModerationQueue'
  | 'getById';

const KIND_TO_QUERIES: Record<ChapterEventKind, ReadonlyArray<JobQueryName>> = {
  'job.posted':             ['listByState', 'listMyPosted', 'listModerationQueue'],
  'job.approved':           ['listByState', 'listMyPosted', 'listModerationQueue', 'getById'],
  'job.rejected':           ['listByState', 'listMyPosted', 'listModerationQueue', 'getById'],
  'job.edited':             ['listByState', 'listMyPosted', 'getById'],
  'job.enrolled':           ['listByState', 'listMyEnrolled', 'getById'],
  'job.unenrolled':         ['listByState', 'listMyEnrolled', 'getById'],
  'job.locked':             ['listByState', 'listMyPosted', 'listMyEnrolled', 'getById'],
  'job.rescheduled':        ['listByState', 'listMyPosted', 'listMyEnrolled', 'getById'],
  'job.completed':          ['listByState', 'listMyPosted', 'listMyEnrolled', 'getById'],
  'job.revert_completion':  ['listByState', 'listMyPosted', 'listMyEnrolled', 'getById'],
  'job.payment_sent':       ['listByState', 'listMyPosted', 'listMyEnrolled', 'getById'],
  'job.confirmed_received': ['listByState', 'listMyPosted', 'listMyEnrolled', 'getById'],
  'job.disputed':           ['listByState', 'listMyPosted', 'listMyEnrolled', 'getById'],
  'job.dispute_resolved':   ['listByState', 'listMyPosted', 'listMyEnrolled', 'getById'],
  'job.cancelled':          ['listByState', 'listMyPosted', 'listMyEnrolled', 'getById'],
};

export function useChapterEvents(): void {
  const router = useRouter();
  const utils = trpc.useUtils();
  // Refs so the long-lived effect always sees the freshest hook values.
  // Mutating refs during render trips react-hooks/refs in React 19; sync in
  // a passive effect instead — it runs immediately after render commits.
  const routerRef = useRef(router);
  const utilsRef = useRef(utils);
  useEffect(() => {
    routerRef.current = router;
    utilsRef.current = utils;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.EventSource === 'undefined') return;

    let es: EventSource;
    try {
      es = new EventSource(SSE_URL);
    } catch (err) {
      console.warn('Real-time SSE unavailable:', err);
      return;
    }

    const pendingKinds = new Set<ChapterEventKind>();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = (): void => {
      refreshTimer = null;
      const kinds = Array.from(pendingKinds);
      pendingKinds.clear();
      const queries = new Set<JobQueryName>();
      for (const k of kinds) {
        for (const q of KIND_TO_QUERIES[k]) queries.add(q);
      }
      const u = utilsRef.current.jobs;
      for (const q of queries) {
        void u[q].invalidate();
      }
      try {
        routerRef.current.refresh();
      } catch (err) {
        console.warn('router.refresh() failed in SSE consumer:', err);
      }
    };

    const onMessage = (raw: MessageEvent<string>): void => {
      let parsed: ChapterEvent | null = null;
      try {
        parsed = JSON.parse(raw.data) as ChapterEvent;
      } catch (err) {
        console.warn('SSE: failed to parse event payload:', err);
        return;
      }
      if (!parsed) return;
      if (parsed.event_kind in KIND_TO_QUERIES) {
        pendingKinds.add(parsed.event_kind);
        if (refreshTimer == null) {
          refreshTimer = setTimeout(flush, REFRESH_DEBOUNCE_MS);
        }
      }
    };

    // SSE `event:` lines do NOT fire the default `message` handler — register
    // each named kind explicitly so the consumer is exhaustive.
    const kinds = Object.keys(KIND_TO_QUERIES) as ChapterEventKind[];
    for (const kind of kinds) {
      es.addEventListener(kind, onMessage as EventListener);
    }

    const onError = (err: Event): void => {
      console.debug('SSE error (will auto-reconnect):', err);
    };
    es.addEventListener('error', onError);

    return () => {
      if (refreshTimer != null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      for (const kind of kinds) {
        es.removeEventListener(kind, onMessage as EventListener);
      }
      es.removeEventListener('error', onError);
      try {
        es.close();
      } catch {
        // already closed
      }
    };
  }, []);
}
