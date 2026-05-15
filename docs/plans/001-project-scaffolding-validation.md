---
id: VALIDATION-001
title: Validation — PLAN-001 project scaffolding
status: Proposed
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
estimate: S
related:
  prds: [PRD-001]
  adrs: [ADR-001, ADR-002, ADR-003, ADR-004]
  designs: [DESIGN-001, DESIGN-002, DESIGN-003, DESIGN-004, DESIGN-005, DESIGN-006]
  plans:
    pairs_with: PLAN-001
  parent_plan: null
  supersedes: null
---

## 1. Goal

Verify PLAN-001's scaffolding implementation produces a running app skeleton with the workspace + tooling + package layout described in its Outputs section. PLAN-001 ships no business logic — this validation is correspondingly thin and largely CLI-driven; there are no PRD R-NN / AC-NN to map because the plan precedes any product capability.

## 2. Inputs

- **Paired implementation plan:** `docs/plans/001-project-scaffolding.md`.
- **PRDs / designs whose requirements are tested:** none directly. PLAN-001 lays the foundation; PRD ACs land via PLAN-002 onward.
- **Running artifacts under test:** `pnpm dev` boots `apps/web` on `localhost:3000`; `pnpm test` runs the testcontainers smoke test from PLAN-001 Step 8.

## 3. Coverage matrix

PLAN-001 has no PRD R/AC coverage — the matrix lists structural requirements derived from PLAN-001 Outputs.

| Plan output | Test | Test file / command |
|---|---|---|
| Workspace declared (`pnpm-workspace.yaml`) | CLI: `pnpm -r ls` lists `apps/web` + 5 packages | n/a (manual command in §6 gate) |
| Root tooling (TS, ESLint, Prettier, Vitest, Playwright) | CLI: `pnpm typecheck && pnpm lint` succeed with no files-to-check errors | n/a (CLI) |
| Next.js placeholder home | smoke test against `pnpm dev` | `apps/web/__tests__/scaffolding.smoke.test.ts` |
| Drizzle client wired | testcontainers smoke test `SELECT 1` | `packages/db/__tests__/smoke.test.ts` (created by PLAN-001 Step 8) |
| Better Auth handler + tRPC handler stubs | smoke: `curl localhost:3000/api/auth/sign-in/email` returns Better Auth 4xx | n/a (manual command in §6 gate; could be Playwright but overkill) |
| `pnpm --filter web build` succeeds | CLI | n/a |
| `.env.example` lists required vars | static file check | n/a |

## 4. Unit tests

The single unit-level test is the testcontainers smoke test PLAN-001 Step 8 already creates:

- **File:** `packages/db/__tests__/smoke.test.ts`
- **Asserts:** spinning up the Postgres testcontainer succeeds; `SELECT 1` returns `1`.
- **Test-DB:** PG16 via testcontainers per ADR-004 (no SQLite or MySQL substitution).

If desired, add an optional scaffolding smoke test that asserts `pnpm typecheck && pnpm lint` exit codes are 0 — but the CLI gate in §6 is sufficient.

## 5. Playwright E2E tests

**None.** PLAN-001's app surface is a single placeholder home page with no interactivity. Playwright lands when PLAN-006 ships UI to click through.

## 6. Pass/fail gates

Every box must be green for PLAN-001 to be marked Done. Failure → fix the scaffolding; do NOT relax this gate.

- [ ] `pnpm install` succeeds with no errors.
- [ ] `pnpm typecheck` succeeds.
- [ ] `pnpm lint` succeeds.
- [ ] `pnpm test` passes (`packages/db/__tests__/smoke.test.ts` green).
- [ ] `pnpm --filter web build` succeeds.
- [ ] `pnpm --filter web dev` boots and `curl -s http://localhost:3000/` returns HTTP 200 with the placeholder text.
- [ ] `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/auth/sign-in/email -X POST` returns a 4xx (Better Auth missing-credentials response — proves the handler is wired).
- [ ] One commit on the branch matching the PLAN-001 §9 message.

## 7. Resume notes

The gates above are independent CLI commands. If interrupted, re-run from the failing gate; no shared state between gates other than the local Postgres container (started fresh per `pnpm test` invocation).

## 8. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial draft. Pairs with PLAN-001. Validation is CLI-only — no PRD ACs apply, no Playwright needed at this stage. |
