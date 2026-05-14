---
id: BCC-NNN
title: <Bounded Context Name>
status: Draft           # Draft | Proposed | Accepted | Superseded by BCC-XXX | Deprecated
author: <name>
reviewers: []
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
related:
  prds: []
  adrs: []
  aggregates: []           # ADC-NN owned by this context
  bounded_contexts: []     # other BCC-NN this one talks to
  flows: []
  supersedes: null
---

<!--
Bounded Context Canvas — Markdown transcription.

Source: ddd-crew/bounded-context-canvas v5
  https://github.com/ddd-crew/bounded-context-canvas

Fill top-down. Fields with stable IDs (CMD-NN, EVT-NN, Q-NN, INV-NN, BR-NN)
are referenceable from PRDs, ADCs, and design docs. Never renumber once cited.
-->

## 1. Name

Just the context name. Critical — naming frames how the context is designed.

## 2. Purpose

A few sentences in **business** language: why this context exists, the value
it provides, and the actors it serves. No tech.

## 3. Strategic classification

| Dimension | Value | Justification |
|-----------|-------|---------------|
| Importance | Core / Supporting / Generic | … |
| Business model role | Revenue generator / Engagement creator / Compliance enforcer / Cost reducer | … |
| Evolution stage (Wardley) | Genesis / Custom-built / Product / Commodity | … |

## 4. Domain roles (model traits)

Pick the trait(s) that best describe this context's behavioural pattern.
From the ddd-crew model-traits-worksheet:

- [ ] Specification/Draft Model — produces planning artifacts
- [ ] Execution Model — performs/monitors operations
- [ ] Analysis/Audit Model — oversees execution quality
- [ ] Approver — gates progression between steps
- [ ] Enforcer — mandates compliance
- [ ] Octopus Enforcer — applies standards system-wide *(smell)*
- [ ] Interchanger — bridges multiple domain languages
- [ ] Gateway — manages a system boundary
- [ ] Gateway Interchange — both gateway and interchanger
- [ ] Dogfood Context — simulates customer experience
- [ ] Bubble Context — modernises legacy
- [ ] Autonomous Bubble — async-syncing bubble
- [ ] Brain Context — centralises critical rules *(smell — usually too much)*
- [ ] Funnel Context — standardises multiple upstream inputs
- [ ] Engagement Context — drives user retention

## 5. Ubiquitous language (this context)

Local term meanings inside this context. Promote stabilised terms to
`003-ubiquitous-language.md` with a `T-NN` ID.

| Term | Meaning in this context | Notes |
|------|-------------------------|-------|
| … | … | … |

## 6. Business decisions (key rules and policies)

| ID | Rule / Policy | Source (PRD / regulation / convention) |
|----|---------------|----------------------------------------|
| BR-01 | … | … |

## 7. Inbound communication

What other contexts/actors send **into** this one.

### 7.1 Commands handled

| ID | Command | From (collaborator) | Triggers event(s) |
|----|---------|---------------------|-------------------|
| CMD-01 | … | … | EVT-NN |

### 7.2 Queries handled

| ID | Query | From | Returns |
|----|-------|------|---------|
| Q-01 | … | … | … |

### 7.3 Events consumed

| ID | Event | From | Reaction |
|----|-------|------|----------|
| EVT-IN-01 | … | BCC-NN | … |

## 8. Outbound communication

What this context sends **out**.

### 8.1 Commands issued

| ID | Command | To (collaborator) | When |
|----|---------|-------------------|------|
| CMD-OUT-01 | … | … | … |

### 8.2 Queries issued

| ID | Query | To | Used for |
|----|-------|----|----|
| Q-OUT-01 | … | … | … |

### 8.3 Events published

| ID | Event | Triggered by command | Consumers |
|----|-------|----------------------|-----------|
| EVT-01 | … | CMD-NN | BCC-NN, … |

## 9. Aggregates owned

| ADC ID | Aggregate | Notes |
|--------|-----------|-------|
| ADC-NN | … | link to canvas |

## 10. Dependencies

External systems, libraries, or other bounded contexts this context depends
on. Each row maps to a Context-Mapping pattern when ≥2 contexts exist.

| Dependency | Type (BC / external system / library) | Relationship pattern | Notes |
|------------|---------------------------------------|----------------------|-------|
| … | … | Open Host Service / Conformist / ACL / Shared Kernel / Partnership / Customer-Supplier / Published Language / Separate Ways | … |

## 11. Assumptions

Explicit design assumptions made without complete domain knowledge. Each is
falsifiable; if proved wrong, this canvas needs revision.

- **Assumption:** … — *if false:* …

## 12. Verification metrics

Measurable signals (from CI, prod, product analytics) that this boundary is
holding up. Examples: change-failure rate localised to this context, % of
incidents that span contexts, deployment frequency.

| Metric | Source | Target |
|--------|--------|--------|
| … | … | … |

## 13. Open questions

| ID | Question | Owner | Needed by |
|----|----------|-------|-----------|
| Q-CTX-01 | … | … | YYYY-MM-DD |

## 14. Changelog

| Date | Author | Change |
|------|--------|--------|
| YYYY-MM-DD | … | Initial draft |
