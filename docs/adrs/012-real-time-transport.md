---
id: ADR-012
title: Use Server-Sent Events (SSE) for chapter-scoped real-time UI updates
status: Draft
date: 2026-05-20
deciders: [Tom Haynes]
consulted: []
informed: []
related:
  prds: [PRD-012]
  adrs: [ADR-001, ADR-003, ADR-006]
  flows: []
  designs: []
  supersedes: null
  superseded_by: null
---

## Context and problem statement

PRD-012 requires that job-list and job-detail views update in real time across browser sessions: when an Alumni posts, edits, cancels, locks, completes, or otherwise mutates a job, every other actor's open browser tab should reflect the change within ~2s — without a manual refresh and without the per-page polling tax. The MVP click-through hit this twice (the stale-UI-after-mutation bug closed by MVP-FIX-A was the actor's own session; PRD-012 is the harder cross-session case).

We need to pick a server→client push transport. The options are well-understood; the choice has consequences for the deploy story (does it work behind our K8s ingress?), the operational story (sticky sessions? per-pod broadcast?), and the client implementation surface (does it slot cleanly into the existing tRPC stack?).

## Decision drivers

- **Compatible with current deploy** (Flux + K8s + Traefik ingress + multi-replica eventual; today single-replica). No sticky-session requirement is a strong preference.
- **Compatible with current stack** (Next.js 16 App Router; tRPC for the existing query/mutation surface). The transport should slot in without restructuring the API surface.
- **One-way is sufficient.** Real-time in this app is server→client; the client uses ordinary tRPC mutations for writes. No need for bidirectional channels.
- **Connection limits.** Most browsers cap concurrent connections per origin at ~6 over HTTP/1.1; HTTP/2 lifts this dramatically. Our setup runs on HTTP/2 (Traefik + cert-manager); connection budget is not a near-term concern.
- **Observability + debugging.** Plain-text streams are easier to tcpdump / curl than binary frames; that's a real day-1 ops benefit.
- **Latency target.** PRD-012 specifies P95 < 2s. All three options can meet this; the differences are in implementation cost.

## Considered options

### Option A — Server-Sent Events (SSE)

- One-way HTTP stream (`Content-Type: text/event-stream`); browser's `EventSource` API handles connection, parsing, reconnection, and Last-Event-ID replay.
- Next.js 16 App Router supports SSE natively via streaming `Response` from route handlers (e.g., `app/api/jobs/stream/route.ts` returning `ReadableStream<Uint8Array>`).
- Server side: each connected client gets a long-lived response. The server holds a per-chapter in-memory event bus (or, for multi-pod, a Postgres LISTEN/NOTIFY adapter — see "Multi-pod broadcast" below); mutation procedures publish to it; the SSE handler subscribes per request.
- No sticky session: any pod can accept any client; broadcast across pods via Postgres LISTEN/NOTIFY (already-installed; no new infra).
- tRPC integration: tRPC has subscription support, but its over-HTTP-streaming wire format is essentially SSE. We can use raw SSE for this transport (a thin Next.js route) rather than wiring tRPC subscriptions — fewer abstractions for a one-way channel.

### Option B — WebSocket

- Bidirectional persistent TCP framing over HTTP upgrade.
- Next.js 16 App Router does NOT natively support WebSocket route handlers — you bolt it on via a custom server (defeats the App Router model) or run a separate WS server (extra ingress concern, extra deploy artifact).
- Sticky-session affinity often required (since per-connection state lives in the pod). Traefik can do session affinity but it adds operational complexity; once we're multi-pod, this becomes a real concern.
- Bidirectional capability is unused — we'd be paying complexity for capacity we don't need.
- tRPC v11 subscriptions over WS are supported, but the server-side adapter requires a custom HTTP server.

### Option C — Short polling

- Client `setInterval` calls `trpc.jobs.listX.useQuery()` every N seconds.
- Trivial to implement; zero new infrastructure.
- Constant traffic regardless of mutation rate; scales linearly with users × open tabs. At 50 active users × 4 open tabs × 1 poll/3s = ~67 req/s — fine for one chapter, but the noise floor on dashboards/logs is real.
- Latency: P95 ≈ N seconds. To hit <2s reliably we'd poll every 2s, doubling the noise floor.
- No "push" semantics: every poll is wasted work when nothing changed.

## Decision outcome

**Chosen option: A (Server-Sent Events).**

### Why

- **Operationally simplest of the three real-time options.** No sticky sessions, no separate server, no custom HTTP server. The Next.js App Router supports it natively.
- **Matches the use case exactly.** Server→client one-way; no bidirectional need.
- **Lowest unused-capacity tax.** WebSocket buys bidirectional we won't use; polling buys "no setup" at the cost of constant traffic.
- **Plays nicely with the existing tRPC stack.** SSE is a separate transport (a thin Next.js route handler); tRPC remains the read/write API. No need to migrate the existing 100+ procedures to subscriptions.
- **Multi-pod broadcast story** (when we go multi-replica): each pod's SSE handler `LISTEN`s on a Postgres channel; mutation procedures `NOTIFY` that channel. Postgres already in-stack (ADR-004); no new infra.
- **Failure mode is graceful.** If SSE breaks for any reason (proxy buffering, browser hibernation), the existing pull-on-page-load + `router.refresh()` after own-mutation behavior remains the floor. Real-time is an upgrade, not a dependency.

### Consequences

| ID | Consequence | Kind |
|----|-------------|------|
| C-01 | Each connected client holds one long-lived HTTP/2 stream per origin. At single-replica + 50 active users × 4 tabs = ~200 open streams. Memory cost per stream is small (a Node response object + a subscriber callback). Acceptable at this scale; revisit at 1000+. | Operational |
| C-02 | The SSE route handler must NEVER read from `DATABASE_URL` at module-load time (the build-time guard from ADR-004's lazy Proxy). All DB access happens per-event inside the stream. | Constraint |
| C-03 | Broadcast across pods uses Postgres `LISTEN/NOTIFY`. The notify payload is bounded to 8KB by Postgres; events that exceed this must include only an ID + version, with the client re-querying for details. | Constraint |
| C-04 | Client uses `EventSource` (built-in). No new npm dependency. Reconnect / Last-Event-ID replay is browser-native; the server's event IDs must be monotonic per chapter. | Architectural |
| C-05 | The SSE channel is **chapter-scoped**, not user-scoped. All users in a chapter see the same event stream; client-side filtering decides which events affect which views. This trades a small client-side filter step for a massively simpler server-side subscription model. | Architectural |
| C-06 | Authentication: the SSE route handler MUST authenticate via the existing Better Auth session cookie + verify chapter membership before opening the stream. Anonymous or wrong-chapter requests return 401/403 before any stream is opened. | Security |
| C-07 | Privacy invariant: the event payload contains only IDs and shallow metadata (job ID, new state, event kind, timestamp). NO PII (no description text, no contact info, no email). Clients re-query tRPC for details, picking up role-projection automatically. | Security |
| C-08 | Reverse-proxy buffering must be disabled on the SSE route (e.g., `X-Accel-Buffering: no` header for nginx, Traefik's default behavior is fine). Validate during PLAN-018 against the live Traefik ingress. | Operational |
| C-09 | Connection-keepalive heartbeat: server emits an SSE `: keepalive\n\n` comment line every 30s to prevent intermediate proxies from closing idle connections. | Operational |
| C-10 | If the SSE transport ever needs to become bidirectional (e.g., for typing indicators or presence), this ADR is superseded by a new ADR proposing WebSocket. Not anticipated for the launch chapter. | Evolution |

### Pros vs. WebSocket

- Native Next.js 16 App Router support; no custom server.
- No sticky-session requirement.
- Easier observability (curl-able, tcpdump-readable).

### Pros vs. polling

- Latency: ~100ms vs. ~2s.
- Traffic: ~0 when idle vs. constant.
- Push semantics: server controls when clients refetch; matches the data model.

### Cons (acknowledged)

- One additional Next.js route handler to maintain.
- LISTEN/NOTIFY adds complexity at multi-pod (currently single-pod; deferred).
- Browser `EventSource` API does not allow custom headers — we authenticate via cookie (which is sent automatically) rather than `Authorization` header. Cookie is what we use today for tRPC, so no change.

## Validation

PRD-012 §6 acceptance criteria. PLAN-018 §3 covers: route handler implementation, in-memory bus for single-replica MVP, Playwright multi-context test (two browser sessions, mutation in one → other sees update within 2s P95), LISTEN/NOTIFY adapter as a deferred follow-up for multi-pod.

## Links

- PRD-012 — Real-time UI updates.
- PLAN-018 — Implementation of PRD-012.
- ADR-001 — Web framework choice (Next.js).
- ADR-003 — API contract (tRPC).
- ADR-004 — DB + ORM (Postgres + Drizzle; LISTEN/NOTIFY available out of the box).

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-20 | Tom Haynes | Initial Draft. Created in support of PRD-012; recommends SSE with operational consequences. |
