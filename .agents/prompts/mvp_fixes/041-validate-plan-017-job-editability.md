# Prompt for Claude Code agent — Validate PLAN-017 (job editability before lock)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a validator agent — independent review.** Read this prompt, then begin.

## Your task

Verify the PR opened by prompt 040 (PLAN-017 execute) satisfies VALIDATION-017 (`docs/plans/017-job-editability-pre-lock-validation.md`). Independent of the execute agent's claims. Particular emphasis on:
- The new FSM transitions are exactly the two the ADR-008 addendum declares.
- The `no-direct-state-writes` static-analysis test passes (the new helper must respect the FSM invariant).
- The **stale-page assertion** is present and passes (per user direction; this is the recurring concern class).

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** §1–§7.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`.
3. **`docs/prds/011-job-editability-pre-lock.md`** — ACs.
4. **`docs/plans/017-job-editability-pre-lock-validation.md`** — gate checklist.
5. **`docs/adrs/008-job-state-machine.md`** — the FSM authority. Verify the addendum is present + the new transitions match.
6. **The PR** — `gh pr view <PR#>` + the diff.
7. **The new spec** — read `apps/web/e2e/mvp/edit-job.spec.ts` line by line, especially the stale-page assertion (Trap 6 / VALIDATION-017 §4).
8. **`.zprompt.md`** — execute agent's report (skim).

## What you do NOT do

- **Do not write production code or modify the PR.**
- **Do not merge the PR.**
- **Do not relax any gate.** Stale-page assertion not visibly present in the spec = FAIL.

## Validation checklist (run in order)

1. **Diff inspection** — `gh pr diff <PR#> --name-only`. Expected:
   - `docs/adrs/008-job-state-machine.md` (addendum appended)
   - `packages/db/migrations/00XX_job_content_changes.sql` (new)
   - `packages/db/src/schema/jobContentChanges.ts` (new)
   - `packages/domain/src/job-state-machine.ts` (modified — new arrows in `JOB_TRANSITIONS`)
   - `packages/domain/src/transitions.ts` (modified — new `editJob` helper)
   - `packages/domain/__tests__/edit-job.test.ts` (new)
   - `packages/api/src/routers/jobs.ts` (modified — new `edit` procedure)
   - `packages/notifications/src/send-email.ts` (modified — `subjectPrefix` arg + new `sendEditNotificationToActives`)
   - `packages/notifications/src/templates/*.tsx` (possibly new — edit-notification template)
   - `apps/web/components/EditJobForm.tsx` (new)
   - `apps/web/components/JobDetailView.tsx` (modified — Edit button)
   - `apps/web/e2e/mvp/edit-job.spec.ts` (new)
   - PRD-011 changelog (acceptable)
   - **NO `packages/auth/`, no `apps/web/app/api/` outside what's listed, no other domain files.**

2. **AC mapping** — for each PRD-011 AC (AC-01..AC-07), find the corresponding assertion in `edit-job.spec.ts` (or the relevant test file). If any AC has no test → FAIL.

3. **ADR-008 addendum verification** — open `docs/adrs/008-job-state-machine.md`; verify the addendum:
   - Lists the two new transitions exactly: `approved → awaiting_moderation` (cmd: `MaterialEditJob`) + `enrollment_open → awaiting_moderation` (cmd: `MaterialEditJob`).
   - Has a changelog entry dated 2026-05-20 or later.
   - Status still `Accepted`.

4. **`JOB_TRANSITIONS` matches the addendum** — grep `packages/domain/src/job-state-machine.ts` for the two new arrows. Both must be present. If only one or neither → FAIL.

5. **`no-direct-state-writes` invariant** — run `pnpm --filter @app/domain test no-direct-state-writes`. Must exit 0. If the test fails, the new `editJob` helper has a direct UPDATE to `state` — FAIL.

6. **Cross-plan invariants** — clone PR locally:
   ```sh
   git checkout <PR-branch>
   pnpm install
   pnpm -r typecheck && \
   pnpm -r test && \
   pnpm --filter @app/domain test no-direct-state-writes && \
   ( unset DATABASE_URL; pnpm --filter web build )
   ```
   Any failure → FAIL.

7. **3× full e2e under DEFAULT workers** — `for i in 1 2 3; do pnpm --filter web e2e || break; done`. Must be 3/3.

8. **Stale-page assertion** — `edit-job.spec.ts` MUST contain an assertion of the shape:
   ```ts
   await editForm.submit();
   // DO NOT call page.reload() between submit and assertion
   await expect(page.getByTestId('job-description')).toHaveText('Updated', { timeout: 5_000 });
   ```
   `grep -A 5 "page.reload" apps/web/e2e/mvp/edit-job.spec.ts` — if there's a `page.reload()` between the submit and the assertion, FAIL (the test is fraudulent). If the assertion shape is missing entirely, FAIL.

9. **Audit row shape** — manually post + edit a job locally; query `psql ... -c "SELECT diff FROM job_content_changes;"`; verify the JSON has the expected before/after shape (only changed fields; not unchanged ones per Q-PLN-04 lean).

10. **PLAN-016 / PRD-010 specs still pass** — `pnpm --filter web e2e -- e2e/walking-skeleton/` must include the post-job-enriched spec (or whatever PLAN-016 left); verify it still passes.

## Verdict

- **PASS** — every gate green; addendum present; static analysis green; stale-page assertion intact.
- **FAIL** — list which gate failed + specific evidence.

## What to report back (under 300 words)

- PASS or FAIL.
- For FAIL: which gate; the failing test or missing artifact.
- For PASS: PR URL, commit hash, e2e wall-time, new test count, the two new FSM arrows quoted from the addendum.

Begin.
