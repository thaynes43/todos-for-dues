---
id: DDD-NNN
title: <Big-Picture | Process | Software-Design> EventStorming — <scope>
status: Draft           # Draft | Proposed | Accepted | Superseded by <ID> | Deprecated
author: <name>
reviewers: []
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
related:
  prds: []
  adrs: []
  bounded_contexts: []
  supersedes: null
---

<!--
EventStorming output template (delete this block in real artifacts).

Source: ddd-crew/eventstorming-glossary-cheat-sheet
  https://github.com/ddd-crew/eventstorming-glossary-cheat-sheet

We don't keep sticky notes; we keep their *output* — a chronological timeline
of domain events plus the surrounding context. Time flows top-to-bottom in
markdown; an optional left-to-right "paper roll" can live in an
`<NNN>.excalidraw` file alongside.

Use stable IDs (E-NN events, A-NN actors, S-NN systems, H-NN hotspots).
Never renumber once referenced from a PRD, BCC, or ADC.

Pick ONE variant in the title:
  - Big-Picture     — whole product, used at project kickoff
  - Process         — single business workflow, used when a process is gnarly
  - Software-Design — single bounded context, used right before aggregate design
-->

## 1. Scope

One paragraph: what slice of the domain does this storm cover, and why now?

> **Scope:** …
> **Variant:** Big-Picture | Process | Software-Design
> **Trigger:** e.g., "kickoff", "PRD-007 introduced refunds", "before designing
> the Membership aggregate".

## 2. Actors and systems

Inputs to the timeline. Reference these by ID from the events table.

| ID | Type   | Name | Notes |
|----|--------|------|-------|
| A-01 | Actor  | … | … |
| S-01 | System | … | external |

## 3. Domain event timeline

Events in **past tense**, ordered by time. Each row is one orange sticky.

| ID | Event (past tense) | Trigger (command/policy/time) | Actor / System | Notes |
|----|--------------------|-------------------------------|----------------|-------|
| E-01 | … was … | … | A-NN / S-NN | … |
| E-02 | … was … | … | … | … |

## 4. Hotspots / open questions

Pink stickies — places where the group/the author hit confusion, conflict, or
missing knowledge. Each becomes a question for a domain expert (or in a solo
project, a Q-NN to research).

| ID | Hotspot | Why it's hot | Owner | Needed by |
|----|---------|--------------|-------|-----------|
| H-01 | … | … | … | YYYY-MM-DD |

## 5. Pivotal events (candidate context boundaries)

Events that mark a meaningful transition in business state — they tend to
fall on bounded-context seams. Use these to inform `003-bounded-contexts.md`.

- **E-NN** — why it's pivotal …

## 6. Outputs / what feeds where

- Glossary terms to add to `003-ubiquitous-language.md`: …
- Candidate bounded contexts for `003-bounded-contexts.md`: …
- Hotspots that should become PRD open questions: …

## 7. Changelog

| Date | Author | Change |
|------|--------|--------|
| YYYY-MM-DD | … | Initial storm |
