# Domain-Driven Design

This folder holds the project's DDD modelling artifacts. DDD sits between
PRDs (`docs/prds/`) and design docs (`docs/designs/`, pending) in the
docs-first SDLC defined by `docs/PROCESS.md`.

PRDs say **what** and **why**. DDD artifacts model the **domain shape** that
makes the what/why implementable: events, bounded contexts, ubiquitous
language, aggregates, and the relationships between contexts. Design docs
then say **how** — APIs, schemas, components.

## Modelling sequence

A compressed version of [ddd-crew/ddd-starter-modelling-process](https://github.com/ddd-crew/ddd-starter-modelling-process), adapted so the **first** discovery artifacts are scoped per primary actor (a "walking-skeleton event timeline" per persona) rather than one big-picture event storm. This keeps the very first DDD work tightly tied to a shippable end-to-end slice and avoids the "model the whole product before any code" trap.

| # | Step | Artifact | Frequency |
|---|------|----------|-----------|
| 1 | **Discover the domain — per persona** | Persona walking-skeleton event timelines: `001-ddd-active-walking-skeleton.md`, `002-ddd-alumni-walking-skeleton.md`, etc. — one file per primary actor, capturing the thinnest happy-path end-to-end flow as past-tense events with E-NN IDs. | Once at project start; refresh when a persona's flow gets a substantially new capability. |
| 2 | **Capture ubiquitous language** | `003-ubiquitous-language.md` | Append-only over project lifetime. |
| 3 | **Decompose into bounded contexts** | `004-bounded-contexts.md` | Once; revisit when a new context emerges. |
| 4 | **Define each bounded context** | `bounded-contexts/NNN-<name>-canvas.md` (one file per context) | Once per context. |
| 5 | **Model context interactions** *(skip when only 1 context)* | `005-context-map.md` + per-scenario flows under `flows/` | Once ≥2 contexts exist. |
| 6 | **Design aggregates** | `aggregates/NNN-<name>-canvas.md` (one file per aggregate) | Just-in-time before code, per aggregate. |

> **Note:** A larger Big-Picture EventStorming covering the *whole* product (all personas, all branches, all hotspots) may still be useful later — at that point, create `006-event-storming-bigpicture.md` (or whatever the next free DDD-NN is) using the existing `000-template-event-storming.md`. For MVP, persona walking skeletons cover what we need.

### Walking-skeleton subset

For the first end-to-end slice (the MVP Walking Skeleton — phase 1 in
PRD-001 §10 / REL-001), do exactly:

1. `001-ddd-active-walking-skeleton.md` — happy-path event timeline for an Active.
2. `002-ddd-alumni-walking-skeleton.md` — happy-path event timeline for an Alumni.
3. `003-ubiquitous-language.md` — start it; expect it to grow.
4. `004-bounded-contexts.md` — list of contexts surfaced from the walking skeletons; one paragraph each. Mark which the skeleton actually touches.
5. One `bounded-contexts/NNN-<name>-canvas.md` for each context the skeleton exercises.
6. One or two `aggregates/NNN-<name>-canvas.md` for the aggregate(s) the skeleton writes to.

Defer everything else (Moderator and Admin walking skeletons, additional canvases, the context map, process-level event storming) until a real signal demands it.

## Templates

- [`000-template-event-storming.md`](000-template-event-storming.md) — used both for persona walking-skeleton timelines and (later) full big-picture event storms.
- [`000-template-bounded-context-canvas.md`](000-template-bounded-context-canvas.md)
- [`000-template-aggregate-design-canvas.md`](000-template-aggregate-design-canvas.md)
- [`000-template-context-map.md`](000-template-context-map.md)

## ID prefix convention

Stable IDs follow the project's "never renumber" rule. Cross-doc references
use `<prefix>-NN`.

| Prefix | Artifact | Where it appears |
|--------|----------|------------------|
| `DDD-NN` | Top-level DDD artifact (persona walking skeleton, glossary, contexts catalog, context map, future big-picture storm) | This folder, top level |
| `BCC-NN` | Bounded Context Canvas | `bounded-contexts/` |
| `ADC-NN` | Aggregate Design Canvas | `aggregates/` |
| `T-NN` | Term in the ubiquitous language | `003-ubiquitous-language.md` |
| `E-NN` | Domain event in a walking skeleton or event storm | `001-ddd-*.md`, `002-ddd-*.md`, future event-storm docs |
| `INV-NN` | Invariant on an Aggregate Design Canvas | per `aggregates/` file |
| `CMD-NN` | Command (handled or issued) | per `bounded-contexts/` and `aggregates/` files |
| `EVT-NN` | Emitted event | per `bounded-contexts/` and `aggregates/` files |
| `ST-NN` | State transition on an aggregate | per `aggregates/` file |

Each artifact owns its own inner ID space (e.g., `E-01` in `001-ddd-active-walking-skeleton.md` is distinct from `E-01` in `002-ddd-alumni-walking-skeleton.md`). Cite cross-artifact as `DDD-001 E-01`.

## Tooling

- **Primary medium:** Markdown in git. Every canvas is a `.md` file; this is
  what agents read and what PR review works on.
- **Optional supplement:** Excalidraw `.excalidraw` files alongside, only when
  a visual genuinely helps thinking. Free, file-based, diff-able-ish.
- **Skip Miro.** Single-player Miro is friction; `.rtb` files don't render in
  PR review.

## References

- [ddd-crew/ddd-starter-modelling-process](https://github.com/ddd-crew/ddd-starter-modelling-process) — canonical 8-step recipe.
- [ddd-crew/welcome-to-ddd](https://github.com/ddd-crew/welcome-to-ddd) — onboarding overview.
- [ddd-crew/eventstorming-glossary-cheat-sheet](https://github.com/ddd-crew/eventstorming-glossary-cheat-sheet) — sticky-note conventions.
- [ddd-crew/bounded-context-canvas](https://github.com/ddd-crew/bounded-context-canvas) — canvas this folder transcribes into Markdown.
- [ddd-crew/aggregate-design-canvas](https://github.com/ddd-crew/aggregate-design-canvas) — same.
- [ddd-crew/context-mapping](https://github.com/ddd-crew/context-mapping) — 9 relationship patterns.
- [ddd-crew/free-ddd-learning-resources](https://github.com/ddd-crew/free-ddd-learning-resources) — curated reading.
