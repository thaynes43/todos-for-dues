# Prompt for Claude Code agent — Execute PLAN-018 (real-time UI via SSE)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent — load `.agents/profiles/developer.md` first.** Read this prompt, then begin.

> **Sequencing:** This prompt assumes prompts **038 (PLAN-016)** and **040 (PLAN-017)** have been merged to `main`. PRD-012 broadcasts events for every mutation, including `jobs.edit` (added by PLAN-017). If either prior PR is missing, STOP and tell the user.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright). v0.9.x deployed (PRD-010 + PRD-011 shipped). This PR adds the headline real-time feature: when user A mutates a job, user B's open browser tab reflects the change within 2s — no manual refresh.

**Transport:** Server-Sent Events (SSE) per ADR-012. NOT WebSocket. NOT polling. See ADR-012 for the rationale + the C-01..C-10 consequences this implementation must honor.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Implement PLAN-018 (`docs/plans/018-real-time-ui-updates-implementation.md`) end-to-end against PRD-012 (`docs/prds/012-real-time-ui-updates.md`) and ADR-012 (`docs/adrs/012-real-time-transport.md`).

Five tracks: (A) in-memory chapter event bus, (B) SSE route handler at `/api/events/chapter`, (C) every mutation publishes an event after txn commit, (D) client `EventSource` consumer mounted at AppShell, (E) Playwright multi-context spec proving the cross-session case.

One PR. `feat:` prefix → minor bump → v0.10.0.

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — §1–§7.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md`.
4. `apps/web/AGENTS.md`.
5. **`docs/prds/012-real-time-ui-updates.md`** — the PRD.
6. **`docs/adrs/012-real-time-transport.md`** — the transport ADR. **Every C-N is a constraint.**
7. **`docs/plans/018-real-time-ui-updates-implementation.md`** — the plan.
8. **`docs/plans/018-real-time-ui-updates-validation.md`** — VALIDATION-018 gate list.
9. `apps/web/app/api/health/route.ts` — the existing Next.js route handler pattern. Mirror for `/api/events/chapter`.
10. `packages/api/src/routers/jobs.ts` — every mutation needs a `chapterBus.publish(...)` call after txn commit.
11. `apps/web/components/RoleChangeDropdown.tsx` — the MVP-FIX-A pattern. The SSE consumer mirrors this for cross-actor case.
12. **For SSE format reference:** read MDN's EventSource page (already in `node_modules/...` if cached locally, otherwise re-read once). The wire format is simple: `id: <event_id>\nevent: <kind>\ndata: <json>\n\n`.

## What you do NOT do

- **Do not push directly to `main`** — branch protection.
- **Do not pick a different transport.** ADR-012 is binding; if you have reason to think SSE is wrong for some edge case, surface and escalate — don't ship WebSocket.
- **Do not include PII in SSE event payloads.** Per PRD-012 R-07 / ADR-012 C-07: only `event_id`, `chapter_id`, `job_id`, `event_kind`, `actor_id`, `occurred_at`. NO `description`, NO contact, NO dues amount, NO Active names.
- **Do not publish inside the DB transaction.** Per Q-PLN-04 lean: publish AFTER `await db.transaction(...)` returns successfully. If the txn rolls back, no event is broadcast.
- **Do not call `chapterBus.publish` from anywhere other than the mutation procedures.** Don't sprinkle it through UI / `apps/web/`.
- **Do not implement the Postgres LISTEN/NOTIFY adapter for multi-pod.** Per PRD-012 Q-02 lean: deferred. In-memory bus suffices for single-pod.
- **Do not mount the EventSource per-page.** One instance per session, at the AppShell layer. Per-page mount causes memory leaks under rapid nav.
- **Do not relax MVP-FIX-A.** Own-actor mutations still need `router.refresh()` — the SSE consumer is ADDITIVE; cross-actor events trigger ALSO via the same mechanism.
- **Do not relax iteration-2 hardening** in e2e.
- **Do not bypass branch protection.**

## Specific traps to watch for

**Trap 1 — Publish AFTER txn commit (not inside).**

Pattern:
```ts
const result = await db.transaction(async (tx) => {
  // all the writes
  return job;
});
// txn committed by here
await chapterBus.publish(chapterId, { event_id, chapter_id, job_id, event_kind, actor_id, occurred_at });
```

If the txn fails, the publish never happens — correct. If the publish fails after commit, the DB is consistent but a client misses one event — they recover via reconnect + Last-Event-ID + the 5-min retention buffer + their existing pull-on-page-load floor.

**Trap 2 — Auth gate on the SSE route MUST verify chapter membership.**

`/api/events/chapter` opens a long-lived stream. Auth via Better Auth session cookie. The handler must:
1. Read the session.
2. If anonymous → return 401 before opening any stream.
3. If signed in but the user's `chapterId` doesn't match the chapter context → return 403.
4. Only then open the stream.

NEVER open the stream and THEN check auth — that leaks event metadata.

**Trap 3 — Privacy invariant R-07 is critical.**

The `ChapterEvent` type defines the payload. Any new field must pass the question "is this PII or content?" — if either, exclude. Test this with a Playwright assertion that reads the raw SSE stream and greps for PII tokens.

**Trap 4 — `EventSource` mount once, at AppShell layer.**

Mount in a small client-component wrapper around the app shell (e.g., `<RealtimeProvider>` in `apps/web/components/AppShell.tsx` or its parent). Effect cleanup on unmount closes the EventSource. ONE EventSource per session — verify in DevTools Network panel: only one stream connection.

**Trap 5 — `router.refresh()` storm — debounce.**

Per PLAN-018 Q-PLN-02 lean: 250ms debounce. The SSE consumer batches events arriving within 250ms; one refresh per route per debounce window. Without debounce, a moderator approving 5 jobs in a row could trigger 5 full server-component re-renders in the Active's tab — wasted work.

**Trap 6 — Two-context Playwright test pattern.**

```ts
test('cross-session real-time', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  // sign in as A in ctxA; B in ctxB
  // open /jobs in both
  // mutate from pageA
  // assert on pageB without page.reload()
  await expect(pageB.getByTestId('job-list-row[data-job-id="..."]')).toBeVisible({ timeout: 2_000 });
  await ctxA.close();
  await ctxB.close();
});
```

`expect.poll(...)` is the alternative — useful if the visibility assertion's default timeout is too generous.

**Trap 7 — Heartbeat MUST send every 30s.**

Without heartbeat, proxies (Traefik, browser idle detection) may close the stream. Use a `setInterval` inside the stream, careful to clean it up when the abort signal fires.

**Trap 8 — `Last-Event-ID` reconnect path.**

`EventSource` auto-reconnects with the `Last-Event-ID` header. Your route handler reads `request.headers.get('Last-Event-ID')` and passes to `bus.subscribe(chapterId, callback, lastEventId)`. The bus replays buffered events.

If the lastEventId is older than the retention window → publish a "gap" event OR just send no replay (client's existing pull-on-page-load floor catches up). Lean: no special handling — the bus returns events newer than retention threshold, period; the client handles re-querying as a normal page navigation.

**Trap 9 — Cross-plan invariants — especially `no-direct-state-writes`.**

Your changes to mutation procedures add a `chapterBus.publish(...)` line AFTER the txn. They must NOT change the DB write path. If you accidentally bypass `transitionJob` for any state change in your refactor, the static-analysis test fails.

**Trap 10 — Live SSE keepalive verification.**

Per PLAN-018 §5 — after merge + deploy, validate with:
```sh
curl -N -H "Cookie: better-auth.session_token=..." https://todos-for-dues.haynesops.com/api/events/chapter
```
Confirm:
- HTTP 200.
- `Content-Type: text/event-stream`.
- A `: keepalive` line every ~30s.
- Events arrive when mutations happen.

This is post-deploy work; surface in the report so coordinator runs it.

**Trap 11 — PR title.**

Recommended: `feat(web): real-time UI updates via SSE (PRD-012 / ADR-012 / PLAN-018)`. `feat:` → minor bump → v0.10.0.

## PR-flow specifics

1. `git checkout main && git pull --ff-only origin main`. **Verify PLAN-016 + PLAN-017 commits present.**
2. `git checkout -b plan-018-real-time-sse`.
3. Event bus + types + bus tests.
4. SSE route handler + auth tests.
5. Mutation procedures publish (after txn commit).
6. **Write Playwright multi-context spec FIRST; run; confirm failure (no events delivered yet, no client consumer mounted).**
7. Client SSE consumer + AppShell mount.
8. Re-run multi-context spec; passes (within 2s).
9. Privacy + auth + degradation tests pass.
10. Cross-plan invariants → 3× full e2e under DEFAULT workers.
11. Commit + push + open PR.
12. **Gate 1 — STOP.**

**Do not merge yourself.**

## Definition of done

- [ ] `packages/api/src/events/chapter-bus.ts` exists; per-chapter in-memory ring buffer; 1000-event / 5-min retention; monotonic event IDs.
- [ ] `apps/web/app/api/events/chapter/route.ts` exists; auth gate (401/403); SSE format; 30s heartbeat; `Last-Event-ID` replay.
- [ ] Every mutation in `packages/api/src/routers/jobs.ts` publishes its event AFTER txn commit.
- [ ] `apps/web/lib/sse-client.ts` + AppShell mount; `EventSource` opens once per session; events drive `invalidate()` + `router.refresh()`.
- [ ] Debounce (~250ms) on `router.refresh()`.
- [ ] Playwright spec `real-time-cross-session.spec.ts` covers AC-01..AC-07 (or as many as feasible; AC-07 P1 may defer).
- [ ] Privacy test (AC-05) — raw stream payload contains only IDs.
- [ ] Graceful degradation test (AC-04) — app works when EventSource is blocked.
- [ ] `pnpm --filter web e2e` 3× consecutively under DEFAULT workers — all green (including the multi-context spec).
- [ ] Cross-plan invariants all green, including `no-direct-state-writes`.
- [ ] MVP-FIX-A own-actor pattern intact (spot-check 2 mutation buttons still call `router.refresh()`).
- [ ] PR open against `main` with `feat(web):` title; CI green.

## What to report back (under 400 words)

- PR URL + commit hash.
- TDD failing-test output (the multi-context spec, before the client consumer was mounted).
- The `ChapterEvent` type's exact shape (one snippet).
- The publish-after-txn pattern in one mutation (one snippet).
- The AppShell mount snippet (one paragraph: where, what hook, cleanup).
- Confirmation `pnpm --filter web e2e` 3× under DEFAULT workers all green — **state explicitly**.
- Confirmation each cross-plan invariant green.
- Confirmation privacy test passes (raw stream payload audit).
- **Live-instance keepalive check command** the coordinator should run post-deploy (Trap 10).
- Any surprise about Next.js 16's SSE handling (the API surface is new for many readers; document the route-handler shape).

## If you get stuck

Escalate with: (1) which trap / track, (2) exact error, (3) what you tried, (4) your lean.

Particular candidates:
- **Next.js 16 streams API surface is different from training-data assumptions.** Read `node_modules/next/dist/docs/` per AGENTS.md; the App Router supports `Response` with `ReadableStream` body for streaming. Surface if there's a subtlety.
- **`EventSource` mount causes hydration mismatch** — wrap in `useEffect` (effects don't run server-side; the EventSource only opens after hydration).
- **The multi-context spec is flaky** — the 2s window is tight; if it's racing, surface. Lean: bump to 3s in CI ONLY if absolutely necessary; root-cause the timing.
- **`no-direct-state-writes` breaks because your refactor of a mutation introduced a stray UPDATE** — surface; fix at the offending procedure; don't touch the static-analysis test.

Begin.
