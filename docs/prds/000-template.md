---
id: PRD-NNN
title: <one-line name of the capability>
status: Draft           # Draft | Proposed | Accepted | Superseded by PRD-XXX | Deprecated
author: <name>
reviewers: []           # names of required reviewers
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
size: S | M | L         # informal estimate; flags PRDs at risk of being too big (>30–50 R-NN, >50 AC-NN)
related:
  parent_prd: PRD-001               # the overview/parent PRD this decomposes (omit for the overview PRD itself)
  parent_requirements: []           # which parent R-NN this PRD owns, e.g. [R-03, R-04]
  adrs: []                          # e.g. [ADR-001]
  flows: []                         # e.g. [flows/checkout.md]
  designs: []                       # e.g. [designs/billing.md]
  bounded_contexts: []              # e.g. [BCC-001]
  prds: []                          # other PRDs cross-referenced
  supersedes: null
---

<!--
Template usage notes (delete this block in real PRDs):

- This template is for **capability-scoped** PRDs (one PRD = one capability area).
  Avoid mega-PRDs that try to enumerate "all of MVP" — MVP is a phase, tracked
  in `docs/releases/`, not a PRD scope. See `feedback_mvp_is_a_phase.md` in
  user memory for the rationale.
- This PRD format is optimised for two readers: humans reviewing intent, and
  agents generating implementation plans. Every section earns its place by
  being read by one of those two.
- **Inherit, don't restate.** Cite PRD-001 §X or ADR-NNN rather than reproducing
  prose. Personas, success metrics, glossary, and stack constraints live in the
  parent PRD or in dedicated docs.
- Anything that can't be tested doesn't belong in "Requirements" — push it to
  "Open questions" or "Non-goals" until it can.
- Use stable IDs (R-NN, AC-NN, US-NN, Q-NN) so plans, tests, and ADRs can
  reference individual requirements unambiguously. Never renumber.
- Each PRD owns its own ID space (R-01 in PRD-005 ≠ R-01 in PRD-006). Cite
  cross-PRD references as `PRD-005 R-01`.
-->

## 0. Reading order for agents *(optional — include for PRDs with >25 requirements)*

If this PRD is large, name the order an implementation agent should consume
sections to plan effectively. Otherwise omit this section.

## 1. Objective

One paragraph. What capability are we delivering, for whom, and why now? End
with the single sentence that, if true, means this PRD succeeded.

> **Problem:** …
> **Audience:** …
> **Why now:** …
> **One-sentence definition of success:** …

## 2. Background & context

What does an agent or new reviewer need to know to make sense of the rest?
Inherit by reference: cite parent PRD §X, ADR-NNN, and prior decisions rather
than reproducing them. Use bullets, not prose.

- Parent PRD: PRD-001 §X (capability R-NN this decomposes).
- Constraints inherited from ADR-NNN: …
- Resolved questions baked into this PRD: …
- Out-of-band facts the agent needs to know: …

## 3. Success metrics *(optional — include only when measurable at this PRD's scope)*

For most capability-level PRDs, success metrics live in the parent PRD or in
the release manifest. Include this section here only when the capability has
its own uniquely-measurable signal.

| Metric | Type | Baseline | Target | How measured |
|--------|------|----------|--------|--------------|
| …      | leading / lagging | … | … | … |

## 4. Personas & user scenarios

### 4.1 Personas

Inherited from PRD-001 §4.1 unless this PRD introduces a new persona. If it
does, define it inline; otherwise this subsection is one sentence.

### 4.2 Scenarios / user stories

Each story has a stable ID. Format: *As a `<persona>`, I want `<capability>`,
so that `<outcome>`.* Each PRD owns its own US-NN namespace.

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As a …, I want …, so that …. | P0 |
| US-02 | … | P1 |

Priority scale: **P0** must-have for this capability • **P1** should-have • **P2** nice-to-have.

## 5. Requirements

The contract. Each requirement is atomic, testable, and uniquely IDed so plans
and tests can cite it. Keep "what" and "why" here; "how" lives in design docs.

**Style: EARS** (Easy Approach to Requirements Syntax — Mavin). Use one of the
five patterns per requirement:

- **Ubiquitous:** *The system shall …*
- **Event-driven:** *When `<trigger>`, the system shall …*
- **State-driven:** *While `<state>`, the system shall …*
- **Optional:** *Where `<feature>` is configured, the system shall …*
- **Unwanted-behaviour:** *If `<undesired condition>`, the system shall …*

The `Decomposes` column links each R-NN here to the parent capability it
implements (e.g., `PRD-001 R-03`). New PRDs targeting the same parent R-NN
must not duplicate scope — coordinate via §7.2 DO NOT CHANGE.

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| R-01 | PRD-001 R-NN | When …, the system shall … | P0 | US-01 | … |
| R-02 | PRD-001 R-NN | The system shall … | P0 | US-01, US-02 | … |
| R-03 | PRD-001 R-NN | If …, then the system shall … | P1 | US-02 | … |

### 5.1 Acceptance criteria

Given/When/Then form, one block per criterion, each linked to the requirement(s)
it verifies. **Each AC produces one test. If you can't write the test from the
AC alone, the AC isn't done.** These are the inputs to the test agent.

- **AC-01** — covers R-01
  - **Given** …
  - **When** …
  - **Then** …
- **AC-02** — covers R-02, R-03
  - **Given** …
  - **When** …
  - **Then** …

### 5.2 Examples *(optional — include for requirements involving data shapes, validation, or computed values)*

For any R-NN that touches concrete data shapes, validation rules, or computed
values, give one or more input → output examples. Concrete examples kill
ambiguity for both reviewers and agents.

- **Example for R-NN:**
  - **Input:** `<concrete value>`
  - **Output:** `<concrete value>`

## 6. User experience

Link to mocks, prototypes, or flow specs. Inline only the bits the
implementation agent absolutely needs: critical states, empty/error/loading
behaviour, and any UX rules that aren't visible in the mocks.

- Mocks: `<link>`
- Flow spec: `<link to docs/flows/...>`
- States to cover: empty, loading, error, success, partial-failure
- UX rules:
  - …

## 7. Scope boundaries

### 7.1 Non-goals

Things this capability is explicitly not doing. If an agent or contributor
proposes any of these, push back and revisit the PRD instead of widening
scope silently.

- …
- …

### 7.2 DO NOT CHANGE *(scope-locks owned by other PRDs/ADRs)*

Concerns this PRD must NOT touch, even when implementation work tempts it to.
Each entry names the owning PRD/ADR/design doc. If a change is genuinely
needed, file an issue or amendment against the owning doc — don't drift the
boundary in this PRD's plan.

| Concern | Owned by | Reason it's locked |
|---------|----------|---------------------|
| Auth flow / OIDC config | PRD-003, ADR-002, ADR-007 | Identity is its own bounded context. |
| Job state machine transitions outside `<this PRD's cluster>` | PRD-NNN | Avoid cross-PRD state-machine drift. |
| … | … | … |

## 8. Assumptions & dependencies

What we're treating as true without proving in this PRD, and what other work
this depends on. Each assumption is **falsifiable** — if it turns out wrong,
it triggers a PRD revision.

- **Assumption:** … — *if false:* …
- **Depends on:** ADR-XXX / PRD-NNN / external system / team decision …

## 9. Risks & open questions

Things we don't know yet that could change the PRD. Owner + by-when for each
open question. Use this PRD's own Q-NN namespace.

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | … | … | YYYY-MM-DD |

## 10. Release plan

Lightweight. Phasing, rollout strategy, and any feature-flag or migration
considerations. Defer detail to the design doc; this section just says *how
this reaches users* and *which requirements are in which phase*.

**Tag every P0 requirement to a phase.** P0 without phase tag = ambiguity.

- **Walking skeleton:** R-NN, R-NN — the thinnest end-to-end slice.
- **MVP:** R-NN, R-NN, R-NN — full P0 set for the launch chapter.
- **Post-MVP:** R-NN, R-NN — P1/P2.
- **Rollout:** flag, percentage, regions, etc.
- **Reversibility:** how we roll back if metrics regress.

The release manifest at `docs/releases/001-mvp.md` aggregates which PRDs must
reach Accepted before MVP ships.

## 11. Glossary changes

New or modified terms introduced by this PRD that need to land in the
ubiquitous language at `docs/domain-driven-design/003-ubiquitous-language.md`.
Most PRDs introduce no new terms — leave blank if so. Do **not** restate the
existing glossary here.

- **`<New term>`** — definition; needs to be added (T-NN to be assigned).

## 12. Changelog

Append-only. Don't edit prior entries.

| Date | Author | Change |
|------|--------|--------|
| YYYY-MM-DD | … | Initial draft |
