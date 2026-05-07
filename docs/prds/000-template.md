---
id: PRD-NNN
title: <one-line name of the thing>
status: Draft           # Draft | Proposed | Accepted | Superseded by PRD-XXX | Deprecated
author: <name>
reviewers: []           # names of required reviewers
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
related:
  adrs: []              # e.g. [ADR-001]
  flows: []             # e.g. [flows/checkout.md]
  designs: []           # e.g. [design/billing.md]
  supersedes: null
---

<!--
Template usage notes (delete this block in real PRDs):

- This PRD format is optimized for two readers: humans reviewing intent, and agents
  generating implementation plans. Every section earns its place by being read by
  one of those two.
- Keep the PRD lean. Link out to flow specs, design docs, mocks — don't duplicate.
- Anything that can't be tested doesn't belong in "Requirements" — push it to
  "Open questions" or "Non-goals" until it can.
- Use stable IDs (R-01, AC-01, US-01) so plans, tests, and ADRs can reference
  individual requirements unambiguously. Never renumber.
-->

## 1. Objective

One paragraph. What problem are we solving, for whom, and why now? End with the
single sentence that, if true, means this PRD succeeded.

> **Problem:** …
> **Audience:** …
> **Why now:** …
> **One-sentence definition of success:** …

## 2. Background & context

What does an agent or new reviewer need to know to make sense of the rest? Prior
art, related initiatives, constraints from the business, regulatory or technical
constraints that aren't decisions yet (those are ADRs). Keep to bullets; link
deeper context rather than restating it.

- …
- …

## 3. Success metrics

Measurable signals that this shipped *and worked*. Distinguish leading
(behavioral, available pre-launch) from lagging (business, post-launch).

| Metric | Type | Baseline | Target | How measured |
|--------|------|----------|--------|--------------|
| …      | leading / lagging | … | … | … |

## 4. Personas & user scenarios

Who is this for, and what do they do? Reference personas defined in
`docs/domain/personas.md` once that exists; otherwise inline a one-paragraph
sketch per persona.

### 4.1 Personas

- **<Persona name>** — role, context, primary goal, constraints.

### 4.2 Scenarios / user stories

Each story has a stable ID. Format: *As a <persona>, I want <capability>, so that <outcome>.*

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As a …, I want …, so that …. | P0 |
| US-02 | … | P1 |

Priority scale: **P0** must-have for this release • **P1** should-have • **P2** nice-to-have.

## 5. Requirements

The contract. Each requirement is atomic, testable, and uniquely IDed so plans
and tests can cite it. Keep "what" and "why" here; "how" lives in design docs.

| ID | Requirement | Priority | Linked stories | Notes |
|----|-------------|----------|----------------|-------|
| R-01 | The system shall … | P0 | US-01 | … |
| R-02 | The system shall … | P0 | US-01, US-02 | … |
| R-03 | The system shall … | P1 | US-02 | … |

### 5.1 Acceptance criteria

Given/When/Then form, one block per criterion, each linked to the requirement(s)
it verifies. These are the inputs to the test agent.

- **AC-01** — covers R-01
  - **Given** …
  - **When** …
  - **Then** …
- **AC-02** — covers R-02, R-03
  - **Given** …
  - **When** …
  - **Then** …

## 6. User experience

Link to mocks, prototypes, or flow specs. Inline only the bits that the
implementation agent absolutely needs: critical states, empty/error/loading
behavior, and any UX rules that aren't visible in the mocks.

- Mocks: <link>
- Flow spec: <link to `docs/flows/...`>
- States to cover: empty, loading, error, success, partial-failure
- UX rules:
  - …

## 7. Non-goals (explicitly not doing)

Scope guardrails. If an agent or contributor proposes any of these, push back
and revisit the PRD instead of widening scope silently.

- …
- …

## 8. Assumptions & dependencies

What we're treating as true without proving in this PRD, and what other work
this depends on. Each assumption should be falsifiable — if it turns out wrong,
it triggers a PRD revision.

- **Assumption:** … — *if false:* …
- **Depends on:** ADR-XXX / external system / team decision …

## 9. Risks & open questions

Things we don't know yet that could change the PRD. Owner + by-when for each
open question.

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | … | … | YYYY-MM-DD |

## 10. Release plan

Lightweight. Phasing, rollout strategy, and any feature-flag or migration
considerations. Defer detail to the design doc; this section just says *how this
reaches users*.

- **Phasing:** e.g., walking skeleton → invite-only beta → public
- **Rollout:** flag, percentage, regions, etc.
- **Reversibility:** how we roll back if metrics regress

## 11. Glossary alignment

Terms used in this PRD that must match the project's ubiquitous language
(`docs/domain/glossary.md`). List any new terms this PRD introduces so the
domain doc can be updated.

- **<Term>** — definition (or "see glossary").
- **<New term proposed>** — definition; needs to be added to glossary.

## 12. Changelog

Append-only. Don't edit prior entries.

| Date | Author | Change |
|------|--------|--------|
| YYYY-MM-DD | … | Initial draft |
