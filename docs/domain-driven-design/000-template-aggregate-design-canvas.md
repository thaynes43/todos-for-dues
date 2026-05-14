---
id: ADC-NNN
title: <Aggregate Name>
status: Draft           # Draft | Proposed | Accepted | Superseded by ADC-XXX | Deprecated
author: <name>
reviewers: []
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
related:
  prds: []
  bounded_contexts: []     # BCC-NN that owns this aggregate
  aggregates: []           # related ADC-NN
  designs: []              # design docs that consume this
  supersedes: null
---

<!--
Aggregate Design Canvas — Markdown transcription.

Source: ddd-crew/aggregate-design-canvas v1.1
  https://github.com/ddd-crew/aggregate-design-canvas

Used right before writing aggregate code. Stable IDs (CMD-NN, EVT-NN, INV-NN,
ST-NN, POL-NN) are referenceable from design docs, tests, and PRDs.
-->

## 1. Name

Aggregate name; consider including a lifecycle indicator (e.g., "Membership
(spans one academic year)") if relevant.

## 2. Description

Summarise the aggregate's main responsibilities and purpose. Document **why**
these boundaries were chosen and what alternatives were considered.

## 3. State transitions

Explicit lifecycle states the aggregate moves through.

```
[State A] -> [State B] -> [State C]
                      \-> [State D]
```

| ID | From state | Event | To state |
|----|------------|-------|----------|
| ST-01 | … | … | … |
| ST-02 | … | … | … |

> **Heuristic:** many transitions = consider whether this is really a process
> instead of an aggregate. Trivial transitions = anaemic; logic likely
> outsourced *(smell)*.

## 4. Enforced invariants

Business rules this aggregate **actively protects** within its consistency
boundary. These are the invariants that justify the aggregate's existence.

| ID | Invariant | Source |
|----|-----------|--------|
| INV-01 | … | PRD-NNN R-NN |

## 5. Corrective policies

Compensating logic for inconsistencies that **can't** be enforced inside the
aggregate (typically because the rule spans aggregates and is eventually
consistent).

| ID | If… | Then… | Trigger |
|----|-----|-------|---------|
| POL-01 | … | … | event: … |

> **Heuristic:** many corrective policies = responsibilities probably belong
> together; consider merging or rebalancing aggregates.

## 6. Handled commands

| ID | Command | Pre-conditions | Resulting events |
|----|---------|----------------|-------------------|
| CMD-01 | … | … | EVT-NN |

## 7. Created events

| ID | Event (past tense) | Caused by | Consumers (other BCs) |
|----|--------------------|-----------|----------------------|
| EVT-01 | … | CMD-NN | BCC-NN |

## 8. Throughput

Estimate concurrency-conflict likelihood.

| Measure | Average | Max |
|---------|---------|-----|
| Command rate (per instance, per minute) | … | … |
| Concurrent clients (per instance) | … | … |

**Conflict-chance assessment:** Low / Medium / High — *justify briefly*.

## 9. Size

Project growth.

| Measure | Value |
|---------|-------|
| Event growth rate (events appended per instance per month) | … |
| Lifetime of an instance | … |
| Estimated total events at end of life | … |

**Size assessment:** Low / Medium / High — *and mitigation if High* (snapshots,
time-bounded scoping, archival).

## 10. Open questions

| ID | Question | Owner | Needed by |
|----|----------|-------|-----------|
| Q-AGG-01 | … | … | YYYY-MM-DD |

## 11. Changelog

| Date | Author | Change |
|------|--------|--------|
| YYYY-MM-DD | … | Initial draft |
