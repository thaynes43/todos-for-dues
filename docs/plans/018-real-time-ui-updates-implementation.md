---
id: PLAN-018
title: Real-time UI updates (SSE) — implementation
status: Proposed
author: Coordinator
created: 2026-05-20
last_updated: 2026-05-20
related:
  prds: [PRD-012]
  adrs: [ADR-001, ADR-003, ADR-004, ADR-012]
  designs: []
  plans:
    prerequisite: [016, 017]
    paired_validation: 018-real-time-ui-updates-validation
---

## 1. Goal

Implement PRD-012 + ADR-012 end-to-end: server-side chapter event bus, SSE route handler, mutation procedures publish to the bus, client SSE consumer integrated with the existing tRPC + Next.js stack.

**Success:** two browser sessions in the same chapter observe each other's mutations within 2s P95, without manual refresh. The SSE channel degrades gracefully if blocked. Existing MVP-FIX-A own-actor refresh continues to work.

## 2. Inputs

### 2.1 Documents the agent must read first

1. `docs/prds/012-real-time-ui-updates.md` — the PRD. **All R-NN + AC-NN.**
2. `docs/adrs/012-real-time-transport.md` — the transport decision + consequences C-01..C-10. **Every C-N is a constraint this plan must honor.**
3. `docs/prds/010-job-content-enrichment.md` + `docs/prds/011-job-editability-pre-lock.md` — the prior PRDs whose mutations get pushed.
4. `apps/web/app/api/health/route.ts` — existing Next.js App Router route handler; example of the route handler shape for SSE.
5. `packages/api/src/routers/jobs.ts` — every mutation needs to publish an event.
6. `apps/web/components/RoleChangeDropdown.tsx` — the MVP-FIX-A reference pattern. The SSE consumer mirrors this for cross-actor case.

### 2.2 Repo state assumed

- PLAN-016 + PLAN-017 merged. Job content enrichment + editability are in place; all the mutations that PRD-012 must push events for exist.
- v0.9.x or v0.10.x — whatever the post-PLAN-017 release ended up as.
- Single-pod deploy (the launch chapter's current shape). Multi-pod broadcast adapter deferred per PRD-012 Q-02.

## 3. Outputs

### Track A — Server-side event bus

- New file `packages/api/src/events/chapter-bus.ts`:
  - Singleton `ChapterEventBus` per process (in-memory pub/sub).
  - `publish(chapterId: string, event: ChapterEvent): void` — adds to in-memory ring buffer (keyed by chapter, capped at 1000 events, 5-min TTL).
  - `subscribe(chapterId: string, onEvent: (e) => void, lastEventId?: string): () => void` — registers a callback; replays buffered events with `event_id > lastEventId`; returns unsubscribe.
  - Event ID generation: monotonic per chapter; `${chapterId}:${nanoid()}` or `${chapterId}:${incrementingCounter}`.
- Type `ChapterEvent`:
  ```ts
  type ChapterEvent = {
    event_id: string;
    chapter_id: string;
    job_id: string;
    event_kind: 'job.posted' | 'job.approved' | 'job.rejected' | 'job.edited'
              | 'job.enrolled' | 'job.unenrolled' | 'job.locked' | 'job.rescheduled'
              | 'job.completed' | 'job.payment_sent' | 'job.confirmed_received'
              | 'job.disputed' | 'job.cancelled';
    actor_id: string;
    occurred_at: string; // ISO
  };
  ```

### Track B — SSE route handler

- New file `apps/web/app/api/events/chapter/route.ts`:
  - Auth gate: extract session via Better Auth; reject 401 if anonymous; reject 403 if user not in chapter (the user's `chapterId` doesn't match the chapter context).
  - Open a `ReadableStream<Uint8Array>` and stream events.
  - Read `Last-Event-ID` header from request; pass to `bus.subscribe()`.
  - Heartbeat: every 30s send `: keepalive\n\n`. Use `setInterval` inside the stream; clean up on abort.
  - Format: SSE-standard `id: <event_id>\nevent: <kind>\ndata: <json-payload>\n\n`.
  - Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `Connection: keep-alive`.

### Track C — Mutation procedures publish

- In `packages/api/src/routers/jobs.ts`, every mutation (`post`, `edit`, `approve`, `reject`, `enroll`, `unenroll`, `lock`, `reschedule`, `complete`, `markPaymentSent`, `confirmReceived`, `dispute`, `cancel`) — after the DB write succeeds in its transaction — calls `chapterBus.publish(chapterId, event)`.
- Publish AFTER the transaction commits (not inside; in-memory bus has no transactional guarantees and we don't want to publish then have the txn roll back).
- Event IDs must be assigned in publish order; the bus handles monotonicity.

### Track D — Client SSE consumer

- New file `apps/web/lib/sse-client.ts`:
  - `useChapterEvents()` React hook.
  - On mount: opens `new EventSource('/api/events/chapter')`.
  - On event: maps `event_kind` → React Query invalidation keys + (if relevant to current route) `router.refresh()`.
  - On unmount: closes the EventSource.
  - Reconnect: `EventSource` does this natively; the browser sends `Last-Event-ID` header automatically on reconnect.
- Mount once at the **app shell layer** (e.g., `apps/web/components/AppShell.tsx`), NOT per-page. One EventSource per session.

### Track E — Playwright multi-context e2e

- New spec `apps/web/e2e/mvp/real-time-cross-session.spec.ts`:
  - Uses `browser.newContext()` twice (sessionA + sessionB) for independent cookies.
  - SessionA signs in as Alumni; sessionB signs in as Active (different users).
  - Both open `/jobs`.
  - SessionA posts a new job (which gets immediately moderator-approved via DB seed or a chained Moderator flow).
  - **Assert** sessionB's `/jobs` list shows the new job within 2s — without sessionB calling `page.reload()`.
- Also: AC-02 (detail-view cross-session edit), AC-03 (reconnect + replay), AC-04 (graceful degradation — verify by mocking `EventSource` to throw), AC-05 (privacy — read raw stream via fetch with cookie; assert no PII in payload).

### Track F — Multi-pod LISTEN/NOTIFY adapter (DEFERRED per PRD-012 Q-02)

NOT in this plan. The in-memory bus suffices for single-pod. When we go multi-pod, a follow-up plan adds:
- A Postgres LISTEN/NOTIFY adapter behind `ChapterEventBus`'s `publish/subscribe` interface.
- Same wire format; same API; only the bus implementation changes.

## 4. Steps

### Step 0 — Branch off `origin/main` (after PLAN-017 merges)

```sh
git fetch origin main && git checkout main && git pull --ff-only origin main
git checkout -b plan-018-real-time-sse
```

### Step 1 — Event bus + types

1. `packages/api/src/events/chapter-bus.ts` + `packages/api/src/events/types.ts`.
2. Unit test the bus with Vitest: publish/subscribe basic case, replay with `Last-Event-ID`, retention window, capacity cap.

### Step 2 — SSE route handler

1. `apps/web/app/api/events/chapter/route.ts`.
2. Vitest test: auth gate (no cookie → 401, wrong chapter → 403; valid session → 200 stream).
3. Local manual verify: `curl -H "Cookie: ..." http://localhost:3000/api/events/chapter` — confirm SSE format + keepalive.

### Step 3 — Mutation procedures publish

1. Audit every mutation in `packages/api/src/routers/jobs.ts`. After the DB transaction commits, call `chapterBus.publish(...)` with the correct `event_kind`.
2. Vitest covers: every mutation publishes exactly one event of the right kind.

### Step 4 — Client SSE consumer + AppShell mount

1. `apps/web/lib/sse-client.ts` + `useChapterEvents` hook.
2. Mount in `apps/web/components/AppShell.tsx` (or whatever the layout wrapper is).
3. Map `event_kind` → invalidation keys + page-route filter; verify the mappings.

### Step 5 — Playwright multi-context e2e (TDD-style)

1. Write the cross-session spec FIRST. Run it against the in-progress branch — expect failure if anything is incomplete; observe failure mode; fix.
2. Final pass: all ACs verified.

### Step 6 — Cross-plan invariants

(Same checklist as PLAN-016 / PLAN-017.)

### Step 7 — Commit + push + open PR

PR title: `feat(web): real-time UI updates via SSE (PRD-012 + ADR-012)`. `feat:` → minor bump.

### Step 8 — GATE 1 — STOP

## 5. Verification (end-to-end)

- [ ] VALIDATION-018 passes — every AC mapping green.
- [ ] All PRD-012 R-NN are wired.
- [ ] Cross-session Playwright test green 3× consecutively.
- [ ] Privacy invariant test green (raw stream payload contains only IDs).
- [ ] Cross-plan invariants all green.
- [ ] **Stale-page test** (the existing single-actor case from MVP-FIX-A) still passes.

## 6. Out of scope

- **Multi-pod LISTEN/NOTIFY adapter.** Deferred per PRD-012 Q-02. Single-pod assumed.
- **Mobile push notifications.** Out of PRD-012 scope.
- **Granular subscription** (per-job, per-list). Chapter-scoped; client filters.
- **Persistent event log queryable by users.** The bus's 5-min in-memory replay is for SSE reconnect only; audit log (PRD-007) is the durable history.

## 7. Risks & gotchas

### Risk 1 — In-memory bus loses events on pod restart

If the pod restarts (deploy, crash, etc.), all events in the in-memory buffer are lost. Clients that were mid-disconnect during a restart see a gap. Mitigation: clients always re-fetch on reconnect via existing tRPC queries (R-06 graceful degradation). For multi-pod or HA, the LISTEN/NOTIFY adapter (deferred) writes events to Postgres durably.

### Risk 2 — `router.refresh()` storms on bursty mutation traffic

If 10 mutations happen in 1 second (rare but possible during moderation marathons), the client receives 10 events and could call `router.refresh()` 10 times. Mitigation: debounce client-side — coalesce events received within 200ms; one refresh per debounce window per affected route.

### Risk 3 — EventSource memory leak on rapid page nav

If the SSE EventSource is mounted per-page, navigating Next.js routes might leak EventSources. Mitigation: mount at the AppShell level (one instance per session, not per page). Verify via DevTools memory profile.

### Risk 4 — Cross-suite e2e flake under SSE

If the test suite runs many specs in one Playwright invocation, SSE connections from earlier specs might leak into later specs and trigger unexpected refreshes. Mitigation: every spec's `afterEach` closes the page; EventSource is bound to the page lifecycle so this should auto-clean up. Verify.

### Risk 5 — Reverse-proxy buffering breaks SSE in production

Per ADR-012 C-08, Traefik's default is fine but verify. Mitigation: PLAN-018 §5 includes a live-instance check after deploy — `curl https://todos-for-dues.haynesops.com/api/events/chapter` with auth cookie; observe keepalive line every 30s.

### Risk 6 — Privacy invariant regression

Per ADR-012 C-07 / PRD-012 R-07: NO PII in event payloads. Easy to accidentally include `job.description` "for convenience." Mitigation: the `ChapterEvent` type is the schema; any change to it should be code-reviewed against PRD-012 R-07. The privacy test (AC-05) is the regression guard.

### Risk 7 — Cross-plan invariants

The new mutation publishing path runs INSIDE every existing mutation procedure. If any mutation's transaction handling is incorrectly modified, the FSM invariant might break. The bus publish happens AFTER the transaction commits — outside the transaction boundary. Verify each mutation in the diff.

## 8. Resume points

- After Step 0: branch.
- After Step 1: bus + tests.
- After Step 2: SSE handler + tests.
- After Step 3: mutations publish.
- After Step 4: client consumer.
- After Step 5: e2e green.
- After Step 6: invariants green.
- After Step 7: PR.
- After Step 8: Gate 1.

## 9. Open questions

| ID | Question | Lean |
|----|----------|------|
| Q-PLN-01 | Where does the AppShell mount the EventSource? In a top-level `'use client'` wrapper around `app/layout.tsx`, or in a separate `<RealtimeProvider>` component? Lean: separate provider — cleaner separation. | Provider. |
| Q-PLN-02 | Debounce window for `router.refresh()` storms — 200ms? 500ms? Lean: 250ms (single-tick under load; imperceptible to users). | 250ms. |
| Q-PLN-03 | Should the bus's ring buffer be per-chapter or global? Lean: per-chapter (multi-tenant scaling). | Per-chapter map keyed by `chapter_id`. |
| Q-PLN-04 | Should mutation publish happen inside `db.transaction(...)` callback or after `await db.transaction(...)` returns? Lean: AFTER (transactional commit before broadcast). | After. |
| Q-PLN-05 | Reconnect retry delay — default `EventSource` retry (3s) vs. explicit `retry: 1000\n\n` directive? Lean: default. | Default 3s. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-20 | Coordinator | Initial Proposed. Depends on PLAN-016 + PLAN-017. |
