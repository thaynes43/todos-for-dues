---
id: PRD-012
title: Real-time UI updates across browser sessions
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-20
last_updated: 2026-05-20
size: M
related:
  parent_prd: PRD-001
  parent_requirements: [R-04, R-07, R-08]
  adrs: [ADR-001, ADR-003, ADR-004, ADR-012]
  flows: []
  designs: []
  bounded_contexts: []
  prds: [PRD-002, PRD-004, PRD-005, PRD-006, PRD-007, PRD-010, PRD-011]
  supersedes: null
---

## 1. Objective

> **Problem:** Today, mutations made by user A (e.g., posting a job, approving it, enrolling, locking, completing, marking payment sent) are invisible to user B's open browser until user B manually refreshes. The MVP click-through (2026-05-20) hit this repeatedly — chapter members on different devices end up out-of-sync, leading to "wait, that job is gone?" / "I tried to enroll but you already locked it" friction.
> **Audience:** Every persona using the app concurrently — Active, Alumni, Moderator, Admin.
> **Why now:** With PRD-010 + PRD-011 increasing the rate of meaningful mutations (more fields per posting, edits before lock), stale views become more disruptive. Real-time updates are the standard expectation for collaborative tools; the chapter expects it to work this way.
> **One-sentence definition of success:** When user A mutates a job, every other user with that job (or its listing page) visible in a browser sees the change within 2 seconds — without refreshing.

## 2. Background & context

- **Decomposes:** PRD-001 R-04 (moderator-Active workflow correctness), R-07 (state-machine visibility), R-08 (concurrent-actor coordination). PRD-012 is the missing layer that makes the existing PRDs feel like a single coordinated system rather than per-user snapshots.
- **Transport decision:** Server-Sent Events (SSE). See **ADR-012** for the alternatives considered + the decision rationale + consequences (C-01..C-10).
- **Tech stack assumed accepted:** ADR-001 (Next.js 16 App Router — SSE via streaming `Response` from route handlers), ADR-003 (tRPC remains the read/write API surface), ADR-004 (Postgres `LISTEN/NOTIFY` for multi-pod broadcast when relevant — deferred), ADR-012 (SSE as the chosen transport).
- **Stale-page MVP-FIX-A relationship:** MVP-FIX-A (closed 2026-05-20) added `router.refresh()` after own-actor mutations, so user A's own changes update without manual refresh. PRD-012 extends this to user B's view — the cross-session case. They're complementary; both must stay correct.
- **Scope-locked from other PRDs:** see §6.2.

## 3. Personas & user scenarios

### 3.1 Personas

Inherited from PRD-001 §4.1.

### 3.2 Scenarios / user stories

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As an **Active** with `/jobs` open, when an Alumni posts a new job and a Moderator approves it, I want to see the new `enrollment_open` job appear in my list without refreshing, so that I can enroll in time. | P0 |
| US-02 | As an **Active** viewing a specific job's detail page, when the Alumni edits or cancels it, I want to see the change reflected immediately, so that I don't enroll in (or attempt to enroll in) a stale version. | P0 |
| US-03 | As a **Moderator** with `/moderation-queue` open, when an Alumni posts a new job, I want to see it appear at the bottom of the queue without refreshing, so that I'm not unaware of pending work. | P0 |
| US-04 | As an **Alumni** with `/my-postings` open, when I post a job in one tab and view the list in another, I want to see the new posting in the list without refreshing the list tab. | P1 |
| US-05 | As a user whose network connection blips, I want my real-time stream to reconnect automatically and catch up on missed events, so that I don't have to refresh the page after a network hiccup. | P1 |

## 4. Requirements

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| R-01 | PRD-001 R-04, R-07, R-08 | The system shall publish a real-time event (per ADR-012) for every job state transition, content edit (per PRD-011), enrollment change, lock, completion, payment-sent, confirmed-received, dispute, and cancel. The event payload shall include: `event_id` (monotonic per chapter), `chapter_id`, `job_id`, `event_kind` (string enum), `actor_id`, `occurred_at` (ISO timestamp). | P0 | US-01..US-04 | The event is metadata-only; clients re-query tRPC for details (preserves role projection + privacy invariant — ADR-012 C-07). |
| R-02 | PRD-001 R-04, R-07, R-08 | The system shall provide an SSE endpoint at `/api/events/chapter` that authenticated chapter members can subscribe to. Anonymous or wrong-chapter requests shall return 401 or 403 before any stream is opened. | P0 | US-01..US-04 | Auth via existing Better Auth session cookie (no `Authorization` header — ADR-012 C-06). Chapter membership is single-chapter for MVP; multi-tenant routing deferred. |
| R-03 | PRD-001 R-04, R-07, R-08 | The system shall emit a `: keepalive\n\n` SSE comment line every 30 seconds on every open stream to prevent intermediate proxies from closing the connection. | P0 | US-05 | Per ADR-012 C-09. |
| R-04 | PRD-001 R-04, R-07, R-08 | When the SSE client reconnects, the client shall provide the last received `event_id` via the SSE-standard `Last-Event-ID` header; the system shall replay all events with `event_id > Last-Event-ID` that are still within the in-memory retention window (default: 5 minutes / 1000 events per chapter, whichever is smaller). | P0 | US-05 | Per ADR-012 C-04. Retention window is deliberately small — clients that disconnect > 5 min can re-fetch via tRPC on reconnect. |
| R-05 | PRD-001 R-04, R-07, R-08 | On receipt of any real-time event, the affected client view shall: (a) invalidate the relevant React Query cache via `utils.X.invalidate()`, AND (b) call `router.refresh()` to re-render server components. | P0 | US-01..US-04 | Mirrors the MVP-FIX-A pattern for cross-actor case. The client SSE consumer is a tiny module that maps `event_kind` → invalidation keys + page route filter. |
| R-06 | PRD-001 R-04, R-07, R-08 | The real-time update path shall be a graceful-upgrade — if the SSE connection cannot be established (proxy / browser / network constraint), the rest of the app continues to function exactly as it does today (initial server render + own-mutation `router.refresh()` + manual refresh as the floor). | P0 | US-01..US-05 | Per ADR-012's "failure mode is graceful." No throw, no error banner; silent degradation. |
| R-07 | PRD-001 R-04, R-07, R-08 | The system shall NOT include any user-identifying or job-content payload in the SSE event itself beyond IDs and the `event_kind`. Specifically: NO job description, NO contact info, NO dues amount, NO Active names. Clients fetch this via tRPC, which applies role projection and authentication. | P0 | US-01..US-04 | Per ADR-012 C-07. Privacy invariant. |
| R-08 | PRD-001 R-04 | The Moderator queue page (`/moderation-queue`) shall display newly-published `awaiting_moderation` events as a soft-prepended row (without losing the moderator's scroll position) and a small "1 new" indicator. | P1 | US-03 | UX detail: don't yank the moderator's focus; visually signal that new work appeared. |
| R-09 | PRD-001 R-04 | The system shall support up to 250 concurrent SSE connections per pod for the MVP without performance regression (response p95 < 200ms on non-stream tRPC calls). | P1 | — | Capacity floor. At launch chapter scale (~50 active users × ~4 tabs = ~200 streams) we're under the floor with headroom. ADR-012 C-01 acknowledges revisit at 1000+. |

### 4.1 Acceptance criteria

- **AC-01** — covers R-01, R-02, R-05, R-06 (the headline cross-session case)
  - **Given** two browser sessions: session A signed in as Alumni, session B signed in as Active, both with `/jobs` open
  - **When** session A posts a new job → session A's moderator approves it
  - **Then** session B's `/jobs` list shows the new `enrollment_open` job within 2 seconds, without any manual refresh.
- **AC-02** — covers R-01, R-05 (detail-view cross-session)
  - **Given** two browser sessions: session A (Alumni poster), session B (Active) both viewing `/jobs/<jobId>` for the same job in `enrollment_open`
  - **When** session A edits the job's `description` (per PRD-011)
  - **Then** session B's detail view shows the new description within 2 seconds, without any manual refresh.
- **AC-03** — covers R-04 (reconnect + replay)
  - **Given** a browser session has an open SSE stream and the last received `event_id = N`
  - **When** the session's network connection is interrupted for 30 seconds, then restored
  - **Then** the client reconnects with `Last-Event-ID: N`; the server replays any events with `event_id > N` that are still in the retention window; the client's React Query cache + router are refreshed accordingly.
- **AC-04** — covers R-06 (graceful degradation)
  - **Given** a network configuration that blocks SSE (e.g., a corporate proxy that buffers the stream indefinitely)
  - **When** a user opens the app
  - **Then** the app loads, renders, and functions exactly as it does without SSE; no error banner, no broken UX. Only the cross-session-real-time feature is silently absent.
- **AC-05** — covers R-07 (privacy)
  - **Given** an SSE stream open for chapter X
  - **When** any mutation occurs on a job
  - **Then** the SSE event payload contains only `{ event_id, chapter_id, job_id, event_kind, actor_id, occurred_at }`. NO `description`, NO contact info, NO `dues_cents`, NO Active names. Verified by reading the raw event stream via curl + a logged-in cookie.
- **AC-06** — covers R-02 (auth gate)
  - **Given** a request to `/api/events/chapter` without a valid session cookie
  - **When** the server handles the request
  - **Then** the response is HTTP 401 (or 403 if the user is signed in but not a member of the chapter); no stream is opened.
- **AC-07** — covers R-08 (moderator UX detail)
  - **Given** a Moderator with `/moderation-queue` open, scrolled to the middle of the list
  - **When** a new `awaiting_moderation` event arrives
  - **Then** the moderator's scroll position is NOT changed; a "1 new" badge (or similar — exact UX in DESIGN-007 if authored) appears; clicking the badge scrolls to the new entry.

## 5. User experience

- No new UI surface unless R-08 (moderator new-arrivals badge). Real-time updates manifest as existing UI components silently refreshing.
- Loading / error states: the SSE connection establishment is invisible (no spinner, no banner). If it fails to connect, no UX change — the app behaves as it did before this PRD.
- **Cross-session invariant:** every page that reads via `caller.X.Y(...)` from a server component MUST be on a route mapped in the SSE client's event-kind → page-route filter. Otherwise the SSE event arrives but no `router.refresh()` is called, defeating the purpose.

## 6. Scope boundaries

### 6.1 Non-goals

- **Multi-chapter / cross-chapter events.** Each user belongs to one chapter; the SSE channel is chapter-scoped. Multi-chapter (e.g., a future portal where one user views jobs across multiple chapters) is out of scope.
- **Typing indicators, presence, "X is viewing this job now"** — bidirectional/presence features. Not in MVP; would require a different transport (would supersede ADR-012).
- **Persistent event log queryable by users.** The 5-min in-memory replay window is for SSE reconnect, not a user-facing history. The audit log (PRD-007, ADR-009) is the durable history.
- **Mobile push notifications.** Out of scope for PRD-012; would require a separate channel (FCM/APNs) and a per-user notification preference layer.
- **Granular subscription** (e.g., "only notify me about jobs I've enrolled in"). MVP delivers all chapter events to all chapter members; client-side filtering decides relevance. Granular subscriptions can be added without changing the wire format.
- **Polling fallback.** If SSE fails for a given browser, the app degrades to the existing behavior (R-06). We do NOT bolt on a polling-fallback layer that effectively turns SSE into 2-second polling — that would defeat ADR-012's traffic-cost argument.

### 6.2 DO NOT CHANGE

| Concern | Owned by | Reason it's locked |
|---------|----------|---------------------|
| Authentication (Better Auth session cookie) | ADR-002, ADR-011 | SSE uses the existing cookie; no new auth flow. |
| Job FSM state graph | ADR-008 | PRD-012 emits events; does NOT define new states. |
| Audit log row shape | ADR-009 | Audit and SSE are separate concerns; SSE event ≠ audit row. |
| Role projection on tRPC outputs | PRD-002 + PRD-007 + each command's PRD | SSE events carry only IDs; the actual content is re-fetched via tRPC, which applies role projection. |
| tRPC query / mutation procedure surface | ADR-003 | PRD-012 is additive (one new route); tRPC procedures unchanged. |
| MVP-FIX-A own-actor `router.refresh()` pattern | MVP-FIX-A | This PRD relies on it (R-05) and reuses the pattern for cross-actor. |

## 7. Assumptions & dependencies

- **Assumption:** ADR-012's SSE choice is sound. *If false:* re-decide via a successor ADR; PRD-012 references the new ADR.
- **Assumption:** Single-replica deploy at launch; multi-pod broadcast (Postgres LISTEN/NOTIFY adapter) deferred. *If false:* PLAN-018 includes the adapter as an in-scope sub-task.
- **Assumption:** Traefik (current ingress) does not buffer SSE streams. *If false:* PLAN-018 §4 includes a Traefik ingress annotation; PLAN-018 validation includes a live-instance SSE keepalive check.
- **Assumption:** The 5-min / 1000-event retention window is enough to cover typical brief network blips. *If false:* widen the window; if the cost becomes meaningful, persist event IDs to a small ring-buffer table in Postgres.
- **Depends on:** ADR-012, PRD-010 + PRD-011 (the mutations whose events get pushed); PLAN-018 (the implementation plan).

## 8. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | Should the SSE event payload include the job's new state, or only the `event_kind` + IDs? Lean: **`event_kind` + IDs only** (privacy + simplicity). Clients re-fetch state via tRPC. | Tom | 2026-05-22 |
| Q-02 | Should we ship multi-pod LISTEN/NOTIFY broadcast in PRD-012 P0, or defer to a follow-up? Lean: **defer** — launch chapter is single-pod; add when we go multi-replica. | Tom | 2026-05-22 |
| Q-03 | Should the moderator new-arrivals badge (R-08) be P0 or P1? Lean: **P1** — useful but not blocking. | Tom | 2026-05-22 |
| Q-04 | Browser memory leak risk: `EventSource` instances must be properly cleaned up on page nav. Lean: **mount the EventSource in a React effect with cleanup; one EventSource per app shell, not per page**. | Tom | 2026-05-25 |
| Q-05 | What's the Playwright test pattern for two-browser-context real-time? Lean: **use `browser.newContext()` twice** to get two independent sessions; assert via `expect.poll(...)` for the cross-session UI change. | Tom (validated in PLAN-018) | 2026-05-25 |

## 9. Release plan

- **Walking skeleton:** R-01, R-02, R-05, R-06 (the basic SSE pipe + client integration + graceful degradation). One Playwright multi-context test (AC-01).
- **MVP:** R-03, R-04, R-07 (keepalive, reconnect+replay, privacy invariant).
- **Post-MVP:** R-08 (moderator new-arrivals badge), R-09 (capacity validation; only required once we scale beyond launch chapter).
- **Rollout:** ship as part of v0.9.x or v0.10.x (after PRD-010 + PRD-011). Single-pod assumption holds; multi-pod broadcast adapter deferred.
- **Reversibility:** disable the SSE route at the Next.js layer (return 404); clients see R-06's graceful degradation and proceed without real-time. No data migration; no rollback risk.

## 10. Glossary changes

- **`SSE event`** — chapter-scoped real-time push payload `{ event_id, chapter_id, job_id, event_kind, actor_id, occurred_at }`. Distinct from `audit_log_row` (durable, queryable, contains denormalized state). T-NN to be assigned.
- **`chapter event bus`** — server-side in-process pub/sub that mutation procedures publish to and SSE handlers subscribe to; for multi-pod, backed by Postgres LISTEN/NOTIFY. T-NN to be assigned.

## 11. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-20 | Tom Haynes | Initial Draft. Created post-click-through to capture user-reported gap #5 (no real-time updates across browsers). |
