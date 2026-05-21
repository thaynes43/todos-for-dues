---
id: VALIDATION-016
title: Job content enrichment — validation
status: Proposed
author: Coordinator
created: 2026-05-20
last_updated: 2026-05-20
related:
  prds: [PRD-010]
  plans:
    paired_implementation: 016-job-content-enrichment-implementation
---

## 1. Goal

Verify PLAN-016 satisfies every AC in PRD-010, every cross-plan invariant established by PLAN-001..PLAN-014 + MVP-FIX-A + MVP-FIX-B is preserved, and no new stale-page regressions were introduced.

## 2. Inputs

1. PR opened by the execute agent against `main` (branch `plan-016-job-content-enrichment`).
2. `docs/prds/010-job-content-enrichment.md` — the source of truth for AC mappings.
3. `docs/plans/016-job-content-enrichment-implementation.md` — for cross-checking what the agent claimed they did.
4. `.zprompt.md` — the execute agent's report.

## 3. AC → Test mapping

Confirm each AC has a corresponding automated test (Vitest or Playwright):

| AC | Where the test lives | What it asserts |
|----|---------------------|-----------------|
| AC-01 | `apps/web/e2e/walking-skeleton/post-job-enriched.spec.ts` (or extension of `post-job.spec.ts`) | Happy path: Alumni submits full form; job row created; audit-log inception row includes new fields. |
| AC-02 | same | Negative — missing contact value → form rejects with inline error citing contact. |
| AC-03 | same | Negative — duration = 0 or = 25 → form rejects with inline error citing duration. |
| AC-04 | same / job-detail spec | Active viewing `/jobs/[id]` sees all 5 new fields rendered. |
| AC-05 | same | `tel:` link href + display formatting correct for phone contact. |
| AC-06 | same | Different account email vs. contact value → only contact value visible; account email not. |
| AC-07 | same | Optional `additional_notes` non-empty → renders; empty → no section. |

If any AC has NO test mapping, fail validation.

## 4. Cross-plan invariants

All must remain green (run locally + confirm CI in PR):

- `pnpm -r typecheck` exits 0.
- `pnpm -r test` exits 0; Vitest counts ≥ pre-PR baseline (new tests may raise the count, but no test was deleted).
- `pnpm --filter @app/domain test no-direct-state-writes` exits 0.
- `unset DATABASE_URL && pnpm --filter web build` exits 0 (lazy-Proxy invariant).
- `pnpm --filter web e2e` exits 0 across **3 consecutive runs** under DEFAULT workers.
- Migration applies cleanly on a fresh DB: drop / recreate / migrate — no error.
- MVP-FIX-A invariant: every `useMutation` in `apps/web/components/*.tsx` calls `router.refresh()` in `onSuccess` if the host page is a server component. **PLAN-016 must not regress this — verify by inspecting the diff.**

## 5. Manual checks (if local DB available)

- Post a job with `phone` contact-kind + value `+15551234567` → `/jobs/[id]` shows a `tel:+15551234567` link rendering with display formatting.
- Post with empty `additional_notes` → detail view does NOT show an empty notes section.
- Post with the longest allowed inputs (200-char location, 500-char notes) → no truncation; UI handles without overflow.

## 6. Gates

| Gate | Criterion |
|------|-----------|
| G-1 | Required CI on PR green (lint-and-typecheck + test). |
| G-2 | Advisory `playwright` on PR green. |
| G-3 | 3× consecutive full e2e under DEFAULT workers locally — all green (per execute-agent report; spot-check). |
| G-4 | Every PRD-010 AC has a test mapping per §3. |
| G-5 | Cross-plan invariants all green per §4. |
| G-6 | Diff inspection: no production code touched outside what PLAN-016 §3 lists. No `docs/` modified except PRD-010 changelog (if the agent added an entry) + `designs/001-database-schema.md` (if updated). |

If any G-N fails, validation fails — return findings to the user for coordinator triage.

## 7. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-20 | Coordinator | Initial Proposed. |
