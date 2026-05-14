---
id: ADR-008
title: Use a hand-rolled TypeScript FSM with atomic transition recording for the job state machine
status: Proposed
date: 2026-05-14
deciders: [Tom Haynes]
consulted: []
informed: []
related:
  prds: [PRD-001, PRD-002, PRD-004, PRD-005, PRD-006, PRD-007]
  adrs: [ADR-003, ADR-004]
  flows: []
  designs: []
  supersedes: null
  superseded_by: null
---

## Context and problem statement

PRD-001 R-07 defines a 10-state job state machine (`posted → awaiting moderation → approved → enrollment-open ↔ locked → completed → payment-sent → closed | disputed | rejected | cancelled`) split across PRDs 002, 004, 005, and 006. Every transition must (a) be atomic with the audit-log write defined by R-15 (see ADR-009), (b) be type-checked at compile time so an agent can't introduce an illegal transition, and (c) be enforced server-side because the client cannot be trusted with state machine invariants.

The question is *how* the state machine is implemented: a runtime library, a hand-rolled approach, or DB-only enforcement.

## Decision drivers

1. **Atomic transition + audit-log write.** A transition that succeeds without a corresponding audit-log row is a bug; an audit-log row without a transition is a different bug. Both must succeed or both must fail.
2. **Type-safety in app code.** The implementation agent must get a TypeScript error if it attempts an illegal transition (`completed → enrollment-open` etc.).
3. **Server-side enforcement.** Client-side checks alone are insufficient — the API layer must reject illegal transitions.
4. **Solo-dev / agentic workflow simplicity.** Fewer moving parts and dependencies is better. A new library is overhead unless it pays off.
5. **State machine size.** ~10 states, ~14 distinct transitions. Small enough that hand-rolled cost is low and library overhead per-transition is high.
6. **Single-chapter scale.** No need for distributed-state-machine concerns (Saga, choreography). One Postgres database, one process.

## Considered options

- **Option A** — Hand-rolled TypeScript FSM (a `transitions` map + a single `transition()` function that runs the audit-log write in the same Drizzle transaction).
- **Option B** — Use [XState](https://stately.ai/) (or a comparable library like `robot3`) for the state-machine definition; wire transitions through a service layer that handles the audit log.
- **Option C** — DB-only enforcement (CHECK constraints + triggers in Postgres; app code passes "intended next state" and the DB rejects illegal moves).

## Decision outcome

**Chosen option:** *Option A — hand-rolled TypeScript FSM with atomic transition recording.*

A single TypeScript module (`packages/domain/job-state-machine.ts` or similar) defines the state enum, the typed transitions map (`Record<JobState, JobState[]>` or a discriminated-union event type), and a single `transitionJob()` function that takes a job, the desired event, an actor, and an optional note. The function runs in a Drizzle transaction: read the job's current state, validate the transition against the typed map, write the new state to the `jobs` table, and write the corresponding row to the `job_state_transitions` table (defined in ADR-009). All callers — tRPC procedures across PRD-002/004/005/006 — go through this one function. Illegal transitions are unrepresentable at the call site (TypeScript narrows the allowed events per source state) and rejected at runtime if somehow constructed. The map is the source of truth; an FSM diagram in `docs/designs/` is generated from it (or hand-maintained alongside) for documentation.

This keeps the dependency surface minimal (no new library), gets us type-checking and atomic recording in one shot, and matches the scale we're operating at.

### Consequences

- **C-01 (good)** — One source of truth for transitions: the TypeScript map. Audit log, validation, and tests all derive from it. No drift risk between a library config and the DB.
- **C-02 (good)** — Atomic transition + audit-log write via Drizzle transaction. No "transition succeeded but log row missing" failure mode.
- **C-03 (good)** — Zero new runtime dependencies. Better Auth + tRPC + Drizzle are already in the stack; this fits.
- **C-04 (good)** — Type-safety: an implementation agent attempting `transitionJob(job, 'enroll')` on a `completed` job gets a TS error (the transition isn't in the map for that source state). Catches the most common refactoring bug class.
- **C-05 (bad)** — No free state-machine visualisation or simulation tooling. We hand-maintain (or generate a small Mermaid diagram from the map). XState's Stately Studio would have given this; we accept the tradeoff.
- **C-06 (bad)** — If the state machine grows substantially (>20 states, >40 transitions, complex parallel/hierarchical states), the hand-rolled approach starts to creak. Revisit in a follow-up ADR if/when that happens.
- **C-07 (neutral)** — DB-only enforcement (Option C) is *additive*: we can layer a Postgres CHECK constraint on the `state` column for defence-in-depth without changing app code. Out of scope for this ADR; flagged for ADR-009 / design.

### Confirmation

- Unit tests: every transition pair from the map exercised; every illegal pair rejected with a typed error.
- Integration test: concurrent transition attempts (two requests trying to move the same job at once) — second one fails cleanly via Drizzle's `SELECT … FOR UPDATE` or a version-column optimistic lock.
- AC in PRD-002, PRD-004, PRD-005, PRD-006 §5.1: every state-changing AC verifies both the resulting state *and* the audit-log row exists.

## Pros and cons of the options

### Option A — hand-rolled TypeScript FSM

A single module with a typed transitions map and one `transitionJob()` function. All transition callers route through it; transactions wrap state + audit-log writes.

- Good — Zero dependencies. Scales naturally for ~10–20 states.
- Good — Type-safe at the call site; agent errors caught at compile time.
- Good — The map is grep-able and reviewable in one PR.
- Bad — No tooling support (visualisation, simulation, replay).
- Bad — Hand-maintained — adding a transition means editing the map *and* updating tests *and* updating the diagram if any.

### Option B — XState (or robot3)

A library-driven FSM definition. Transitions become declarative; the library handles guards, side-effects, and (via Stately Studio) visualisation.

- Good — Visualisation and simulation tooling out of the box (Stately Studio).
- Good — Battle-tested for complex hierarchical or parallel state machines.
- Bad — New dependency in the runtime — XState v5 is ~20 KB minified, a real bundle cost on the Next.js client (though server-only use mitigates this).
- Bad — Indirection: the audit-log write needs custom service-layer plumbing on top of XState's transition events.
- Bad — Overkill for a 10-state, non-hierarchical machine with no parallel regions.
- Neutral — Stately Studio is a SaaS; using it for visualisation creates a workflow dependency.

### Option C — DB-only enforcement

Postgres CHECK constraints + BEFORE-UPDATE triggers reject illegal state transitions. App code is unaware of the state machine; it just attempts an `UPDATE` and handles failure.

- Good — Bulletproof enforcement that survives bugs in any client.
- Good — Independent of language / framework — protects future Python or Go services.
- Bad — No type-safety in TypeScript — illegal transitions are runtime errors only.
- Bad — Trigger-based logic is harder to test, debug, and version-control than TS code.
- Bad — The audit-log write would need to be a trigger too, or the app would still need transaction logic. Either way the "atomic" goal isn't free.
- Neutral — Pairs well with Option A as defence-in-depth (a CHECK on the `state` column's enum value, separate from a trigger that enforces transitions).

## More information

- [XState v5 docs](https://stately.ai/docs/xstate-v5) — for context on what we're declining.
- [robot3](https://thisrobot.life/) — smaller alternative we also rejected.
- PRD-001 R-07 (job state machine), R-15 (audit log), §6 UX rules referencing transition recording.
- ADR-003 (tRPC) — `transitionJob()` is called from tRPC procedures.
- ADR-004 (Drizzle + Postgres) — the transaction wrapping state + audit-log writes uses Drizzle's `db.transaction()`.
- ADR-009 (audit log) — defines the row shape `transitionJob()` writes.

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial Proposed. Recommendation: Option A (hand-rolled TS FSM). |
