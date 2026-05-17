# Coordinator self-handoff — 2026-05-17 evening (post PLAN-009 closeout, PLAN-010 prompts ready)

> **You are reading a handoff to yourself.** The conversation cache that produced this state has expired and you are starting cold to continue overseeing TODOs for Dues. **The immediate situation: PLAN-009 is fully validated + closed out, PLAN-010 prompts are written and waiting for the user to kick off the execute agent.**

## Identity & role

You are the **coordinator** for the TODOs for Dues project. Full role description at `.agents/profiles/coordinator.md` (read it if you need the refresher). Short version:

1. Write kickoff prompts for fresh execute + validate agents.
2. Read their reports, verify against git, decide: clean → next prompts; issue → diagnose + edit affected docs.
3. Write self-handoffs (like this one).

You do NOT write production code. **Branch protection is ON `main`** — your own commits land via PR + squash-merge after CI green. The user pushes / merges.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Sigma Phi Omicron, UMass Lowell). Alumni post small jobs ("TODOs") with a dues contribution; Actives claim them; Moderators approve; Admins manage. Off-app Venmo. Tech: Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`.

**Live instance:** `https://todos-for-dues.haynesops.com` (Phase 1.1 internal; image `ghcr.io/thaynes43/todos-for-dues:v0.2.2`).

**Working directories:**
- This repo: `/Users/thaynes/src/projects/todos-for-dues`
- GitOps repo: `~/src/labspace/haynes-ops/`

## What you MUST read on cold start (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — durable user preferences.
2. `.agents/profiles/coordinator.md` — role description.
3. `CLAUDE.md` (repo root) — canonical context, including the `## Pull-request flow (NORMATIVE)` + `## Release versioning (release-please)` sections from PLAN-009.
4. `apps/web/AGENTS.md` (one line) — "This is NOT the Next.js you know."
5. `docs/PROCESS.md` — docs-first SDLC.
6. `docs/plans/COVERAGE.md` — coverage matrix.
7. `git log --first-parent main --oneline -25` + `gh pr list --state open` — see what's open + landed.
8. **The most recent prompts:** `.agents/prompts/021-execute-plan-010.md` + `022-validate-plan-010.md`.
9. **Prior handoffs:** `.agents/context/00{1..6}-coordinator-handoff-*.md` (skim).

## Current state (snapshot at end of 2026-05-17)

### Plans executed + validated (✅ on main)

- **PLAN-001..007** — all green, no changes from prior handoffs.
- **PLAN-008** — walking-skeleton E2E (chained Playwright + OIDC mock + 4 SSO + `nextCookies` + test isolation + Resend test seam). 4 deviations folded into PLAN-008 changelog: route at `/api/test/` (not `/api/_test/`), consolidated `sso.spec.ts` serial mode, `requireLocalEmailVerified: false` on accountLinking, `bootstrap-admin.spec.ts` skipped.
- **PLAN-009** — first chapter deploy. Live at `https://todos-for-dues.haynesops.com` running `v0.2.2`. Validator passed 16/19 §6 gates; 3 user-driven gates DEFERRED to a post-PLAN-012 pre-beta validation plan (now flagged in VALIDATION-009 §7.1 + PLAN-013 §3.1 backlog). Probe commit `4e2ea9e "test: protection probe"` is permanently in main history — empty, harmless artefact from the validator's "live test" of branch protection (admin-bypassable per intentional `enforce_admins: false`).

### Plans NOT yet executed

- **PLAN-010** MVP job-loop UI completion (rejection / reschedule / cancel / unenroll / revert / dispute / list views) — **prompts written and ready** at `.agents/prompts/021-execute-plan-010.md` + `022-validate-plan-010.md`. This is the next plan in the queue.
- **PLAN-011** Admin view UI.
- **PLAN-012** Role management UI.
- **PLAN-013** live-instance ops (still `Draft`; circuit-breaker requires post-deploy review with the user before promotion to `Proposed`; §3.1 backlog now has 7 items including the post-PLAN-012 pre-beta validation plan).

### Open PRs (as of handoff time)

Run `gh pr list --state open` on cold start to verify; expected state:

- **PR #10 (or its successor)** — release-please auto-PR for `v0.2.3`. Bot-authored; opens whenever a `feat:` / `fix:` PR merges to main. **The user merges these; you don't.**
- **PR #13 (or similar)** — the doc-reconciliation / handoff PR with the current cycle's outputs (VALIDATION-009 §7.1 + PLAN-013 backlog addition + PLAN-010 prompts + this handoff). If still open when you cold-start, ask the user whether to merge.

### Branch protection status (PR-flow facts)

- `main` branch-protected: required status checks `["lint-and-typecheck", "test"]`; `required_linear_history: true`; `allow_force_pushes: false`; `enforce_admins: false`.
- Direct push to `main` is REJECTED for non-admins, **bypassable for admin tokens** (per intentional break-glass in plan §2.5).
- Future coordinator commits land via PR + squash-merge.
- Release-please pipeline: `feat:`/`fix:` PRs trigger an auto-opened release PR; merging the release PR cuts a `vX.Y.Z` tag; the tag push triggers `build-image` which pushes to GHCR.

### Cross-plan invariants (the live list)

PLAN-010's execute prompt enumerates these; replicate them in every future prompt's "Definition of done":

1. **PLAN-003 static check** — `pnpm --filter @app/domain test no-direct-state-writes` exits 0; `IGNORE_DIRS` unchanged.
2. **PLAN-005 integration** — `pnpm --filter @app/api test` ≥ 111 tests pass (count may rise as procedures' projections extend).
3. **PLAN-006 per-page Playwright** — `pnpm --filter web e2e -- e2e/walking-skeleton/` 7/7 pass.
4. **PLAN-007 notifications + settings** — both packages' vitest suites pass.
5. **PLAN-008 chained walking-skeleton + 4 SSO** — `pnpm --filter web e2e -- --grep walking-skeleton.spec.ts` 5× no-flake; `--grep sso.spec.ts` 4/4 serial.
6. **PLAN-002 lazy Proxy** — `unset DATABASE_URL && pnpm --filter web build` exits 0.
7. **Repo-wide typecheck** — `pnpm -r typecheck` exits 0.

These accrete; PLAN-010's report should confirm each one explicitly.

## Coordinator lesson from PLAN-009 validation

**Future validate prompts should NOT instruct the agent to do a "live destructive test" of branch protection** (i.e., attempt `git push origin main` from a clean checkout). With admin tokens it succeeds and leaves a permanent artefact in main history; with non-admin tokens it fails as expected. **Verify protection rules via `gh api ... protection` only** — the rules are queryable and the API check is enough evidence the protection is configured correctly. The empty probe commit `4e2ea9e` is the trace of this lesson; future me, don't replicate the pattern.

This lesson also applies to any other "test by trying to break it" gate (e.g., "try to push a force-push") — verify the configured rule, not the runtime behavior.

## What you do tomorrow (the immediate next step)

1. **Read this handoff + the files in §"What you MUST read on cold start"** to recover context.
2. **Check open PRs:** `gh pr list --state open --json number,title,state,author`. Expected: one release-please bot PR + possibly the previous-cycle's coordinator PR.
3. **Tell the user you're back in role.** Mention any open PRs that want their attention (release-please, coordinator-cycle).
4. **Wait for the user's signal.** Most likely paths:
   - **(a) "Run PLAN-010 execute agent"** → they'll have run `.agents/prompts/021-execute-plan-010.md`; report comes back; you triage.
   - **(b) "Should I merge release PR #10?"** → yes; merging cuts `v0.2.3` tag and triggers GHCR build. No deploy needed unless they want the version bumped on the running instance.
   - **(c) "Defer PLAN-010; let's do PLAN-013 first / decide pre-beta validation shape"** → flip PLAN-013 status `Draft` → `Proposed`, reshape §3 Outputs based on post-deploy review notes, write `.agents/prompts/023-execute-plan-013.md` + `024-validate-plan-013.md`.
5. **When the PLAN-010 execute agent's report arrives:** triage. Likely outcomes:
   - **Clean:** verify via `gh pr view <N>` + spot-check the JobDetailView refactor approach + the `jobs.getById` projection extension if any. Tell user to run validate agent.
   - **Issue surfaced — JobDetailView grew >300 lines without refactor:** flag in your response; suggest a follow-up `refactor(web):` PR. Doesn't block PLAN-010 validation.
   - **Issue surfaced — `jobs.getById` projection broke PRD-004 R-05 role-projection** (non-enrolled Actives see counts only, not names): mechanical fix; small `fix(api):` PR.
   - **Issue surfaced — release-please skipped the version bump** (PR title was `chore:` not `feat:`): edit the PR title via `gh pr edit <N> --title 'feat(web): …'` before merge; release-please re-reads on merge.
6. **After PLAN-010 validation closes:** ask the user what's next — PLAN-011 (Admin view) is the obvious sequence. PLAN-013 still in the queue. Write the next prompts. Land via PR.
7. **Write a fresh handoff** at `.agents/context/008-coordinator-handoff-YYYY-MM-DD.md` after the cycle closes.

## Outstanding low-priority items (NOT blockers; don't surface unprompted)

- **`enforce_admins: true`** flip — coordinator break-glass is intentional per plan §2.5; flip post-launch (probably after PLAN-012 or pre-beta).
- **Probe commit `4e2ea9e`** in main history — empty, harmless; flagged.
- **Playwright not in CI** — documented gap; PLAN-013 §3.1 backlog.
- **`bootstrap-admin.spec.ts` test.skip** — feasible to reshape now that the trigger fix landed; low priority.
- **GHCR visibility default** — manual flip per chapter; runbook entry queued for PLAN-013.
- **Test users in prod DB** (`%-1b767b72@%` pattern + 2 closed test jobs) — user can clean or leave.

## What's in the cycle PR (likely PR #13 or similar)

The PR that bundles this handoff + the PLAN-010 prompts + VALIDATION-009 §7.1 + PLAN-013 backlog addition. Branch name: `plan-009-closeout-plan-010-prompts`. Squash-merge brings everything onto main; CI is docs-only (no code touched) so it should be green within 1-2 minutes of opening.

## Quick reference table — file locations

| Need | Path |
|---|---|
| User auto-memory | `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` |
| Coordinator profile | `.agents/profiles/coordinator.md` |
| Developer profile | `.agents/profiles/developer.md` |
| Root project context | `CLAUDE.md` |
| Web app gotchas | `apps/web/AGENTS.md` |
| Coverage matrix | `docs/plans/COVERAGE.md` |
| Past coordinator handoffs | `.agents/context/00{1..7}-coordinator-handoff-*.md` |
| Past kickoff prompts | `.agents/prompts/NNN-{execute,validate}-plan-NNN.md` |
| Designs | `docs/designs/001-database-schema.md` … `006-ui-components.md` |
| ADRs | `docs/adrs/001..011-*.md` |
| PRDs | `docs/prds/001..008-*.md` |
| DDD | `docs/domain-driven-design/{001..004}-*.md` + `aggregates/` + `bounded-contexts/` |
| Release manifest (MVP scope) | `docs/releases/001-mvp.md` |
| haynes-ops manifests | `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/` |
| Live instance URL | `https://todos-for-dues.haynesops.com` |
| GHCR image | `ghcr.io/thaynes43/todos-for-dues:v0.2.2` (public) |

## A note on `.zprompt.md`

User uses `.zprompt.md` at the repo root as a scratchpad for agent feedback. `.git-ignored`. Overwrite freely.

## A note on identity discipline (post PR-flow)

Your own fix-commits land via PR + squash-merge — `git checkout -b fix-<area>` → commit → `git push -u origin <branch>` → `gh pr create`. Wait for CI green; the user merges (or self-merges if explicitly authorized).

The <10-line mechanical-fix rule still applies. Anything bigger → write a prompt for the next agent.

---

**Begin.** Read the files in §"What you MUST read on cold start." When done, tell the user you're back in role and that PLAN-010 prompts are ready (`.agents/prompts/021-execute-plan-010.md`).
