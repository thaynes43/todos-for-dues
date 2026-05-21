# Prompt for Claude Code agent — Validate PLAN-018 (real-time UI via SSE)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a validator agent — independent review.** Read this prompt, then begin.

## Your task

Verify the PR opened by prompt 042 (PLAN-018 execute) satisfies VALIDATION-018 (`docs/plans/018-real-time-ui-updates-validation.md`).

**Particular emphasis** (per user direction):
- The cross-session stale-page guard — the entire point of this PR. Multi-context Playwright spec MUST be present, MUST cover at least 4 scenarios (per PRD-012 AC-01 + AC-02 + AC-03 + AC-04), MUST pass 3× consecutively.
- The privacy invariant (PRD-012 R-07 / ADR-012 C-07) — NO PII in the SSE event payload. Verified by reading the raw stream.
- The MVP-FIX-A own-actor pattern must STILL be intact (additive change; cross-actor adds, own-actor unchanged).
- Cross-plan invariants — especially `no-direct-state-writes` (the mutation refactor must not break the FSM authority).

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** §1–§7.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`.
3. **`docs/prds/012-real-time-ui-updates.md`** — ACs.
4. **`docs/adrs/012-real-time-transport.md`** — consequences C-01..C-10.
5. **`docs/plans/018-real-time-ui-updates-validation.md`** — gate checklist + AC-to-test mapping.
6. **The PR** — `gh pr view <PR#>` + the diff.
7. **The new multi-context spec** — read line-by-line. Verify it uses `browser.newContext()` twice (not one shared context).
8. **`.zprompt.md`** — execute agent's report (skim).

## What you do NOT do

- **Do not write production code or modify the PR.**
- **Do not merge.**
- **Do not relax any gate.** Multi-context spec not 3/3 → FAIL. Privacy test not present → FAIL. `no-direct-state-writes` red → FAIL.

## Validation checklist (run in order)

1. **Diff inspection** — `gh pr diff <PR#> --name-only`. Expected:
   - `packages/api/src/events/chapter-bus.ts` (new)
   - `packages/api/src/events/types.ts` (new) — defines `ChapterEvent` type.
   - `packages/api/src/events/__tests__/chapter-bus.test.ts` (new)
   - `apps/web/app/api/events/chapter/route.ts` (new)
   - `apps/web/__tests__/api/events-auth.test.ts` (new — auth gate test)
   - `apps/web/__tests__/api/events-privacy.test.ts` (new — privacy test)
   - `packages/api/src/routers/jobs.ts` (modified — every mutation publishes)
   - `apps/web/lib/sse-client.ts` (new) + `apps/web/components/RealtimeProvider.tsx` or similar (new)
   - `apps/web/components/AppShell.tsx` (or layout file — modified to mount the provider)
   - `apps/web/e2e/mvp/real-time-cross-session.spec.ts` (new)
   - PRD-012 changelog (acceptable)
   - **NO change to `packages/domain/`** (the FSM is unaffected — events are emitted; transitions are unchanged).
   - **NO `--admin` / `--no-verify` traces in commit messages.**

2. **AC mapping** — for each PRD-012 AC (AC-01..AC-07), find the corresponding assertion. AC-07 is P1 and may be deferred — log if missing but don't fail solely on AC-07.

3. **`ChapterEvent` type shape** — open `packages/api/src/events/types.ts`. The payload MUST be exactly:
   ```ts
   { event_id, chapter_id, job_id, event_kind, actor_id, occurred_at }
   ```
   If ANY additional field is present (e.g., `job.description`, `dues_cents`, anything PII-shaped), FAIL — privacy invariant violated at the type level.

4. **Privacy test (AC-05)** — `apps/web/__tests__/api/events-privacy.test.ts` must:
   - Open the SSE stream with a valid auth cookie.
   - Trigger a mutation in another procedure.
   - Receive the event.
   - Assert the payload contains ONLY the 6 fields from §3 of this checklist.
   - Assert NO substring of `job.description`, contact value, dues amount, etc. appears.
   Run the test; must pass.

5. **Auth gate test (AC-06)** — `apps/web/__tests__/api/events-auth.test.ts`:
   - No cookie → 401.
   - Cookie for user not in chapter → 403.
   - Valid cookie → 200 + stream opens.

6. **Multi-context spec (AC-01, AC-02)** — open `apps/web/e2e/mvp/real-time-cross-session.spec.ts`. Verify:
   - Uses `browser.newContext()` TWICE (`ctxA = await browser.newContext(); ctxB = await browser.newContext();`).
   - Asserts cross-session via `expect.poll(...)` or `expect(...).toBeVisible({ timeout: 2_000 })` — NOT `page.reload()`.
   - Covers AT LEAST 4 scenarios (post + approve + edit + cancel, ideally).

7. **Reconnect spec (AC-03)** — verify there's a test that simulates network blip + asserts replay. May be tricky; if not present, log but only fail if missing from §3 gate list.

8. **Graceful degradation test (AC-04)** — verify a test that mocks `EventSource` to throw + asserts the app loads + functions.

9. **Cross-plan invariants** — clone PR locally:
   ```sh
   git checkout <PR-branch>
   pnpm install
   pnpm -r typecheck && \
   pnpm -r test && \
   pnpm --filter @app/domain test no-direct-state-writes && \
   ( unset DATABASE_URL; pnpm --filter web build )
   ```
   Any failure → FAIL.

10. **3× full e2e under DEFAULT workers** — `for i in 1 2 3; do pnpm --filter web e2e || break; done`. ALL 3 must be green. Real-time is flaky-by-nature; ANY single failure means a production issue is lurking.

11. **MVP-FIX-A invariant** — spot-check 3 existing mutation components (`EnrollButton.tsx`, `ApproveRejectButtons.tsx`, `CancelJobModal.tsx`): they MUST still call `router.refresh()` in `onSuccess`. The SSE consumer is additive; original pattern unchanged.

12. **`router.refresh()` debounce** — verify the client SSE consumer debounces (per Q-PLN-02 lean: ~250ms). Code-read `apps/web/lib/sse-client.ts` for a `setTimeout` / `lodash.debounce` / equivalent.

13. **EventSource cleanup** — verify the `useEffect` (or equivalent) that opens the EventSource has a cleanup function calling `.close()`. Without cleanup, navigating breaks; with cleanup, single connection per session as required.

## Verdict

- **PASS** — every gate green; multi-context spec 3/3; privacy invariant intact; no MVP-FIX-A regression; cross-plan invariants all green.
- **FAIL** — list which gate; specific evidence (test name + output, or file snippet).

## What to report back (under 400 words)

- PASS or FAIL.
- For FAIL: which gate(s); the specific evidence.
- For PASS: PR URL, commit hash, e2e wall-time delta, the multi-context spec's pass/fail count across the 3 runs (should be 3/3), the `ChapterEvent` type quoted exactly, the curl command to verify the live SSE keepalive post-deploy.

Begin.
