---
id: REL-NNN
title: <Release name>
status: Planned          # Planned | Shipped | Cancelled
author: <name>
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
target_date: YYYY-MM-DD  # nominal target; not a hard commit
---

<!--
Release manifest template (delete this block in real releases).

A release manifest is the bridge between **per-capability PRDs** (which scope
*what* one capability does) and the act of *shipping* a coordinated set of
capabilities to users. It is NOT a PRD — it owns no product requirements of
its own. It owns:

  - The list of PRDs that must reach status Accepted before this release ships.
  - The phase tag on each PRD's §10 release-plan that this release maps to
    (walking-skeleton / MVP / post-MVP).
  - Cross-cutting acceptance gates (DDD artifacts at status Accepted, ADRs at
    Accepted, walking-skeleton flow spec Accepted, etc.).
  - Deferred work — PRDs not in this release and the reason.

Per project convention (see feedback_mvp_is_a_phase.md): MVP is a release, not
a PRD. Use this manifest to coordinate which PRDs land in MVP without jamming
their content into one mega-doc.
-->

## 1. Scope

One paragraph: what user-visible thing reaches users when this release ships?
Tie it back to the parent PRD's success metric (PRD-001 §3, typically) so
"shipped" and "worked" are distinguishable.

> **Ships:** …
> **Audience:** …
> **Definition of done:** …

## 2. PRDs included

| PRD | Title | Required status before ship | Phase tag in PRD §10 | Notes |
|-----|-------|------------------------------|----------------------|-------|
| PRD-NNN | … | Accepted | walking-skeleton / MVP | … |

## 3. Cross-cutting acceptance gates

Things that must reach a target status before this release can ship, beyond
the PRDs in §2.

- [ ] DDD artifacts at status Accepted: per-persona walking-skeleton docs (e.g., `001-ddd-active-walking-skeleton.md`, `002-ddd-alumni-walking-skeleton.md`), `003-ubiquitous-language.md`, `004-bounded-contexts.md`, `bounded-contexts/<name>-canvas.md` (one per context the release touches), `aggregates/<name>-canvas.md` (one per aggregate the release writes to).
- [ ] ADRs Accepted (not just Proposed): list which.
- [ ] Walking-skeleton flow spec at status Accepted (`docs/flows/walking-skeleton.md`).
- [ ] Implementation plans (`docs/plans/`) for every PRD in §2.
- [ ] All ACs in every included PRD covered by passing unit + functional tests.
- [ ] Functional QA pass against the deployed prototype (per `project_sdlc_pipeline.md` step 8).

## 4. Deferred / not in this release

PRDs explicitly **not** in this release, with the reason.

| PRD | Title | Why deferred | Target release |
|-----|-------|--------------|-----------------|
| PRD-NNN | … | … | REL-NNN or post-… |

## 5. Rollout

- **Environment:** which cluster / domain (Phase 1.1 internal, Phase 1.2 external, etc. per ADR-006).
- **Audience cut:** who gets it first (e.g., a single chapter, a single Active group, the dev/launch team).
- **Reversibility:** how we tear it down or roll back if a critical regression appears.

## 6. Open questions / risks

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | … | … | YYYY-MM-DD |

## 7. Changelog

| Date | Author | Change |
|------|--------|--------|
| YYYY-MM-DD | … | Initial manifest |
