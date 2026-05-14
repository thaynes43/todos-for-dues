---
id: DDD-NNN
title: Context Map
status: Draft           # Draft | Proposed | Accepted | Superseded by DDD-XXX | Deprecated
author: <name>
reviewers: []
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
related:
  prds: []
  bounded_contexts: []
  supersedes: null
---

<!--
Context Map — Markdown transcription.

Source: ddd-crew/context-mapping
  https://github.com/ddd-crew/context-mapping

Each row documents the relationship between two bounded contexts using one
of the 9 patterns. Add a row whenever a new integration appears. Skip this
artifact entirely while only one bounded context exists.
-->

## 1. Contexts in scope

| BCC ID | Context | Owner |
|--------|---------|-------|
| BCC-01 | … | self |
| BCC-EXT-01 | … | external |

## 2. Relationships

Pattern legend:
**OHS** Open Host Service · **CF** Conformist · **ACL** Anticorruption Layer ·
**SK** Shared Kernel · **PS** Partnership · **C/S** Customer/Supplier ·
**PL** Published Language · **SW** Separate Ways · **BBoM** Big Ball of Mud.

| ID | Upstream | Downstream | Pattern | Direction (cmd/event/query) | Notes |
|----|----------|------------|---------|------------------------------|-------|
| CM-01 | BCC-NN | BCC-NN | … | … | … |

## 3. Diagram (optional)

If a visual helps, drop an `<NNN>.excalidraw` file alongside and link it:

- `004-context-map.excalidraw`

## 4. Open questions

| ID | Question | Owner | Needed by |
|----|----------|-------|-----------|
| Q-CM-01 | … | … | YYYY-MM-DD |

## 5. Changelog

| Date | Author | Change |
|------|--------|--------|
| YYYY-MM-DD | … | Initial map |
