# Prompt for Claude Code agent — Validate PLAN-016 (job content enrichment)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a validator agent — independent review of the execute agent's work.** Read this prompt, then begin.

## Your task

Verify the PR opened by prompt 038 (PLAN-016 execute) satisfies every gate in VALIDATION-016 (`docs/plans/016-job-content-enrichment-validation.md`). Do NOT trust the execute agent's report alone — independently verify against the code + the PRD ACs + the cross-plan invariants. Report PASS or FAIL with specifics.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** §1–§7 (you're working within the same workflow but with validator boundaries — see "What you do NOT do").
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`.
3. **`docs/prds/010-job-content-enrichment.md`** — the source of truth for ACs.
4. **`docs/plans/016-job-content-enrichment-validation.md`** — your gate checklist.
5. **The PR** — `gh pr view <PR#>`; read the diff; read the execute agent's report in `.zprompt.md` (under <200 words to save context, then move on).
6. **The new spec file** the execute agent added — read it line-by-line.

## What you do NOT do

- **Do not write production code.** You verify.
- **Do not modify the PR.** If you find a gap, FAIL the validation and report.
- **Do not merge the PR.** Coordinator + user.
- **Do not relax any gate.** If `pnpm --filter web e2e` is 2/3 across 3 runs, FAIL. Real-time + cross-plan invariants are the kind of thing where intermittent success masks production failure.

## Validation checklist (run in order)

1. **Diff inspection** — `gh pr diff <PR#> --name-only`. Expected files:
   - `packages/db/migrations/00XX_job_content_enrichment.sql` (new)
   - `packages/db/src/schema/jobs.ts` (modified)
   - `packages/api/src/routers/jobs.ts` (modified — `post` input + output schema)
   - `apps/web/components/PostJobForm.tsx` (modified)
   - `apps/web/components/JobDetailView.tsx` (modified)
   - `apps/web/e2e/walking-skeleton/post-job.spec.ts` OR new `post-job-enriched.spec.ts` (modified or new)
   - `apps/web/e2e/*/support.ts` (modified — helper signature)
   - Possibly `docs/prds/010-job-content-enrichment.md` changelog (acceptable; PR-author added)
   - Possibly `docs/designs/001-database-schema.md` (acceptable; schema doc update)
   - **NO other production code files modified.** No `packages/domain/`, no `packages/auth/`, no `packages/notifications/`. If any of these are touched, FAIL and report why.

2. **AC mapping** — for each PRD-010 AC (AC-01..AC-07), find the corresponding Playwright assertion in the new/extended spec. If any AC has no test, FAIL with the missing AC listed.

3. **Cross-plan invariants** — clone the PR locally and run:
   ```sh
   git fetch origin && git checkout <PR-branch>
   pnpm install
   pnpm -r typecheck && \
   pnpm -r test && \
   pnpm --filter @app/domain test no-direct-state-writes && \
   ( unset DATABASE_URL; pnpm --filter web build )
   ```
   ANY failure → FAIL the validation.

4. **3× full e2e under DEFAULT workers** — `for i in 1 2 3; do pnpm --filter web e2e || break; done`. ALL 3 must be green. If any single run fails, FAIL.

5. **Stale-page guard** — `apps/web/e2e/mvp/stale-ui-after-mutation.spec.ts` (or its equivalent — search) must STILL pass. Run it explicitly; if it doesn't pass, the MVP-FIX-A invariant has been regressed; FAIL.

6. **Migration verification** — drop the local DB, run migrate, verify the new columns appear with correct DEFAULTs + CHECKs:
   ```sh
   psql ... -c "\d jobs" | grep -E "poster_contact_kind|poster_contact_value|location|estimated_duration_hours|additional_notes"
   ```

7. **Privacy invariant test** (R-06) — post a job with `account_email != contact_value`; load the detail page; `grep` the rendered HTML for `account_email`; expect zero hits.

8. **`tel:` link sanitization** — manually craft a post with `contact_kind: 'phone'` and a value containing a `"` or `<` character; verify the rendered HTML attribute is properly escaped (no `<script>` injection).

## Verdict

After all checks:
- **PASS** — every gate green. Report the PR URL + commit hash + summary stats (number of new fields, number of new tests, e2e run wall-time delta).
- **FAIL** — list the specific gate that failed + the evidence (test name + error output). Do NOT suggest fixes — that's coordinator + execute-agent's job.

## What to report back (under 300 words)

- PASS or FAIL.
- For FAIL: which gate(s), specific evidence (test output, file diff snippet).
- For PASS: PR URL, commit hash, e2e wall-time, new test count.

Begin.
