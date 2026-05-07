# PROCESS

How we go from idea → deployed SaaS. This is a living document; update it when reality stops matching it.

## Philosophy

- **Docs are inputs to agents, not artifacts for shelves.** Every document type below exists because a downstream step (a human reviewer or an agent generating code) consumes it. If a doc has no consumer, drop it.
- **Walking skeleton first.** The thinnest possible end-to-end slice — real auth, real DB, real deploy — beats any number of fully-built but disconnected components. The skeleton proves the architecture; everything after is fleshing it out.
- **Domain Driven Design at the seams.** We use DDD to find bounded contexts and shape the ubiquitous language *before* we pick frameworks or write code. Tactical patterns (aggregates, value objects, etc.) are optional and applied where they earn their keep.
- **Bias to small, reversible decisions.** ADRs are cheap; rewrites are not. When in doubt, write the ADR.

## Folder structure

```
docs/
  PROCESS.md            # this file
  prds/                 # Product Requirements Documents — the "what" and "why"
  adrs/                 # Architecture Decision Records — numbered, immutable once accepted
  domain/               # DDD artifacts: context map, ubiquitous language, event storming notes
  flows/                # End-to-end flow specs (one per user-visible journey)
  design/               # Detailed software design docs (per-feature or per-context)
  plans/                # Implementation plans (often agent-generated from the above)
  test/                 # Test strategy, walking-skeleton acceptance criteria, e2e scenarios
  ops/                  # Runbooks, deploy notes, on-call (added when we need them)
  templates/            # Skeletons for each doc type
```

Folders are created as we need them — don't pre-populate empty directories.

## Document types

| Type | Lives in | Purpose | Audience |
|------|----------|---------|----------|
| **PRD** | `prds/` | Problem, users, goals, non-goals, success metrics, scope | Humans, then agents |
| **ADR** | `adrs/` | One architectural decision: context, options, choice, consequences | Humans, then agents |
| **Domain model** | `domain/` | Bounded contexts, ubiquitous language, context map, key events | Humans, agents |
| **Flow spec** | `flows/` | A single end-to-end user journey: actors, steps, contracts, failure modes | Humans, agents |
| **Design doc** | `design/` | How a context/feature is built: data model, APIs, key algorithms, trade-offs | Humans, agents |
| **Implementation plan** | `plans/` | Step-by-step changes an agent will execute, with file-level granularity | Agents, reviewed by humans |
| **Test plan** | `test/` | What "done" means for the walking skeleton and each iteration | Humans, agents |

## SDLC phases

### 1. Requirements (PRD)
Write a PRD describing the problem, target users, in-scope vs. out-of-scope, and success criteria for the MVP. The PRD names the *thinnest* user-visible flow that proves the product exists — that becomes the walking skeleton.

### 2. Architecture (ADRs)
Decisions with long shadows get an ADR before code. First ADR for this project: tech stack. Subsequent ADRs as decisions arise (auth strategy, data store, deployment target, etc.). Use the project's ADR template (`docs/adrs/000-template.md`), based on [MADR 3.0](https://adr.github.io/madr/): explicit decision drivers, considered options with pros/cons, decision outcome, consequences (good/bad/neutral), and confirmation. Number sequentially with three digits (`001-tech-stack.md`). ADRs are immutable once accepted — to change a decision, write a new ADR that supersedes the old one.

### 3. Domain modeling (DDD)
Strategic DDD first:
- **Event storming** (lightweight: list domain events in past tense, then group)
- **Bounded contexts** and a **context map** (which contexts exist, how they integrate)
- **Ubiquitous language** glossary per context — the words used in code, UI, docs, and conversations must match

Tactical DDD (aggregates, repositories, etc.) is applied only where complexity warrants it. The walking skeleton may not need it at all.

### 4. End-to-end flows
For each user-visible journey, write a flow spec:
- Actors and preconditions
- Step-by-step interaction (UI → API → domain → persistence → response)
- Contracts at each boundary (request/response shapes, events emitted)
- Failure modes and recovery
- Acceptance criteria (testable)

The walking skeleton has **one** flow spec — the lightest one that touches every architectural layer.

### 5. Design
Per-context or per-feature design docs translate flow specs into concrete software design: data model, API surface, key algorithms, error handling, observability hooks. This is the last document an agent reads before producing an implementation plan.

### 6. Implementation plans
Agents combine PRD + ADRs + domain model + flow spec + design doc into a step-by-step plan: which files to create/modify, in what order, with what tests. Humans review the plan before execution. Plans live in `plans/` so we can audit what was built and why.

### 7. Build & test
Execute the plan. Tests fall into three buckets:
- **Unit** — domain logic, pure functions
- **Integration** — context-internal wiring, real dependencies where cheap
- **End-to-end** — the walking skeleton flow, run against a near-prod environment

The walking skeleton's e2e test is the gate: green = ready for the next iteration.

### 8. Iterate
Run the walking skeleton against real usage (us, then friendly users). Capture friction. Decide: (a) fix in this iteration, (b) defer to backlog, or (c) write an ADR if the friction implies an architectural change. Repeat until the MVP exit criteria from the PRD are met.

### 9. Deploy
MVP deploy criteria (defined in the PRD) are met → ship. Operational docs (runbooks, on-call, dashboards) move into `ops/` at this point, not before.

## Agent collaboration model

Agents are first-class participants. Their inputs and outputs are the documents above:

- **Plan agent**: reads PRD + ADRs + domain + flow + design → writes implementation plan
- **Implementation agent**: reads plan + design → writes code + tests
- **Review agent**: reads diff + design + flow → flags drift from intent
- **Test agent**: reads flow spec + acceptance criteria → writes/runs e2e tests

A document is "agent-ready" when another instance of Claude can read it cold and produce useful output without asking clarifying questions. If an agent has to guess, the doc has a gap — fix the doc, not the agent.

## Review & change management

- PRDs and ADRs require human review before status moves to `Accepted`.
- Implementation plans require human review before execution.
- Design docs and flow specs are revised in place; significant changes get a changelog entry at the bottom.
- ADRs are never edited after acceptance — supersede with a new ADR.

## Status lifecycle

Every doc has a status in its frontmatter:
- `Draft` — being written
- `Proposed` — ready for review
- `Accepted` — current source of truth
- `Superseded by NNNN` — replaced; keep file for history
- `Deprecated` — no longer relevant; keep file for history

## What we deliberately skip (for now)

- Heavyweight ceremony (no sprint rituals, story points, or estimation theater)
- Premature ops investment (no observability stack until the skeleton is deployed)
- Tactical DDD where it doesn't earn its keep (no aggregates for CRUD)
- Doc tooling (Markdown in git is enough; revisit if it stops being enough)

## Next steps

1. ~~Product overview PRD (`prds/001-todos-for-dues-overview.md`)~~ — drafted
2. ~~Tech stack ADRs (001 web framework, 002 auth, 003 API contract, 004 DB + ORM, 005 email, 006 hosting)~~ — all Proposed
3. Write the MVP-scope PRD (`prds/002-mvp.md`) — turns capability-level requirements into testable feature requirements
4. Domain model + walking-skeleton flow spec
5. Walking-skeleton design docs (auth, deploy, data-model, API conventions, email) → implementation plan → build → deploy
