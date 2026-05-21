---
id: VALIDATION-018
title: Real-time UI updates — validation
status: Proposed
author: Coordinator
created: 2026-05-20
last_updated: 2026-05-20
related:
  prds: [PRD-012]
  adrs: [ADR-012]
  plans:
    paired_implementation: 018-real-time-ui-updates-implementation
---

## 1. Goal

Verify PLAN-018 satisfies every PRD-012 AC, honors every ADR-012 consequence (C-01..C-10), and preserves cross-plan invariants. Particular emphasis on the cross-session stale-page concern (the headline use case).

## 2. AC → Test mapping

| AC | Where the test lives | What it asserts |
|----|---------------------|-----------------|
| AC-01 | `apps/web/e2e/mvp/real-time-cross-session.spec.ts` | Two browser contexts; sessionA posts + approves; sessionB sees new job in `/jobs` within 2s — **no manual refresh**. |
| AC-02 | same | Two browser contexts viewing same job detail; sessionA edits; sessionB sees update within 2s. |
| AC-03 | same | Simulate network blip (close + reopen SSE); verify `Last-Event-ID` header sent on reconnect; verify replay. |
| AC-04 | same | Mock `EventSource` to throw; app loads + functions; no error banner. |
| AC-05 | `apps/web/__tests__/api/events-privacy.test.ts` + Playwright assertion | `curl` raw SSE stream with auth cookie; payload contains only IDs; no `description`, no contact, no PII. |
| AC-06 | `apps/web/__tests__/api/events-auth.test.ts` | Request without cookie → 401; request with cookie but wrong chapter → 403. |
| AC-07 | `apps/web/e2e/mvp/real-time-cross-session.spec.ts` (or moderation-queue variant) | Moderator scrolled mid-list; new posting arrives; scroll position unchanged; "1 new" badge appears. (P1 — defer if AC-01..AC-06 are tight.) |

## 3. ADR-012 consequences — verification

| C-N | Verification |
|-----|--------------|
| C-01 (capacity 250 connections / pod) | Load test: 100 concurrent SSE connections from a single client (using `k6` or a Node script). Confirm response p95 < 200ms on tRPC calls during the load. Skip for MVP if launch chapter doesn't approach this scale. |
| C-02 (no DATABASE_URL at module-load) | `unset DATABASE_URL && pnpm --filter web build` exits 0. |
| C-03 (LISTEN/NOTIFY payload 8KB cap) | N/A for single-pod MVP; deferred along with the adapter. |
| C-04 (EventSource + Last-Event-ID) | AC-03 covers. |
| C-05 (chapter-scoped channel) | Code review: `subscribe(chapterId, ...)` keys on chapter_id; no global subscription path. |
| C-06 (auth via session cookie) | AC-06 covers. |
| C-07 (privacy — IDs only) | AC-05 covers. |
| C-08 (proxy buffering) | Live-instance check post-deploy: `curl` against `https://todos-for-dues.haynesops.com/api/events/chapter` with cookie; observe keepalive line every 30s. |
| C-09 (30s keepalive) | Code review + manual verify via `curl` (local + live). |
| C-10 (evolution to WS if bidirectional needed) | N/A — out of scope. |

## 4. Cross-plan invariants

- `pnpm -r typecheck` exits 0.
- `pnpm -r test` exits 0; Vitest counts ≥ baseline.
- `pnpm --filter @app/domain test no-direct-state-writes` exits 0.
- `unset DATABASE_URL && pnpm --filter web build` exits 0.
- `pnpm --filter web e2e` exits 0 across **3 consecutive runs** under DEFAULT workers (the multi-context spec must pass 3×).
- MVP-FIX-A invariant intact — own-actor `router.refresh()` continues to work; the new SSE consumer additively triggers refreshes from cross-session events.

## 5. Stale-page-regression check (extra emphasis per user direction)

The Playwright multi-context spec is the primary defense against "user B doesn't see user A's change." Validation explicitly requires:

1. **Two contexts** (`browser.newContext()` twice — independent cookies).
2. **Assertion via `expect.poll(...)`** waiting up to 2s for cross-session update — NOT a `page.reload()`.
3. **At least 4 scenarios:** post → approve → enroll → edit (per AC-01 + AC-02 family).
4. **Test passes 3 consecutive runs** under DEFAULT workers — single-shot success is insufficient given the timing-sensitive nature.

If the test passes only sporadically (e.g., 2/3), validation fails. Real-time is the kind of feature where intermittent test success masks intermittent prod failure.

## 6. Manual checks (live instance, post-deploy)

- Open `https://todos-for-dues.haynesops.com/jobs` in two different browsers (e.g., Chrome + Firefox) signed in as different users.
- In browser 1, post a job. In browser 2, observe within 2s the new job appearing in the list.
- Run `curl -N -H "Cookie: ..." https://todos-for-dues.haynesops.com/api/events/chapter` from a third terminal — observe the SSE stream + a keepalive every 30s.

## 7. Gates

| Gate | Criterion |
|------|-----------|
| G-1 | Required CI green. |
| G-2 | Advisory `playwright` green. |
| G-3 | 3× consecutive full e2e under DEFAULT workers — multi-context spec included. |
| G-4 | Every PRD-012 AC has a test mapping. |
| G-5 | Every ADR-012 C-N has a verification path (§3). |
| G-6 | Cross-plan invariants green. |
| G-7 | MVP-FIX-A own-actor pattern intact (verify by spot-checking 2-3 existing mutation buttons still have `router.refresh()`). |
| G-8 | Privacy test (AC-05) shows ZERO PII in raw event stream payload. |
| G-9 | Graceful degradation test (AC-04) shows app loads + functions when SSE is blocked. |

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-20 | Coordinator | Initial Proposed. |
