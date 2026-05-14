---
id: DDD-003
title: Ubiquitous Language
status: Draft           # Draft | Proposed | Accepted | Superseded by DDD-XXX | Deprecated
author: Tom Haynes
reviewers: []
created: 2026-05-14
last_updated: 2026-05-14
related:
  prds: [PRD-001, PRD-003]
  bounded_contexts: []     # populated as BCC-NN canvases land
  supersedes: null
---

<!--
Project glossary — the canonical "what does this word mean?" doc. Append-only
in spirit; if a term changes meaning, add a new row with the new T-NN and
mark the old one Superseded rather than rewriting in place.

Each term has a stable ID (T-NN). PRDs, BCCs, ADCs, and design docs may cite
T-IDs to disambiguate when the same English word means different things in
different contexts.

If a term has different meanings in different bounded contexts, add ONE row
per (term, context) pair and qualify in the "Context" column.

Initial entries seeded from PRD-001 §11 (Proposed 2026-05-14).
-->

## Glossary

| ID | Term | Context | Definition | Notes |
|----|------|---------|------------|-------|
| T-01 | Active | (project-wide) | Current undergraduate member of a chapter who pays dues. | Seeded from PRD-001 §11. |
| T-02 | Alumni | (project-wide) | Past member of a chapter who may post jobs. Used as a role label; refers to one or more past members regardless of grammatical number. Deliberately gender-neutral (preferred over Alumnus / Alumna / Alumnae). | Seeded from PRD-001 §11. |
| T-03 | Moderator | (project-wide) | Alumni with elevated privileges to review and approve job postings. | Seeded from PRD-001 §11. |
| T-04 | Admin | (project-wide) | Chapter staff with elevated privileges to escalate roles, manage the instance, and resolve disputes. | Seeded from PRD-001 §11. |
| T-05 | Job (TODO) | (project-wide) | A unit of work an Alumni posts; the central domain entity. | Seeded from PRD-001 §11. |
| T-06 | Dues | (project-wide) | Periodic payment owed by an Active to the chapter. | Seeded from PRD-001 §11. |
| T-07 | Dues contribution | (project-wide) | The total dollar amount an Alumni commits to pay toward dues for a job. Split evenly across the Actives the Alumni confirms actually did the work; the chapter treasurer credits each Active's dues balance off-app. | Seeded from PRD-001 §11. |
| T-08 | Recommended people count | (project-wide) | Non-binding number on a job posting indicating the rough scale of the work. Does not cap enrollment. | Seeded from PRD-001 §11. |
| T-09 | Enrollment | (project-wide) | The open sign-up phase for an approved job. Any Active can enroll until the Alumni locks the job. Enrollment is not a binding claim — the Alumni's attendee confirmation at completion is what determines dues credit. | Seeded from PRD-001 §11. |
| T-10 | Lock | (project-wide) | Alumni-initiated transition from `enrollment-open` to `locked`, fixing the work date and stopping further enrollment changes. Reversible via Reschedule. | Seeded from PRD-001 §11. |
| T-11 | Reschedule | (project-wide) | The path back from `locked` to `enrollment-open` when the date or roster needs to change before the job is performed. Alumni-initiated only; never automatic. | Seeded from PRD-001 §11. |
| T-12 | Treasurer recipient | (project-wide) | The configured per-instance address (e.g., `@sigoboard.org` for the launch chapter) that receives the Alumni's single Venmo for a job's dues, plus the in-app email notification with the dues split breakdown. Not an app role — no login, no UI. | Seeded from PRD-001 §11. |
| T-13 | Admin recipient | (project-wide) | The configured per-instance distribution address (e.g., `admins@sigoalumni.org` for the launch chapter) that receives dispute-notification emails. Not necessarily the same as the Treasurer recipient. | Seeded from PRD-001 §11. |
| T-14 | Audit log | (project-wide) | The per-job, append-only record of every state transition with timestamp + actor + optional note. Visible to Admins (PRD-001 R-13 d). | Seeded from PRD-001 §11. |
| T-15 | Chapter | (project-wide) | A single local instance of a Greek-letter organisation (e.g., one university's chapter). One SaaS instance == one chapter. | Seeded from PRD-001 §11. |
| T-16 | Fraternal organisation | (project-wide) | Generic term covering both fraternities and sororities. | Seeded from PRD-001 §11. |
| T-17 | Loop closure | (project-wide) | The moment a job moves to `closed`, recorded by either an enrolled Active or any Admin confirming the chapter treasurer received the Venmo. | Seeded from PRD-001 §11. |

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Tom Haynes | Initial entries seeded from PRD-001 §11 (Proposed). T-01..T-17 assigned. |
