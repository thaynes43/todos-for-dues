# Prompt for Claude Code agent — Execute PLAN-016 (job content enrichment)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent — load `.agents/profiles/developer.md` first.** Read this prompt, then begin.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`). v0.7.3+ deployed. MVP-FIX-A (`router.refresh()` after mutations) + MVP-FIX-B (UI polish) merged. This is the first FEATURE PR of the post-click-through wave: adding more fields to job postings so Actives can decide whether to enroll without out-of-band coordination.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Implement PLAN-016 (`docs/plans/016-job-content-enrichment-implementation.md`) end-to-end against PRD-010 (`docs/prds/010-job-content-enrichment.md`). One PR, `feat:` prefix, triggers minor bump → v0.8.0.

Five new fields on `jobs`: `poster_contact_kind`, `poster_contact_value`, `location`, `estimated_duration_hours`, `additional_notes`. Migration + tRPC + form + detail view + e2e. Stale-page invariant from MVP-FIX-A must stay intact.

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — the developer role.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md`.
4. `apps/web/AGENTS.md` (Next.js 16 reminder).
5. **`docs/prds/010-job-content-enrichment.md`** — the PRD. **All R-NN + AC-NN.**
6. **`docs/plans/016-job-content-enrichment-implementation.md`** — the plan you're executing.
7. **`docs/plans/016-job-content-enrichment-validation.md`** — what VALIDATION-016 will check; satisfy every gate proactively.
8. **`docs/prds/002-job-posting-and-moderation.md`** — the existing PRD-002 R-01..R-12 must continue to hold after your work (no regressions on existing posting behavior).
9. `packages/db/src/schema/jobs.ts` — the schema to extend.
10. `packages/db/migrations/` — see existing migrations for the conventions (Drizzle generates; you hand-edit only if needed).
11. `apps/web/components/PostJobForm.tsx` + `apps/web/components/JobDetailView.tsx` — the surfaces to extend.
12. `apps/web/components/RoleChangeDropdown.tsx` — the MVP-FIX-A pattern (your `post` mutation already has `router.refresh()`; verify and don't regress).

## What you do NOT do

- **Do not push directly to `main`** — branch protection rejects it.
- **Do not modify `docs/`** beyond PRD-010 changelog (if you append a "shipped" entry) and `designs/001-database-schema.md` (if updating the schema doc).
- **Do not modify `packages/domain/`** unless absolutely necessary. PRD-010 doesn't introduce new commands or transitions; the existing `createJob` helper takes the new field args.
- **Do not modify `packages/api/src/routers/`** outside the `jobs` router. Other routers are untouched.
- **Do not relax MVP-FIX-A.** Verify the `post` mutation still calls `router.refresh()`.
- **Do not relax iteration-2 hardening** (`prewarmRoutes`, `expect.timeout: 15_000`, `networkidle`/`load` waits, `demoteAllOtherAdmins` signature, `invites.spec.ts` UUID assertion, `signInAs` regex).
- **Do not bypass branch protection** (no `--admin`, no `--no-verify`).
- **Do not change the test DB engine** — PG16 via testcontainers per ADR-004.
- **Do not skip the 3× consecutive full-e2e run.**
- **Do not implement PRD-011 or PRD-012 in this PR** — those are PLAN-017 and PLAN-018 respectively, with their own prompts.

## Specific traps to watch for

**Trap 1 — Migration DEFAULTs must not become tRPC-layer defaults.**

The migration applies DB DEFAULTs (`'unknown'`, `1.0`, etc.) so the migration can apply on a populated DB. The tRPC layer must NEVER rely on those defaults — every new `post` must send explicit values. The DEFAULTs are a one-time backfill safety net only.

**Trap 2 — Test helpers (`postJob`, `seedJob`) breaking change.**

Existing e2e specs likely call `postJob(...)` helpers in `apps/web/e2e/*/support.ts`. After your schema change, those helpers MUST provide values for the new required fields. Lean: extend the helpers with optional args defaulting to sensible values (`'test-contact@example.com'`, `'Test Location'`, `1.5`, `null`). Don't update every spec; update the helpers.

**Trap 3 — Stale-page guard must still pass.**

After your work:
1. Posting a job and being redirected to the moderation queue (or `/my-postings`) — the new job appears without manual refresh.
2. The new fields render correctly on the detail view immediately after post.
3. Run `apps/web/e2e/mvp/stale-ui-after-mutation.spec.ts` (the MVP-FIX-A spec) — must still pass.

**Trap 4 — `numeric(4,2)` Drizzle type mapping.**

Drizzle maps Postgres `numeric` to TypeScript `string` by default (to preserve precision). The Zod schema receives a `string` from the API; convert with `parseFloat` if needed. Alternative: configure Drizzle to map to `number` at the schema level (`numeric(4,2)`, `{ mode: 'number' }`). Lean: `mode: 'number'` — the duration is a small bounded value; precision-as-string is overkill.

**Trap 5 — Pre-fill contact email — server-side, not client-side.**

The post-job form pre-fills the contact-value field with the logged-in user's email. Fetch this server-side (the page is a server component; `caller.X` has the session) and pass as a prop. DO NOT add a client-side `useSession()` round trip.

**Trap 6 — Privacy invariant R-06.**

If an Alumni's account email is `alumni@example.com` and they post with `contact_value = 'work@example.com'`, the detail view shows ONLY `work@example.com`. The account email must not leak anywhere on the page (not in a `<title>`, not in a `data-` attribute, not in a hidden form field). Verify with `page.content()` in the e2e spec OR a `grep` on the rendered HTML.

**Trap 7 — `tel:` link sanitization.**

For `contact_kind = 'phone'`, render as `<a href="tel:${sanitized}">${displayFormatted}</a>` where `sanitized` strips everything except digits + leading `+` + spaces. Don't allow user-input that could inject (e.g., `tel:+15551234567"><script>...`).

**Trap 8 — Cross-plan invariants.**

After your work:
- `pnpm -r typecheck` exits 0.
- `pnpm -r test` exits 0 (Vitest counts ≥ baseline; new tests may raise it).
- `pnpm --filter @app/domain test no-direct-state-writes` exits 0.
- `unset DATABASE_URL && pnpm --filter web build` exits 0.
- `pnpm --filter web e2e` exits 0 across **3 consecutive runs** under DEFAULT workers.

**Trap 9 — TDD discipline (the standing requirement).**

Write the new Playwright spec first. Run it BEFORE the form changes are in place; observe failure. Then add the form fields + detail view rendering. Re-run; spec passes. Document this in your report.

**Trap 10 — PR title.**

Recommended: `feat(web): job content enrichment — poster contact / location / duration / notes (PRD-010 / PLAN-016)`. `feat:` → minor bump → v0.8.0.

## PR-flow specifics

1. `git checkout main && git pull --ff-only origin main && git checkout -b plan-016-job-content-enrichment`.
2. Schema → migration → typecheck → migrate.
3. Zod input + tRPC procedure → typecheck.
4. **Write the new Playwright spec FIRST; run it; confirm failure.**
5. UI (PostJobForm + JobDetailView).
6. Re-run the new spec; passes.
7. Update e2e support helpers if test specs break; re-run full e2e.
8. Cross-plan invariants → 3× full e2e under DEFAULT workers.
9. Commit + push + open PR with the recommended title.
10. **Gate 1 — STOP.** Tell the user the PR is up + CI green + 3× local e2e green; await merge authorization.

**Do not merge yourself.**

## Definition of done

- [ ] Migration `packages/db/migrations/00XX_job_content_enrichment.sql` applies cleanly on a fresh DB.
- [ ] `packages/db/src/schema/jobs.ts` declares the 5 new columns.
- [ ] `packages/api/src/routers/jobs.ts:post` accepts + validates the 5 new fields per PRD-010 R-01, R-02; output schema includes them.
- [ ] `PostJobForm.tsx` collects the new fields; pre-fills contact-value from logged-in email; surfaces validation errors inline.
- [ ] `JobDetailView.tsx` renders all new fields; `tel:`/`mailto:` links correct; privacy invariant honored.
- [ ] New Playwright spec covers AC-01..AC-07 from PRD-010.
- [ ] Existing e2e specs still pass (helpers updated if needed).
- [ ] `pnpm --filter web e2e` 3× consecutively under DEFAULT workers — all green.
- [ ] Cross-plan invariants all green.
- [ ] MVP-FIX-A `router.refresh()` pattern intact on the `post` mutation.
- [ ] PR open against `main` with `feat(web):` title; required CI green; advisory `playwright` green.

## What to report back (under 350 words)

- PR URL + commit hash.
- The TDD failing-test run output before the UI was added.
- The migration's exact SQL.
- The `postJob` helper signature change you made.
- Confirmation 3× full e2e under DEFAULT workers all green — **state explicitly**.
- Confirmation each cross-plan invariant green.
- Anything that turned out non-obvious (e.g., a spec that needed deeper rework than just helper arg defaults).

## If you get stuck

Escalate with: (1) which step, (2) exact error, (3) what you tried, (4) your lean.

Particular escalation candidates:
- **Drizzle's `numeric` mapping yields `string` and the form code expects `number`** — surface; lean is `{ mode: 'number' }` at the column declaration.
- **Existing specs deep-call a helper that's hard to safely default** — surface the spec; lean is "extend helper with defaults" but if defaults break the spec's intent, the spec itself may need updating.
- **A pre-existing test was implicitly depending on the now-old schema** (e.g., expecting `null` for a column that's now NOT NULL) — surface; lean is to update the spec's seed data.

Begin.
