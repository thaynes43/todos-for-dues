# Prompt for Claude Code agent — Execute PLAN-017 (job editability before lock)

You are a fresh Claude Code agent. You have no prior conversation context. **You are a developer agent — load `.agents/profiles/developer.md` first.** Read this prompt, then begin.

> **Sequencing:** This prompt assumes prompt **038 (PLAN-016)** has been merged to `main`. The PRD-010 fields (poster contact, location, duration, notes) must exist on the `jobs` schema before this plan can extend them as "editable." If the PR-016 commit is not on `main`, STOP and tell the user.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS (Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright). v0.8.x deployed (PRD-010 shipped). This PR adds `EditJob`: posters can edit their job's content while it's in `awaiting_moderation` / `approved` / `enrollment_open`. Material edits demote → `awaiting_moderation`; cosmetic edits stay in state. Audit log captures every edit's diff.

## Working directory

`/Users/thaynes/src/projects/todos-for-dues`

## Your task

Implement PLAN-017 (`docs/plans/017-job-editability-pre-lock-implementation.md`) end-to-end against PRD-011. One PR. `feat:` prefix → minor bump → v0.9.0.

Key elements:
- ADR-008 addendum: 2 new FSM transitions `approved → awaiting_moderation`, `enrollment_open → awaiting_moderation` (command: `MaterialEditJob`).
- New `job_content_changes` audit table.
- New domain helper `editJob` (FSM-respecting; transactional).
- New tRPC procedure `jobs.edit`.
- New UI: `EditJobForm` modal + Edit button on `JobDetailView`.
- Notification: moderator email subject `[Re-review]`; per-Active edit-notification email.
- TDD spec.

## What to read FIRST (in order)

1. **`.agents/profiles/developer.md`** — §1–§7.
2. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`.
3. `/Users/thaynes/src/projects/todos-for-dues/CLAUDE.md`.
4. `apps/web/AGENTS.md`.
5. **`docs/prds/011-job-editability-pre-lock.md`** — the PRD. **All R-NN + AC-NN.**
6. **`docs/plans/017-job-editability-pre-lock-implementation.md`** — the plan.
7. **`docs/plans/017-job-editability-pre-lock-validation.md`** — what VALIDATION-017 will check.
8. **`docs/adrs/008-job-state-machine.md`** — the FSM. **You'll append an addendum to this file** (status remains Accepted; only the changelog + transitions table are updated per the PRD-011 Q-02 lean).
9. **`docs/adrs/009-audit-log-schema-and-retention.md`** — the audit table pattern.
10. `packages/domain/src/job-state-machine.ts` — the `JOB_TRANSITIONS` map. Add new arrows.
11. `packages/domain/src/transitions.ts` (or wherever `transitionJob`/`recordRelationshipEvent` live) — pattern to mirror for `editJob`.
12. `packages/api/src/routers/jobs.ts` — add `edit` procedure.
13. `packages/notifications/src/send-email.ts` + templates — extend.
14. `apps/web/components/JobDetailView.tsx` — add Edit button.
15. `apps/web/components/CancelJobModal.tsx` — pattern to mirror for `EditJobForm`.
16. `apps/web/components/RoleChangeDropdown.tsx` — the MVP-FIX-A reference for `router.refresh()`.

## What you do NOT do

- **Do not push directly to `main`** — branch protection.
- **Do not modify `docs/`** except: (a) append ADR-008 addendum (transitions table + changelog), (b) `designs/002-fsm-module.md` if FSM module shape changes, (c) PRD-011 changelog.
- **Do not modify PRD-002, PRD-004, PRD-005, etc.** Their R-NN are stable.
- **Do not modify `packages/domain/src/job-state-machine.ts:JOB_TRANSITIONS`** WITHOUT also updating the ADR-008 addendum. The two must move together; the static-analysis test in PLAN-003 verifies the FSM's authority.
- **Do not write direct UPDATEs to the `state` column.** All state changes via `transitionJob`. The `editJob` helper writes content fields via UPDATE (allowed) and dispatches state changes via `transitionJob` (required for material edits).
- **Do not bypass the audit log.** Every edit writes a `job_content_changes` row, in the same transaction as the UPDATE.
- **Do not relax MVP-FIX-A.** The new `edit` mutation MUST call `router.refresh()` + `invalidate()`.
- **Do not bypass branch protection.**
- **Do not implement PRD-012 in this PR** — that's PLAN-018 / prompt 042.

## Specific traps to watch for

**Trap 1 — ADR-008 addendum required for new transitions.**

The two new arrows (`approved → awaiting_moderation`, `enrollment_open → awaiting_moderation`) DO NOT exist today. ADR-008 is the authority. Per "ADRs immutable once Accepted" + "supersede with a new ADR" — but in this case, an **addendum** appending to ADR-008's changelog + transitions table is the lighter-touch pattern (the ADR's CORE decision — "use FSM with this map" — is unchanged; new transitions are an *extension*, not a *change of decision*). Surface in the PR body that this is an addendum; if the user prefers an ADR-013 superseding, refactor.

**Trap 2 — `no-direct-state-writes` invariant.**

PLAN-003's test scans for direct `UPDATE jobs SET state = ...` outside the FSM module. The `editJob` helper MUST:
1. Read the current job state (within the txn).
2. UPDATE content fields (allowed; state stays unchanged at this step).
3. If material → `transitionJob({ jobId, command: 'MaterialEditJob', actorId })` — this writes the state-transition audit row.
4. INSERT `job_content_changes` audit row.
5. Commit.

The state change happens through `transitionJob`. The static-analysis test must stay green.

**Trap 3 — Atomicity.**

All of (2), (3), (4) MUST happen in ONE `db.transaction(...)`. If `sendEmail` (out-of-txn) fails after commit, that's OK (the DB is consistent; the email retry is a separate concern). If anything inside the txn fails, the whole edit rolls back.

**Trap 4 — Diff in `job_content_changes`.**

Per PLAN-017 Q-PLN-04 lean: store ONLY changed fields, not unchanged. Compute the diff against the read-row, JSON-encode the before/after map (e.g., `{ "description": { "before": "old", "after": "new" } }`).

**Trap 5 — Material vs. cosmetic — PRD-011 R-05 exact list.**

Material: `description`, `dues_cents`, `recommended_people_count`, `location`, `estimated_duration_hours`. Anything else (notes, contact fields) → cosmetic. If the edit modifies any material field, it's material — even if it also modifies cosmetic fields.

**Trap 6 — Stale-page assertion is CRITICAL (per user's repeated emphasis).**

The `EditJobForm`'s mutation `onSuccess` MUST call:
```ts
await utils.jobs.getById.invalidate({ jobId });
await utils.jobs.listX.invalidate(); // as needed
router.refresh();
```
The Playwright spec MUST explicitly assert "new value appears WITHOUT `page.reload()`":
```ts
await editForm.getByTestId('edit-description-input').fill('Updated');
await editForm.getByTestId('edit-submit').click();
// DO NOT call page.reload() here
await expect(page.getByTestId('job-description')).toHaveText('Updated', { timeout: 5_000 });
```
If the assertion times out, the bug is back — surface immediately.

**Trap 7 — Enrolled-Active notification email — one per Active.**

For a material edit on a job with N enrollees: send N emails (one per Active). Use the existing `sendEmail` adapter; iterate the enrolled list. No batching for MVP.

**Trap 8 — Moderator email subject prefix.**

Re-moderation: subject `[Re-review] New posting awaits moderation` (or whatever the existing subject is, with `[Re-review] ` prepended). Use the `subjectPrefix` arg on the existing `sendModeratorQueueEmail` (you may need to add this arg if it doesn't exist).

**Trap 9 — TDD discipline.**

Write the new spec first. Run; observe failure. Implement domain → tRPC → UI. Re-run; passes.

**Trap 10 — Cross-plan invariants.**

After your work:
- `pnpm -r typecheck` exits 0.
- `pnpm -r test` exits 0 (Vitest counts ≥ baseline; new domain + notification + e2e tests raise it).
- `pnpm --filter @app/domain test no-direct-state-writes` exits 0. ← Critical given the new domain helper.
- `unset DATABASE_URL && pnpm --filter web build` exits 0.
- `pnpm --filter web e2e` exits 0 across **3 consecutive runs** under DEFAULT workers.
- PLAN-016's stale-UI specs all still pass (no regression on existing mutation buttons).

**Trap 11 — PR title.**

Recommended: `feat(web): job editability before lock (PRD-011 / PLAN-017) — EditJob command + re-moderation + diff audit`. `feat:` → minor bump.

## PR-flow specifics

1. `git checkout main && git pull --ff-only origin main`. **Verify PRD-010 / PLAN-016 commit is present** (`git log --oneline -10`). If not, STOP and tell the user.
2. `git checkout -b plan-017-job-editability`.
3. ADR-008 addendum + `JOB_TRANSITIONS` update + domain `editJob` helper + tests.
4. Schema migration (`job_content_changes` table).
5. tRPC `jobs.edit` procedure.
6. **Write Playwright spec FIRST; run; confirm failure.**
7. UI: `EditJobForm` + JobDetailView Edit button.
8. Notification emails.
9. Re-run spec; passes.
10. Run cross-plan invariants → 3× full e2e under DEFAULT workers.
11. Commit + push + open PR.
12. **Gate 1 — STOP.**

**Do not merge yourself.**

## Definition of done

- [ ] ADR-008 addendum appended; transitions table + changelog updated.
- [ ] `JOB_TRANSITIONS` map matches the addendum.
- [ ] Migration `00XX_job_content_changes.sql` creates the new table + index.
- [ ] `packages/domain/src/transitions.ts:editJob` helper exists; tests pass.
- [ ] `no-direct-state-writes` invariant green.
- [ ] `packages/api/src/routers/jobs.ts:edit` procedure wired; RBAC poster-only; state gate per R-04.
- [ ] `EditJobForm.tsx` exists; modal with pre-populated fields; `onSuccess` does `invalidate()` + `router.refresh()`.
- [ ] `JobDetailView.tsx` Edit button visible only for poster in editable states (R-01/R-02).
- [ ] Email: `[Re-review]` prefix on re-moderation; per-Active edit notification.
- [ ] Playwright spec `edit-job.spec.ts` covers AC-01..AC-07 + **stale-page assertion** (Trap 6).
- [ ] `pnpm --filter web e2e` 3× consecutively under DEFAULT workers — all green.
- [ ] Cross-plan invariants all green.
- [ ] PR open against `main` with `feat(web):` title; required CI green.

## What to report back (under 350 words)

- PR URL + commit hash.
- TDD failing-test run output before the UI was added.
- The new transition arrows in `JOB_TRANSITIONS` (exact code snippet).
- The `editJob` helper's transaction shape (one-paragraph summary).
- The diff JSON shape (one example: input edit → output diff).
- Confirmation `pnpm --filter web e2e` 3× under DEFAULT workers all green — **state explicitly**.
- Confirmation each cross-plan invariant green, including `no-direct-state-writes`.

## If you get stuck

Escalate with: (1) which step, (2) exact error, (3) what you tried, (4) your lean.

Particular candidates:
- **`no-direct-state-writes` test fails on the new helper** — the helper accidentally does `UPDATE jobs SET state = ...` directly. Lean: route state changes through `transitionJob`; the static-analysis test's regex should pass cleanly.
- **`MaterialEditJob` command isn't recognized by `transitionJob`** — you need to register it in the FSM map AND the command type union. Both files; ADR-008 addendum + `JOB_TRANSITIONS` + the `JobCommand` type.
- **The stale-page assertion fails in the spec** — `EditJobForm` is missing `router.refresh()` or the page isn't a server component (rare; verify the page's top declaration).
- **Enrolled-Active notification volume concerns** — surface; coordinator decides whether to ship as-is (one email per material edit per Active) or add throttling.

Begin.
