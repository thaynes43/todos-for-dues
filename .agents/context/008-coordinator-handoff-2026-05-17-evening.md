# Coordinator self-handoff — 2026-05-17 (post PLAN-010 close, PLAN-011 prompts ready)

> **You are reading a handoff to yourself.** The conversation cache that produced this state has expired and you are starting cold. **The immediate situation: PLAN-010 is fully merged + closed out, PLAN-011 prompts are written and waiting for the user to kick off the execute agent.**

## Identity & role

You are the **coordinator** for the TODOs for Dues project. Full role description at `.agents/profiles/coordinator.md` (read it if you need the refresher). Short version:

1. Write kickoff prompts for fresh execute + validate agents.
2. Read their reports, verify against git, decide: clean → next prompts; issue → diagnose + edit affected docs.
3. Write self-handoffs (like this one).

You do NOT write production code. **Branch protection is ON `main`** — your own commits land via PR + squash-merge after CI green. The user pushes / merges.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters. Live at `https://todos-for-dues.haynesops.com`. Tech: Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`.

**Working directories:**
- This repo: `/Users/thaynes/src/projects/todos-for-dues`
- GitOps repo: `~/src/labspace/haynes-ops/`

## What you MUST read on cold start (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — durable user preferences.
2. `.agents/profiles/coordinator.md` — role description.
3. `CLAUDE.md` (repo root) — canonical context, including `## Pull-request flow (NORMATIVE)` + `## Release versioning (release-please)`.
4. `apps/web/AGENTS.md` (one line) — "This is NOT the Next.js you know."
5. `docs/PROCESS.md` — docs-first SDLC.
6. `docs/plans/COVERAGE.md` — coverage matrix.
7. `git log --first-parent main --oneline -25` + `gh pr list --state open` — see what's open + landed.
8. **The most recent prompts:** `.agents/prompts/023-execute-plan-011.md` + `024-validate-plan-011.md`.
9. **Prior handoffs:** `.agents/context/00{1..7}-coordinator-handoff-*.md` (skim).

## Current state (snapshot at end of 2026-05-17 evening)

### Plans executed + validated (✅ on main)

- **PLAN-001..009** — all green, no change from prior handoffs.
- **PLAN-010** (just landed via PR #14 squash-merge `a69af93`) — MVP job-loop UI completion. 13 new components (`RejectModal`, terminal-state banners, `RescheduleButton`, `CancelJobModal`, `RevertCompletionButton`, `UnenrollButton`, `DisputeJobModal`, `CompletedJobActiveView`, `ui/modal` primitive, `ApproveRejectButtons`+`JobDetailView`+`RoleAwareNav` extensions); 2 new routes (`/my-postings`, `/my-enrollments`) with server-side role gates; 9 Playwright specs under `e2e/mvp/`; `jobs.getById` projection extended to add `closedBy.displayName` + `viewerCredit.{confirmed, amount}` (SELECT-only, respects PRD-004 R-05 role-projection). Q-PLN-01 lean implemented: non-confirmed enrolled Actives see "You weren't confirmed for this job; no dues credit recorded." Validator passed all §6 gates + cross-plan invariants. Test counts: @app/api 115 (+4 from baseline 111), @app/domain 41, web Vitest 106, all green.

### Plans NOT yet executed

- **PLAN-011** Admin view UI (Dashboard / Disputes drill-in + resolve / Settings save-on-blur / Audit log / Users shell) — **prompts written and ready** at `.agents/prompts/023-execute-plan-011.md` + `024-validate-plan-011.md`. Next plan in the queue.
- **PLAN-012** Role management UI.
- **PLAN-013** live-instance ops (still `Draft`; §3.1 backlog now has 8 items including the post-PLAN-012 pre-beta validation plan AND the MVP-specs `pageerror`-listener retrofit — see below).

### VALIDATION-010 deviation (NOT fixed, surfaced as backlog)

The PLAN-010 MVP specs (`apps/web/e2e/mvp/*.spec.ts`) do NOT install a `pageerror` listener (PLAN-006's pattern). Validator empirically confirmed dev-server logs were clean across 3 runs, but the gate is unenforced. **Folded into PLAN-011 prompts as Trap 1** — the new admin specs install the listener from the start. The MVP retrofit is queued as a small `chore(web):` follow-up. Should land before PLAN-013's pre-beta validation since it's a Playwright infra concern.

### Open PRs (as of handoff time)

Expected state — run `gh pr list --state open` to verify:

- **release-please PR** for the version following `v0.2.3` (likely `v0.3.0` since PLAN-010 was `feat:` — minor bump). Bot-authored; opens whenever a `feat:` / `fix:` PR merges to main. **The user merges these; you don't.**
- **PR for this coordinator cycle** — bundles handoff 008 + PLAN-011 prompts. Squash-merge brings these onto main; CI is docs-only.

### Branch protection status (PR-flow facts)

- `main` branch-protected: required status checks `["lint-and-typecheck", "test"]`; `required_linear_history: true`; `allow_force_pushes: false`; `enforce_admins: false`.
- Direct push to `main` is REJECTED for non-admins, bypassable for admin tokens (intentional break-glass).
- Future coordinator commits land via PR + squash-merge.
- Release-please pipeline: `feat:`/`fix:` PRs trigger an auto-opened release PR; merging the release PR cuts a `vX.Y.Z` tag; the tag push triggers `build-image` which pushes to GHCR.

### Cross-plan invariants (the live list — re-run after every plan)

PLAN-011's execute prompt enumerates these; replicate them in every future prompt's "Definition of done":

1. **PLAN-003 static check** — `pnpm --filter @app/domain test no-direct-state-writes` exits 0; `IGNORE_DIRS` unchanged.
2. **PLAN-005 integration** — `pnpm --filter @app/api test` ≥ 115 tests pass (rose from 111 baseline after PLAN-010's `jobs.getById` projection extension).
3. **PLAN-006 per-page Playwright** — `pnpm --filter web e2e -- e2e/walking-skeleton/` 7/7 pass.
4. **PLAN-007 notifications + settings** — both packages' vitest suites pass.
5. **PLAN-008 chained walking-skeleton + 4 SSO** — `pnpm --filter web e2e -- --grep walking-skeleton.spec.ts` 5× no-flake; `--grep sso.spec.ts` 4/4 serial.
6. **PLAN-010 MVP specs** — `pnpm --filter web e2e -- e2e/mvp/` exit 0; 3× no-flake.
7. **PLAN-002 lazy Proxy** — `unset DATABASE_URL && pnpm --filter web build` exits 0.
8. **Repo-wide typecheck** — `pnpm -r typecheck` exits 0.

These accrete; PLAN-011's report should confirm each one explicitly.

## What you do tomorrow (the immediate next step)

1. **Read this handoff + the files in §"What you MUST read on cold start"** to recover context.
2. **Check open PRs:** `gh pr list --state open --json number,title,state,author`. Expected: one release-please bot PR (v0.3.0 candidate) + possibly this coordinator-cycle PR if not yet merged.
3. **Tell the user you're back in role.** Mention any open PRs that want their attention.
4. **Wait for the user's signal.** Most likely paths:
   - **(a) "Run PLAN-011 execute agent"** → they'll have run `.agents/prompts/023-execute-plan-011.md`; report comes back; you triage.
   - **(b) "Should I merge release PR vX.Y.Z?"** → yes; merging cuts the tag and triggers GHCR build. No deploy needed unless they want the version bumped on the running instance.
   - **(c) "Land the MVP-specs `pageerror`-listener chore first"** → write a tiny prompt (or do it yourself via a small PR) that adds the listener to a shared `e2e/mvp/support.ts` helper + every spec invokes it in `beforeEach`. Should be a sub-50-line PR.
5. **When the PLAN-011 execute agent's report arrives:** triage. Likely outcomes:
   - **Clean:** verify via `gh pr view <N>` + spot-check the `admin.listDisputed` projection extension (if taken) + the `/jobs?state=` query-param extension (if taken) + the `SettingsForm` debounce behaviour + the AdminLayout server-side role-gate location. Tell user to run validate agent.
   - **Issue surfaced — AdminLayout role-gate is `useEffect`-based:** must be server-side (data leaks on slow networks otherwise). Flag for the agent to fix.
   - **Issue surfaced — `admin.listDisputed` projection extension broke a PLAN-005 test:** mechanical fix; small `fix(api):` commit on the same PR branch.
   - **Issue surfaced — release-please skipped the version bump** (PR title was `chore:` not `feat:`): edit the PR title via `gh pr edit <N> --title 'feat(web): …'` before merge.
6. **After PLAN-011 validation closes:** ask the user what's next — PLAN-012 (Role management UI — fills in `/admin/users`) is the obvious sequence. Write the next prompts. Land via PR.
7. **Write a fresh handoff** at `.agents/context/009-coordinator-handoff-YYYY-MM-DD.md` after the cycle closes.

## Coordinator lessons (accumulating)

- **From PLAN-009 validation:** Never instruct validate agents to do a "live destructive test" of branch protection. Verify protection rules via `gh api ... protection` only. The empty probe commit `4e2ea9e` is the trace of this lesson.
- **From PLAN-010 validation:** Every new Playwright spec must install a `pageerror` listener from the start (PLAN-006's pattern). PLAN-010's MVP specs missed this; PLAN-011's execute prompt corrects the pattern explicitly. Treat `pageerror` like `console.error` — assertion-level enforcement, not "empirically clean" logging review.

## Outstanding low-priority items (NOT blockers; don't surface unprompted)

- **MVP-specs `pageerror`-listener retrofit** — small chore PR queued; suggest landing before PLAN-013's pre-beta validation.
- **`enforce_admins: true`** flip — coordinator break-glass is intentional per PLAN-009 §2.5; flip post-launch (probably after PLAN-012 or pre-beta).
- **Probe commit `4e2ea9e`** in main history — empty, harmless; flagged.
- **Playwright not in CI** — documented gap; PLAN-013 §3.1 backlog.
- **`bootstrap-admin.spec.ts` test.skip** — feasible to reshape now that the trigger fix landed; low priority.
- **GHCR visibility default** — manual flip per chapter; runbook entry queued for PLAN-013.
- **Test users in prod DB** (`%-1b767b72@%` pattern + 2 closed test jobs) — user can clean or leave.

## What's in this cycle's PR

Branch: `coordinator-cycle-plan-010-closeout-plan-011-prompts`. Files:
- `.agents/prompts/023-execute-plan-011.md` (new)
- `.agents/prompts/024-validate-plan-011.md` (new)
- `.agents/context/008-coordinator-handoff-2026-05-17-evening.md` (this file; new)

Squash-merge brings everything onto main; CI is docs-only (no code touched) so it should be green within 1-2 minutes of opening.

## Quick reference table — file locations

| Need | Path |
|---|---|
| User auto-memory | `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` |
| Coordinator profile | `.agents/profiles/coordinator.md` |
| Developer profile | `.agents/profiles/developer.md` |
| Root project context | `CLAUDE.md` |
| Web app gotchas | `apps/web/AGENTS.md` |
| Coverage matrix | `docs/plans/COVERAGE.md` |
| Past coordinator handoffs | `.agents/context/00{1..8}-coordinator-handoff-*.md` |
| Past kickoff prompts | `.agents/prompts/NNN-{execute,validate}-plan-NNN.md` |
| Designs | `docs/designs/001-database-schema.md` … `006-ui-components.md` |
| ADRs | `docs/adrs/001..011-*.md` |
| PRDs | `docs/prds/001..008-*.md` |
| DDD | `docs/domain-driven-design/{001..004}-*.md` + `aggregates/` + `bounded-contexts/` |
| Release manifest (MVP scope) | `docs/releases/001-mvp.md` |
| haynes-ops manifests | `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/` |
| Live instance URL | `https://todos-for-dues.haynesops.com` |
| GHCR image (pre-PLAN-010 deploy) | `ghcr.io/thaynes43/todos-for-dues:v0.2.3` (will be `v0.3.0` after release-please cuts the tag) |

## A note on `.zprompt.md`

User uses `.zprompt.md` at the repo root as a scratchpad for agent feedback. `.git-ignored`. Overwrite freely.

## A note on identity discipline (post PR-flow)

Your own fix-commits land via PR + squash-merge — `git checkout -b fix-<area>` → commit → `git push -u origin <branch>` → `gh pr create`. Wait for CI green; the user merges (or self-merges if explicitly authorized).

The <10-line mechanical-fix rule still applies. Anything bigger → write a prompt for the next agent.

---

**Begin.** Read the files in §"What you MUST read on cold start." When done, tell the user you're back in role and that PLAN-011 prompts are ready (`.agents/prompts/023-execute-plan-011.md`).
