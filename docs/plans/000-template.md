---
id: PLAN-NNN
title: <imperative one-line: what the agent will do>
status: Draft           # Draft | Proposed | Accepted | Executing | Done | Superseded by PLAN-XXX
author: <name>
reviewers: []
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
estimate: S | M | L      # rough scope: S = single sitting; M = a few sittings; L = multi-day
related:
  prds: []                              # PRDs whose ACs this plan helps satisfy
  adrs: []                              # ADRs the agent must respect
  bounded_contexts: []                  # BCC-NN
  aggregates: []                        # ADC-NN
  designs: []                           # DESIGN-NN this plan implements
  plans: []                             # other plans this depends on or precedes
  parent_plan: null                     # if this is a sub-plan
  supersedes: null
---

<!--
Plan template usage notes (delete this block in real plans):

- A plan is a self-contained, **agent-executable** recipe. Another agent should
  be able to read this plan cold and produce code that passes the verification
  in §5 without making product or domain decisions of its own.
- Cite the designs / PRDs / ADRs that supply those decisions. Don't restate.
- Steps must be **ordered** and **verifiable**. Each step ends with a check
  (test passes, command succeeds, file exists, etc.) so the agent (or the
  next agent in a handoff) can resume mid-plan from a known-good state.
- Right-size: one plan = one PR-sized chunk that ends in a clean commit.
  If a plan needs >1 day to execute, split it into a parent plan + sub-plans
  (mirror of PRD / design splitting heuristics).
- The plan is the contract between the planning phase and the implementation
  agent. If the plan is wrong, fix the plan; don't let the agent invent.
-->

## 1. Goal

One paragraph. What capability or chunk will exist after the agent executes this plan? End with the one-sentence "this plan succeeded if…" criterion.

> **Produces:** …
> **Definition of success:** [verifiable end-state — e.g., "all tests in `packages/db/__tests__/` pass against testcontainers Postgres" or "Playwright `walking-skeleton.spec.ts` passes against a local dev server"].

## 2. Inputs

### 2.1 Documents the agent must read first

Before starting, the agent reads (in this order):

1. `docs/designs/NNN-…md`
2. `docs/adrs/NNN-…md`
3. `docs/prds/NNN-…md` (only the §5 R-NN being implemented)
4. *(any other reference materials)*

### 2.2 Repo state assumed

What state the codebase is in before the agent starts. (E.g., "after PLAN-001 completes" or "fresh clone.")

- …

### 2.3 External dependencies

What the agent needs from the environment.

- Node.js version, package manager, etc.
- Service availability (Postgres reachable, Resend API key set, etc.)

## 3. Outputs

What exists after the plan completes. Be specific — paths + file types.

- `packages/...` — …
- `apps/web/...` — …
- A passing test suite at `…`
- A new git commit with message: `…`

## 4. Steps

Each step is **atomic and verifiable**. Use this shape:

### Step 1 — `<short imperative>`

- **Action:** what the agent does (specific commands, file edits, etc.)
- **Verification:** how to confirm this step succeeded (specific test or command).
- **Resume note:** if interrupted between this and the next step, what state should the next agent expect?

### Step 2 — `<…>`

…

## 5. Verification (end-to-end)

The full set of checks that must pass at the end of the plan. Composed from the per-step verifications + any plan-level integration checks.

- [ ] Check 1
- [ ] Check 2
- [ ] No new TypeScript errors (`pnpm typecheck`)
- [ ] No new lint errors (`pnpm lint`)
- [ ] All cited PRD ACs verified by passing tests

## 6. Out of scope

What the agent must NOT do (deferred to other plans or later phases).

- …

## 7. Risks & gotchas

Known traps the agent may hit. Each with a mitigation or "if you see this, escalate to the user."

- **Risk:** …
  **Mitigation:** …

## 8. Resume points

If the agent gets interrupted, these are the safe checkpoints to pick up from. Each maps to "completed through Step N" with the state expected.

- After Step 1: …
- After Step 2: …

## 9. Open questions

Any non-blocker questions the agent shouldn't try to answer alone — flag and continue, OR escalate based on lean.

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | … | … |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| YYYY-MM-DD | … | Initial draft |
