---
id: PRD-010
title: Job content enrichment — creator, contact, location, duration on the job detail view
status: Draft
author: Tom Haynes
reviewers: []
created: 2026-05-20
last_updated: 2026-05-20
size: S
related:
  parent_prd: PRD-001
  parent_requirements: [R-03]
  adrs: [ADR-003, ADR-004]
  flows: []
  designs: [designs/001-database-schema.md, designs/006-ui-components.md]
  bounded_contexts: []
  prds: [PRD-002, PRD-009]
  supersedes: null
---

## 1. Objective

> **Problem:** Today an Active viewing a job sees only `description + recommended count + dues amount`. There's no way to know **who** posted it, **how to contact them** about practical details, **where** the job is, or **how long** it will take. That gap makes the "I'd take this job if I knew X" decision impossible — so jobs sit in `enrollment_open` longer than they should, or get enrolled and then renegotiated out-of-band before lock.
> **Audience:** Active (deciding whether to enroll), Alumni (posting with enough context that someone will), Moderator (reviewing whether the posting is concrete enough to approve).
> **Why now:** Post-deploy click-through (2026-05-20) surfaced this as the #1 blocker to actual enrollment behavior on the live instance. Before adding more capabilities (#2 edits, #5 real-time), the posting itself needs to carry the information a chapter would actually act on.
> **One-sentence definition of success:** Any Active opening a job's detail view can decide whether to enroll without leaving the app to ask someone "what is this actually?"

## 2. Background & context

- **Decomposes:** PRD-001 R-03 (Alumni create job postings). PRD-002 §5 captures the current minimal field set (R-01..R-04); PRD-010 extends it with the practical-details fields a chapter actually needs.
- **Does NOT touch:** PRD-009 (post-match coordination channel). PRD-009 is about how a matched Active and Alumni continue coordinating *after* enrollment; PRD-010 is about what an Active sees *before* enrollment to make the decision in the first place. The two complement each other but the boundary is "have they enrolled yet?"
- **Tech stack assumed accepted:** ADR-003 (tRPC), ADR-004 (Postgres + Drizzle). New columns on `jobs` table — a Drizzle migration that adds nullable columns + a backfill default is the standard pattern. PLAN-016 §3 owns the migration.
- **Audit log:** new fields' INSERT is part of the existing `createJob` audit trail (ADR-009 schema unchanged — the audit payload is JSON, so new fields slot in without schema change).
- **Roles assumed in place:** unchanged from PRD-002.

## 3. Personas & user scenarios

### 3.1 Personas

Inherited from PRD-001 §4.1.

### 3.2 Scenarios / user stories

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As an **Alumni**, I want to enter my contact info, the job's location, and the estimated duration when I post a job, so that an Active can decide whether to enroll without messaging me first. | P0 |
| US-02 | As an **Active** viewing a job's detail page, I want to see who posted it, how to reach them, where the job is, and how long it will take, so that I can decide whether to enroll. | P0 |
| US-03 | As a **Moderator** reviewing the moderation queue, I want to see the enriched job fields, so that I can reject jobs that are too vague to be actionable. | P1 |

## 4. Requirements

| ID | Decomposes | Requirement | Priority | Linked stories | Notes |
|----|-----------|-------------|----------|----------------|-------|
| R-01 | PRD-001 R-03 | When an Alumni submits a job posting, the system shall require the posting form to capture: poster contact (email OR phone — at least one), job location (free-form text, 1..200 chars), estimated duration in hours (decimal, > 0 and ≤ 24). | P0 | US-01 | Poster's *name* is auto-derived from the logged-in user's `displayName` — not entered on the form. **Contact policy:** the Alumni's account email is the default contact channel; if the Alumni wants a different contact method displayed (e.g., phone), they enter it explicitly in the form. See Q-01. |
| R-02 | PRD-001 R-03 | If the posting form is submitted without a contact value, or with an empty/whitespace-only location, or with a duration outside (0, 24], the system shall reject the submission with a validation error citing the offending field. | P0 | US-01 | Same validation surface pattern as PRD-002 R-02/R-03/R-04 (Zod on the tRPC procedure). Validation errors must surface inline in the form (per the PRD-MVP-FIX bug #7 lesson — never silent). |
| R-03 | PRD-001 R-03 | The system shall display, on every job's detail view, the poster's display name, the contact value the poster supplied (labeled as email or phone), the job location, and the estimated duration. | P0 | US-02, US-03 | These fields render on `/jobs/[id]` for any role that can see the job (per existing role-projection rules). Active sees them BEFORE enrolling. |
| R-04 | PRD-001 R-03 | The system shall persist the new posting fields on the `jobs` row at creation time. The audit-log inception row (ADR-009) shall include these fields in its JSON payload alongside the existing description/dues/count snapshot. | P0 | US-01 | Migration adds columns: `poster_contact_kind` (`email`\|`phone`), `poster_contact_value` (text), `location` (text), `estimated_duration_hours` (numeric). All NOT NULL with no DB defaults (validated by R-01 at the tRPC layer). |
| R-05 | PRD-001 R-03 | Where the poster's chosen contact kind is `email`, the system shall render the value as a `mailto:` link on the job detail view. Where the contact kind is `phone`, the system shall render it as a `tel:` link, with the value lightly normalized for display (digits and `+`/spaces only). | P1 | US-02 | Convenience UX — one-tap-to-call/email from the job detail view. Sanitization keeps `tel:` from being a vector for URL injection. |
| R-06 | PRD-001 R-03 | The system shall NOT expose the poster's account email if the poster supplied a different contact value (e.g., a phone or a different email). Only the value the poster explicitly entered is shown. | P0 | US-01, US-02 | Privacy invariant: the user's *account* email may be the same as the *posting contact*, but the system shows what the poster put in the form, never the account email separately. |
| R-07 | PRD-001 R-03 | Where the poster optionally provides an `additional_notes` field on the posting form (free-form text, 0..500 chars), the system shall persist it and display it on the job detail view. | P1 | US-01, US-02 | Optional escape valve for context that doesn't fit other fields (e.g., "garage door doesn't lock — text 10 min before arriving"). |

### 4.1 Acceptance criteria

- **AC-01** — covers R-01, R-02, R-04
  - **Given** an authenticated Alumni on the post-job form
  - **When** they submit valid description + dues + count + contact (email) + location + duration
  - **Then** the job row is created with all six fields populated; the audit-log inception row's payload contains all six.
- **AC-02** — covers R-02 (negative — missing contact)
  - **Given** an authenticated Alumni on the post-job form
  - **When** they submit with description + dues + count + location + duration but no contact value
  - **Then** the form rejects with a validation error citing the contact field; no DB row is created.
- **AC-03** — covers R-02 (negative — invalid duration)
  - **Given** an authenticated Alumni on the post-job form
  - **When** they submit with `estimated_duration_hours = 0` (or `25`, or empty)
  - **Then** the form rejects with a validation error citing the duration field.
- **AC-04** — covers R-03
  - **Given** an Active viewing `/jobs/[id]` for a job in any visible state
  - **When** the page renders
  - **Then** the detail view shows the poster's `displayName`, the contact value (labeled email/phone), the location, the estimated duration, and any optional notes — in addition to the existing description/dues/count.
- **AC-05** — covers R-05
  - **Given** a job posted with `contact_kind = phone` and `contact_value = '+15551234567'`
  - **When** an Active views the detail page
  - **Then** the rendered contact is a `<a href="tel:+15551234567">+1 555 123 4567</a>` (display formatting is best-effort; the `href` is exactly the sanitized digits + leading `+`).
- **AC-06** — covers R-06
  - **Given** an Alumni with account email `alumni@example.com` posts a job with `contact_value = 'cell-only@example.com'` (a different email)
  - **When** an Active views the job
  - **Then** the displayed contact is `cell-only@example.com`; `alumni@example.com` is NOT visible anywhere on the page.
- **AC-07** — covers R-07
  - **Given** an Alumni posts a job with `additional_notes = 'Door key under the mat'`
  - **When** an Active views the detail page
  - **Then** the notes render in a dedicated section labeled "Additional notes." If `additional_notes` is empty/null, no section renders (no empty label).

## 5. User experience

- The post-job form gains four new fields in this order: contact type (select: `email`/`phone`), contact value, location, estimated duration, additional notes. Place above the submit button, below the existing description/dues/count cluster.
- Default contact value is the poster's account email, pre-filled. Poster can change it; the displayed value is whatever's in the form at submit time.
- Job detail view gets a new "Job details" card above the existing description/dues card. Show: poster name + contact link + location + duration. If `additional_notes` is non-empty, render below in a separate card or section.
- Empty / loading / error states: validation errors render inline next to each field (per the lessons-learned from MVP-FIX #7).
- **STALE-PAGE INVARIANT:** any mutation that changes job content (post, edit per PRD-011, cancel, etc.) MUST trigger a `router.refresh()` on the host page so server-rendered detail views update. See the MVP-FIX-A reference pattern.

## 6. Scope boundaries

### 6.1 Non-goals

- **Structured address.** Location is a free-form string; no street-address parsing, no maps, no geocoding. (If you want a map link, you can paste a Google Maps URL into `additional_notes`.)
- **Multiple contacts.** One contact per posting. If the Alumni wants both an email and a phone, they put one in `additional_notes`.
- **Phone-number validation.** We accept whatever the Alumni types, sanitize for `tel:` display (digits + `+`/spaces only), and trust them to get it right. No SMS / regional formatting.
- **Editing the contact / location / duration after post.** Owned by PRD-011 (editability before lock). PRD-010 only adds the fields; their lifecycle is PRD-011's scope.
- **Required-field tightening on legacy jobs** (those posted before this PRD ships). PLAN-016's migration backfills sensible defaults; no chapter currently has legacy production jobs (launch chapter is fresh). See R-08 in §6.2.

### 6.2 DO NOT CHANGE

| Concern | Owned by | Reason it's locked |
|---------|----------|---------------------|
| Job FSM state transitions | PRD-001 R-07, ADR-008 | Adding fields doesn't change the state machine. |
| Moderation queue ordering / approve-reject controls | PRD-002 R-06..R-10 | This PRD adds fields; doesn't change moderator behavior. |
| Enrollment / lock semantics | PRD-004 | Unchanged. |
| Audit-log row shape | ADR-009 | The payload is JSON; new fields slot in without schema change. The row shape itself is locked. |
| Email delivery via Resend | ADR-005, PRD-002 R-12, PRD-007 | Notifications may reference new fields in body templates; that's a copy update, not a delivery-mechanism change. |
| **Stale-UI router.refresh() pattern** | MVP-FIX-A | Any new mutation MUST follow the established pattern. |

## 7. Assumptions & dependencies

- **Assumption:** Launch chapter has no production-data legacy job rows to backfill — the migration can apply NOT NULL constraints after a one-time backfill with `'unknown'` placeholders. *If false:* migration must do a per-row interactive backfill or a phased rollout (NULL → backfill → NOT NULL).
- **Assumption:** Poster's account email is a sensible default for the contact field. *If false:* drop the pre-fill; force explicit entry.
- **Assumption:** 200-char location and 500-char additional-notes limits are generous enough for typical use. *If false:* bump limits in a future amendment; no schema work needed (text columns are unbounded; the cap is at the Zod layer).
- **Depends on:** ADR-004 (Postgres + Drizzle) for the migration. PRD-002 for the existing posting form to extend.

## 8. Risks & open questions

| ID | Question / risk | Owner | Needed by |
|----|-----------------|-------|-----------|
| Q-01 | Default contact policy: pre-fill the account email vs. force explicit entry vs. ask once at signup and reuse? Lean: **pre-fill** (low friction; user can change). | Tom | 2026-05-22 |
| Q-02 | Display name of the poster — `displayName` from the user profile, or a separate "post as" field? Lean: **`displayName`** (single source of truth; user can edit their profile if they want a different display). | Tom | 2026-05-22 |
| Q-03 | Should the moderator-queue email (PRD-002 R-12) include the new fields in its body? Lean: **yes** — a moderator should be able to see "is this enough info" without clicking through. | Tom | 2026-05-25 |
| Q-04 | `additional_notes` empty vs. null in DB — affects index strategy and how the Drizzle schema models it. Lean: **null when empty** (idiomatic; no special-casing in the read path). | Tom | 2026-05-22 |
| Q-05 | Should `estimated_duration_hours` round trip as decimal (`1.5`) or be constrained to half-hour increments (`30`-minute integers)? Lean: **decimal**, free-form. | Tom | 2026-05-22 |

## 9. Release plan

- **Walking skeleton:** R-01..R-04 (form accepts new fields, persists them, displays on detail view).
- **MVP:** R-05..R-07 (link rendering, privacy invariant, notes section).
- **Post-MVP:** none — this PRD is small.
- **Rollout:** ship as part of v0.8.x. Migration applied during the standard deploy flow (migrate init container, per PLAN-009).
- **Reversibility:** the migration is additive (new columns); rolling back requires a new migration that drops the columns. No data loss in either direction.

## 10. Glossary changes

- **`poster_contact_kind`** — enum (`email` \| `phone`) on the job row; T-NN to be assigned.
- **`poster_contact_value`** — string field on the job row capturing the Alumni's chosen contact channel for this posting; T-NN to be assigned.
- **`estimated_duration_hours`** — decimal field on the job row capturing the Alumni's estimate of total job duration in hours; T-NN to be assigned.

## 11. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-20 | Tom Haynes | Initial Draft. Created post-click-through to capture user-reported gap #1 (job detail missing creator/contact/location/duration). |
