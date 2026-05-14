---
id: ADR-009
title: Use a single transitions table with append-only writes and forever retention for the job audit log
status: Proposed
date: 2026-05-14
deciders: [Tom Haynes]
consulted: []
informed: []
related:
  prds: [PRD-001, PRD-007]
  adrs: [ADR-004, ADR-008]
  flows: []
  designs: []
  supersedes: null
  superseded_by: null
---

## Context and problem statement

PRD-001 R-15 (audit log) requires that every per-job state transition be recorded with source state, destination state, UTC timestamp, acting user, and an optional free-text note. PRD-007 (Admin view) surfaces this log to Admins per job. ADR-008 commits to a hand-rolled FSM that writes the audit-log row in the same transaction as the state change. The remaining question: what shape does the audit-log row take, where does it live, and how long do we keep it?

## Decision drivers

1. **Single source of truth for "why is this job in this state?"** Every transition recoverable from the log, in order, with actor and note.
2. **Atomic write with the state transition** (per ADR-008 — same Drizzle transaction).
3. **Admin-readable** without N+1 queries — one query returns a job's full transition history.
4. **Solo-dev simplicity.** Avoid event-sourcing the aggregate, partitioning before scale demands it, or building a separate audit service.
5. **Single-chapter scale.** ~5–50 jobs/month, ~5–10 transitions per job. ~250–6000 rows/year. Forever-retention costs are negligible; even 10 years is a few hundred MB.
6. **Forensic value is highest in the recent past** but non-zero forever — a 2-year-old transition can still answer "why did this Active never get credited?"

## Considered options

- **Option A** — Single `job_state_transitions` table (append-only) in the same Postgres DB; forever retention; Admin view queries directly.
- **Option B** — Event-source the Job aggregate: every state change is an event row, current state is derived/cached. The log *is* the source of truth.
- **Option C** — Time-partitioned audit table (one Postgres partition per month/year) for future scale; forever retention.
- **Option D** — Separate audit service (a sidecar log shipper to e.g. Loki) — primary DB stays small, audit lives in a queryable log store.

## Decision outcome

**Chosen option:** *Option A — single `job_state_transitions` table, append-only, forever retention.*

Schema (illustrative, finalised in design doc):

```sql
CREATE TABLE job_state_transitions (
  id           uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid       NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  from_state   text       NOT NULL,                  -- enum-checked via CHECK
  to_state     text       NOT NULL,                  -- enum-checked via CHECK
  actor_id     uuid       REFERENCES users(id),      -- nullable for system transitions
  actor_kind   text       NOT NULL,                  -- 'user' | 'system'
  note         text,                                  -- free text, nullable; dispute reasons + Admin resolution notes
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON job_state_transitions (job_id, created_at);
CREATE INDEX ON job_state_transitions (created_at) WHERE to_state = 'disputed';  -- speeds Admin dashboard
```

Writes happen exclusively through the `transitionJob()` function from ADR-008. Reads come from one tRPC procedure called by PRD-007's Admin view: `getJobHistory(jobId)` returns ordered rows. Forever retention; no archival; no partitioning. Admin-only read access enforced at the procedure layer.

If the table ever exceeds a few million rows (hypothetical: a chapter ten years out, multiple chapters in one DB), revisit with a partitioning ADR — but that's a future-us problem.

### Consequences

- **C-01 (good)** — One table, one write path, one read path. Easy to reason about, easy to test.
- **C-02 (good)** — Same Drizzle transaction as the state mutation per ADR-008 — no orphaned-log-row or missing-log-row failure modes.
- **C-03 (good)** — Indexed for the two real query patterns: per-job history (Admin drill-in) and recent disputes (Admin dashboard count).
- **C-04 (good)** — Forever retention means the question "what happened with that job from last spring?" always has an answer.
- **C-05 (good)** — `ON DELETE CASCADE` on `job_id` handles the (rare) job deletion case cleanly. If we want the log to survive job deletion, we change to `ON DELETE SET NULL` and handle null `job_id` reads — design choice deferred.
- **C-06 (bad)** — Not event-sourced: the *current* job state lives on `jobs.state`, not derived from the log. Two writes to coordinate (the state column + the log row). The transaction in ADR-008 mitigates this; we accept the duplication.
- **C-07 (bad)** — Forever retention means the table grows monotonically. At our scale this is acceptable for many years; flag for re-evaluation if it ever becomes a hot table.
- **C-08 (neutral)** — `note` is free text — no schema-enforced classification of "this is a dispute reason" vs. "this is a resolution note." Acceptable for MVP; we can add a typed `note_kind` column later without breaking the existing log.
- **C-09 (neutral)** — User-role-change events (a separate audit need from PRD-008) are NOT covered by this table. They get their own `user_role_transitions` table following the same pattern. Out of scope here; called out so it doesn't get smashed into this table.

### Confirmation

- Unit test: `transitionJob()` writes a row whose `from_state`, `to_state`, `actor_id`, `note`, and `created_at` match the call.
- Unit test: a transaction failure (forced) leaves both `jobs.state` unchanged AND no `job_state_transitions` row written.
- AC in PRD-007 §5.1: `getJobHistory(jobId)` returns rows in `created_at` ASC order; Admin sees the full list.
- AC in PRD-007 §5.1: dispute count on the Admin dashboard reflects rows where `to_state = 'disputed'`.

## Pros and cons of the options

### Option A — single transitions table

See §Decision outcome.

- Good — Simple, fast, well-indexed for the real queries.
- Good — Atomic with the state write per ADR-008.
- Bad — Two-write coordination (state column + log row).
- Bad — Forever growth.

### Option B — event-source the Job aggregate

The log *is* the source of truth; current state is derived (`SELECT to_state FROM job_state_transitions WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1`) or cached in a materialised view.

- Good — Single source of truth — no two-write problem.
- Good — Replay is trivial: re-derive state from the log.
- Bad — Every state read either does the derivation (slow, N+1 risk) or hits a materialised view (cache-invalidation problem).
- Bad — Bigger refactor surface — the rest of the schema (FKs to "jobs by state") needs to plan for derived state, not column state.
- Bad — Overkill for our scale and our team.

### Option C — partitioned table from day one

Partition by month or year; query planner skips old partitions.

- Good — Future-proof for scale.
- Bad — Premature complexity. We have ~6000 rows/year; partitioning is unwarranted for ~3–4 orders of magnitude.
- Bad — Migration friction if the partition key needs to change later.

### Option D — separate audit service / log store

Ship transitions to a separate store (Loki, Clickhouse, etc.) with its own retention.

- Good — Primary DB stays small; audit retention is independent.
- Bad — Atomic-with-state-change is no longer free — needs an outbox pattern or accepts eventual consistency.
- Bad — Adds a moving part. Solo-dev cost is real.
- Bad — Admin view needs to query a different store, more infrastructure to wire.

## More information

- PRD-001 R-15 (audit log capability).
- PRD-007 §5 (Admin view surfaces the log).
- ADR-008 — defines the transaction in which the log row is written.
- ADR-004 — Drizzle + Postgres; uses `gen_random_uuid()` from `pgcrypto`.
- [Greg Young — Why Use Event Sourcing](https://eventstore.com/blog/what-is-event-sourcing) — for context on Option B; rejected here.

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial Proposed. Recommendation: Option A (single transitions table, forever retention). |
