---
id: PLAN-016
title: Job content enrichment — implementation
status: Proposed
author: Coordinator
created: 2026-05-20
last_updated: 2026-05-20
related:
  prds: [PRD-010]
  adrs: [ADR-003, ADR-004, ADR-009]
  designs: [designs/001-database-schema.md, designs/006-ui-components.md]
  plans:
    prerequisite: []
    paired_validation: 016-job-content-enrichment-validation
---

## 1. Goal

Implement PRD-010 (job content enrichment) end-to-end: schema migration adds 5 columns to `jobs`, tRPC posting procedure accepts and validates the new fields, post-job form captures them, job detail view renders them.

**Success:** an Alumni can post a job with poster contact, location, duration, and (optional) additional notes; an Active viewing the job sees all of these fields rendered correctly; the audit-log inception row includes the new fields in its JSON payload.

## 2. Inputs

### 2.1 Documents the agent must read first

1. `docs/prds/010-job-content-enrichment.md` — the PRD. **The full set of R-NN + AC-NN this plan implements.**
2. `docs/prds/002-job-posting-and-moderation.md` — the parent PRD. PRD-010 extends PRD-002's posting form; the existing R-NN must continue to hold.
3. `docs/adrs/004-db-and-orm.md` — Drizzle migration conventions.
4. `docs/adrs/009-audit-log-schema-and-retention.md` — the audit payload is JSON; new fields slot in without schema change to existing audit rows.
5. `docs/designs/001-database-schema.md` — the `jobs` table schema. Update this design doc in PR with the new columns + Q-PLN-01 lean.
6. `docs/designs/006-ui-components.md` — UI component patterns. Both the post-job form (PostJobForm) and the job detail view (JobDetailView) live here.
7. `packages/db/src/schema/jobs.ts` — the Drizzle schema. The migration adds columns here.
8. `packages/db/migrations/` — existing migration files. Number the new migration `0009_*.sql` (or next-available).
9. `apps/web/components/PostJobForm.tsx` — the existing form. Extend it.
10. `apps/web/components/JobDetailView.tsx` — the existing detail view. Render new fields.
11. `packages/api/src/routers/jobs.ts` — the tRPC procedure `post`. Extend the input Zod + the create logic.

### 2.2 Repo state assumed

- v0.7.3 image in GHCR; main branch reflects v0.7.3 + MVP-FIX-A + MVP-FIX-B + this work's predecessor PRs.
- MVP-FIX-A `router.refresh()` pattern is established in `RoleChangeDropdown.tsx` and all `apps/web/components/*.tsx` mutation buttons.
- Existing e2e suite is single-invocation collapsed (per PLAN-013 §3.1 #3 closeout).

## 3. Outputs

### Track A — Schema migration

- New migration `packages/db/migrations/0009_job_content_enrichment.sql`:
  - `ALTER TABLE jobs ADD COLUMN poster_contact_kind TEXT NOT NULL DEFAULT 'email' CHECK (poster_contact_kind IN ('email', 'phone'));`
  - `ALTER TABLE jobs ADD COLUMN poster_contact_value TEXT NOT NULL DEFAULT 'unknown';`
  - `ALTER TABLE jobs ADD COLUMN location TEXT NOT NULL DEFAULT 'unknown';`
  - `ALTER TABLE jobs ADD COLUMN estimated_duration_hours NUMERIC(4,2) NOT NULL DEFAULT 1.0 CHECK (estimated_duration_hours > 0 AND estimated_duration_hours <= 24);`
  - `ALTER TABLE jobs ADD COLUMN additional_notes TEXT NULL;`
  - (defaults are present so the migration applies cleanly; the tRPC layer enforces real values for new posts. Existing rows — if any — get the defaults; launch chapter is fresh so this is moot.)
- Update `packages/db/src/schema/jobs.ts` to declare the new columns.
- Verify via `pnpm --filter @app/db generate` that the migration matches the schema (regenerate if needed).

### Track B — Domain + tRPC

- Update the `createJob` domain helper in `packages/domain` if it exists with a typed input shape; otherwise the field expansion happens at the tRPC layer.
- Extend `packages/api/src/routers/jobs.ts:post` (or `create`, whatever the procedure name is):
  - Zod input: add `posterContactKind` (`z.enum(['email', 'phone'])`), `posterContactValue` (`z.string().min(1).max(200)`), `location` (`z.string().min(1).max(200)`), `estimatedDurationHours` (`z.number().positive().max(24)`), `additionalNotes` (`z.string().max(500).optional().nullable()`).
  - Add per-field validation per PRD-010 R-02.
  - On creation, persist the new fields. The audit-log inception row's JSON payload includes them (the existing audit machinery uses `JSON.stringify(row)`, so this is automatic — but verify).
- Update the `jobs.getById` procedure output schema to include the new fields (Zod output type extension).

### Track C — UI

- **PostJobForm:** add four form fields (contact-kind select, contact-value input, location input, duration input) + optional notes textarea. Place above the submit button. Pre-fill contact-value with the logged-in user's email per PRD-010 Q-01 lean. Surface validation errors inline (same pattern as PRD-002 form errors).
- **JobDetailView:** add a "Job details" card rendering poster `displayName` + contact link (`mailto:` or `tel:`) + location + duration. If `additionalNotes` is non-null, render below in a separate card.
- **Stale-page invariant:** the `post` mutation already calls `router.refresh()` (per MVP-FIX-A); verify it still does. No new mutation buttons in this PR; just extending existing surfaces.

### Track D — Playwright e2e

- New spec `apps/web/e2e/walking-skeleton/post-job-enriched.spec.ts` (or extend `post-job.spec.ts`):
  - Submits a job with all PRD-010 fields populated.
  - Asserts the job detail view shows them.
  - Negative-case spec: missing contact, missing location, out-of-range duration → form rejects with inline error.
- Update existing `post-job.spec.ts` baseline to include the new fields (otherwise existing spec breaks).

## 4. Steps

### Step 0 — Branch off latest `origin/main`

```sh
git fetch origin main && git checkout main && git pull --ff-only origin main
git checkout -b plan-016-job-content-enrichment
```

### Step 1 — Schema migration first

1. Edit `packages/db/src/schema/jobs.ts` to add the 5 new columns.
2. `pnpm --filter @app/db generate` — Drizzle generates the migration SQL.
3. Inspect the generated SQL; make sure DEFAULT + CHECK clauses are present and correct. Hand-edit if Drizzle's default format isn't enough.
4. `pnpm --filter @app/db migrate` against a local DB; verify the columns appear.
5. `pnpm --filter @app/db test` — passes.

### Step 2 — tRPC procedure + Zod inputs

1. Extend `jobs.post` input Zod with the 5 new fields per Track B.
2. Add the per-field validation (same Zod patterns as existing form fields).
3. Verify `pnpm --filter @app/api test` passes.

### Step 3 — UI (form + detail view)

1. Extend `PostJobForm.tsx` with the new fields.
2. Extend `JobDetailView.tsx` with the new "Job details" card.
3. Run `pnpm --filter web build` (with `DATABASE_URL` unset) — passes the lazy-Proxy invariant.

### Step 4 — Playwright e2e (TDD-style: write the spec, watch it fail, then fix)

1. **Before any UI implementation, write the new Playwright spec.** Run it against the current main: expect failure (the UI doesn't show the new fields).
2. Implement the form + detail view (Step 3).
3. Re-run the spec — passes.
4. Run `pnpm --filter web e2e` **3× consecutively** under DEFAULT workers — all green.

### Step 5 — Update existing specs that posted jobs

The existing `post-job.spec.ts` and any other spec that uses `seedJob` / `postJob` test helpers must be updated to provide values for the new required fields (or the helpers need sensible defaults — see Trap 5).

### Step 6 — Cross-plan invariants

- `pnpm -r typecheck` — green.
- `pnpm -r test` — green.
- `pnpm --filter @app/domain test no-direct-state-writes` — green.
- `unset DATABASE_URL && pnpm --filter web build` — green.

### Step 7 — Commit + push + open PR

PR title: `feat(web): job content enrichment — contact / location / duration / notes (PRD-010)`. `feat:` triggers a minor bump → v0.8.0 (since v0.7.x landed `fix:` only).

### Step 8 — GATE 1 — STOP for user review

Wait for explicit merge authorization.

## 5. Verification (end-to-end)

- [ ] VALIDATION-016 passes — every AC mapping green.
- [ ] All new PRD-010 R-NN are wired (R-01..R-07).
- [ ] All AC-01..AC-07 have corresponding Playwright assertions.
- [ ] Migration applies cleanly on a fresh DB (`pnpm --filter @app/db migrate`) and on a populated DB (no data loss).
- [ ] Cross-plan invariants all green.
- [ ] Live smoke (post-deploy) shows the new fields on the job detail view.

## 6. Out of scope

- **Editing the new fields after post.** Owned by PLAN-017 (PRD-011).
- **Real-time updates of the new fields across sessions.** Owned by PLAN-018 (PRD-012).
- **Moderator-queue email body update to include the new fields.** PRD-010 Q-03 lean is yes; if accepted, slot into PLAN-016 Step 2.5; if deferred, leave the existing moderator email body unchanged.

## 7. Risks & gotchas

### Risk 1 — Migration DEFAULTs conflict with the tRPC layer's "no defaults" stance

The migration applies DEFAULTs so existing rows (if any) can be filled in without manual data work. The tRPC layer rejects missing values for new posts. Make sure the tRPC layer always sends explicit values — never relies on the DEFAULT.

### Risk 2 — `additionalNotes` null-vs-empty-string handling

Per PRD-010 Q-04 lean: null when empty. Make sure the form sends `null` (or omits the field) when the user enters nothing, and the UI doesn't render an empty "Additional notes" section for null values.

### Risk 3 — Pre-fill of contact email

Pre-filling from the logged-in user's email requires the form to know the current user. Make sure the form component receives this via props or via a server-component wrapper, NOT via a fresh tRPC query in the form (that's a needless round-trip; the page already has the user).

### Risk 4 — Test helpers (`postJob`, `seedJob`) compatibility

Many existing e2e specs call test helpers to seed jobs. After this PR, those helpers MUST provide values for the new required fields. Either (a) update the helpers to accept new optional args with sensible defaults, or (b) update every spec that calls them. Lean: (a) — change the helper, default values like `'test-contact@example.com'`, `'Test location'`, `1.5`, `null`.

### Risk 5 — Cross-plan invariants

PostJobForm + JobDetailView edits could ripple into specs across walking-skeleton + mvp + admin suites. Run the full e2e 3× under DEFAULT workers (per PR #36's bar) to catch.

## 8. Resume points

- After Step 0: branch.
- After Step 1: migration applied; schema updated.
- After Step 2: tRPC accepts new fields.
- After Step 3: UI renders new fields.
- After Step 4: e2e green.
- After Step 6: invariants green.
- After Step 7: PR opened.
- After Step 8: Gate 1.

## 9. Open questions

| ID | Question | Lean / next action |
|----|----------|--------------------|
| Q-PLN-01 | Should the `jobs` table use `numeric(4,2)` for `estimated_duration_hours` or just `real`? Lean: `numeric(4,2)` for exact decimal arithmetic (no floating-point surprises). | Use `numeric(4,2)` per migration above. |
| Q-PLN-02 | Should the `additional_notes` field be limited to 500 chars at the DB layer or only the Zod layer? Lean: **Zod only** — the DB column is unbounded `text`; Zod enforces; if Zod changes the limit, no migration needed. | Zod-only; DB column = `text`. |
| Q-PLN-03 | Pre-fill contact-value from account email — fetched server-side (RSC) or client-side (`useSession`)? Lean: **server-side** (zero extra round-trip; already loaded for auth gate). | RSC wrapper passes the email as a prop. |
| Q-PLN-04 | Inline error display pattern — re-use the existing form-error pattern? Lean: **yes** — `<p role="alert">` next to each field. | Match `EnrollButton.tsx:32-36` pattern. |
| Q-PLN-05 | Moderator email body include new fields (PRD-010 Q-03)? Lean: yes; slot in here. | Defer to user confirmation; if yes, +1 step. |

## 10. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-05-20 | Coordinator | Initial Proposed. Implements PRD-010 in one PR. |
