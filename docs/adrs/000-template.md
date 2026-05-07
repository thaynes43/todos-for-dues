---
id: ADR-NNN
title: <decision-statement title — verb phrase, e.g., "Use Postgres for primary data store">
status: Draft           # Draft | Proposed | Accepted | Superseded by ADR-XXX | Deprecated | Rejected
date: YYYY-MM-DD
deciders: []            # who has authority to accept this decision
consulted: []           # whose input was solicited
informed: []            # who needs to be told once decided
related:
  prds: []              # e.g. [PRD-001]
  adrs: []              # related (not superseding) ADRs
  flows: []
  designs: []
  supersedes: null      # e.g. ADR-003
  superseded_by: null   # set when this ADR is replaced
---

<!--
Template usage notes (delete this block in real ADRs):

- Based on MADR 3.0 (Markdown Any Decision Records: https://adr.github.io/madr/),
  with project-specific frontmatter for stable IDs and lineage tracking.
- Title is a *decision statement* — start with a verb. Good: "Use Drizzle for ORM."
  Bad: "ORM choice." The title is the answer, not the question.
- An ADR captures ONE decision. If you find yourself making two decisions, split
  it into two ADRs and link them.
- Once `status: Accepted`, the file is immutable. To change a decision, write a
  new ADR that supersedes this one.
- Consider examples for tone/structure:
  https://github.com/joelparkerhenderson/architecture-decision-record/blob/main/locales/en/examples/choosing-a-database-technology/index.md
-->

## Context and problem statement

Two to four sentences. What forces are at play? What's the question this ADR answers?
A new contributor or agent should be able to understand why this decision was needed
without reading other documents.

## Decision drivers

The criteria that any acceptable option must satisfy or trade against. Order matters
where applicable — list the most important drivers first.

- …
- …

## Considered options

Just a list. Detail goes in *Pros and cons* below.

- **Option A** — <one-line summary>
- **Option B** — <one-line summary>
- **Option C** — <one-line summary>

## Decision outcome

**Chosen option:** *Option X*, because <one-paragraph justification tied to the decision drivers above>.

### Consequences

Each consequence has an ID so other docs can cite it.

- **C-01 (good)** — …
- **C-02 (good)** — …
- **C-03 (bad)** — …
- **C-04 (neutral)** — …

### Confirmation

How we'll verify the implementation actually matches this decision. Point to a test,
a flow spec acceptance criterion, or a runbook check. If you can't say how it's
confirmed, the decision is probably under-specified.

- …

## Pros and cons of the options

### Option A — <name>

<one-paragraph description; what would adopting this look like?>

- Good — …
- Good — …
- Bad — …
- Neutral — …

### Option B — <name>

<one-paragraph description>

- Good — …
- Bad — …
- Bad — …

### Option C — <name>

<one-paragraph description>

- Good — …
- Bad — …

## More information

- References, prior art, vendor docs, blog posts that informed this decision.
- Links to PRDs (see `related.prds` in frontmatter) — repeat key links here for
  inline readability.
- If this ADR triggers follow-up work (e.g., a new ADR that's been deferred),
  list it here.

## Changelog

Append-only. Don't edit prior entries. Edits to an Accepted ADR should be
rare — usually you'd write a superseding ADR instead.

| Date | Author | Change |
|------|--------|--------|
| YYYY-MM-DD | … | Initial draft |
