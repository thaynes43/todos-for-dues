# Coordinator self-handoff — 2026-05-17 (post PLAN-011 close, PLAN-012 prompts ready)

> **You are reading a handoff to yourself.** The conversation cache that produced this state has expired and you are starting cold. **The immediate situation: PLAN-011 is fully merged + closed out, PLAN-012 prompts are written and waiting for the user to kick off the execute agent.**

## Identity & role

You are the **coordinator** for the TODOs for Dues project. Full role description at `.agents/profiles/coordinator.md`. Short version:

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
3. `CLAUDE.md` (repo root) — canonical context.
4. `apps/web/AGENTS.md` (one line) — "This is NOT the Next.js you know."
5. `docs/PROCESS.md` — docs-first SDLC.
6. `docs/plans/COVERAGE.md` — coverage matrix.
7. `git log --first-parent main --oneline -25` + `gh pr list --state open` — see what's open + landed.
8. **The most recent prompts:** `.agents/prompts/025-execute-plan-012.md` + `026-validate-plan-012.md`.
9. **Prior handoffs:** `.agents/context/00{1..8}-coordinator-handoff-*.md` (skim).

## Current state (snapshot at end of 2026-05-17 late evening)

### Plans executed + validated (✅ on main)

- **PLAN-001..010** — all green, no change from prior handoffs.
- **PLAN-011** (just landed via PR #17 squash-merge) — `/admin/*` route tree. Admin layout (server-side gate), Dashboard with AggregateCountsCards, Disputes drill-in with ResolveDisputeModal (3 sub-modals — Mark closed / Mark cancelled / Mark false-alarm — each with a non-empty resolution-note textarea), per-field save-on-blur SettingsForm (200ms debounce, shared Zod validators via new `@app/api/settings-shared` subpath export), audit log (find-by-job-ID + combined `<JobDetailView>` + `<AuditLogTable>` on `/admin/jobs/<id>` per Q-PLN-01), Users shell (placeholder; PLAN-012 will fill). `admin.listDisputed` extended to project `disputer.role` + `disputedAt` (scoped to `to_state='disputed'`). `/jobs?state=` query-param extension on `apps/web/app/jobs/page.tsx` (Admin/Moderator only). `pageerror` listener installed in every admin spec (closes VALIDATION-010's gap). Validator passed all §6 gates + cross-plan invariants. Test counts: @app/api 116 (+1 from PLAN-010's 115); web Vitest 132.

**Pre-merge fix landed in PR #17 itself:** AdminLayout's `try { listDisputed } catch { 0 }` removed — let errors propagate to Next.js's error boundary instead of silently masking ops outages as "0 disputes." Surfaced by validator as escalation #2.

### VALIDATION-011 deviations (NOT fixed; surfaced as backlog)

1. **PLAN-010 `my-postings.spec.ts` flake** — 1/3 full-suite runs (passed in isolation). PLAN-011 doesn't touch that route. Belongs to PLAN-010 retro item, not a PLAN-011 blocker. Possible cause: dev-server compile-lag / session-cookie race under parallel-spec contention.
2. **`/jobs?state=` silent role fallback** — Active/Alumni typing `?state=...` silently get default view rather than 400/role-projected filter. The execute prompt Trap 5 didn't mandate the role-gate; no UI path exposes it; MVP-acceptable. Future UX call.
3. **`admin.listDisputed` N+1** — per-job transition + user lookup in a for-loop. Fine at MVP scale; future perf note.

### Plans NOT yet executed

- **PLAN-012** Role management UI (profile self-service / Admin Users list / role history / MinAdminErrorBanner) — **prompts written and ready** at `.agents/prompts/025-execute-plan-012.md` + `026-validate-plan-012.md`. Next plan in the queue.
- **PLAN-013** live-instance ops (still `Draft`; §3.1 backlog now has the items listed below — see "Outstanding low-priority items").

### Open PRs (as of handoff time)

Run `gh pr list --state open` on cold start to verify. Expected state:

- **release-please PR** for v0.4.0 (PLAN-011 was `feat:` — minor bump). Bot-authored; **the user merges these; you don't.**
- **PR for this coordinator cycle** — bundles handoff 009 + PLAN-012 prompts. Squash-merge brings these onto main; CI is docs-only.

### Branch protection status (PR-flow facts)

Unchanged from handoff 008. `enforce_admins: false` still intentional break-glass.

### Cross-plan invariants (the live list — re-run after every plan)

PLAN-012's execute prompt enumerates these; replicate them in every future prompt's "Definition of done":

1. **PLAN-003 static check** — `pnpm --filter @app/domain test no-direct-state-writes` exits 0; `IGNORE_DIRS` unchanged.
2. **PLAN-005 integration** — `pnpm --filter @app/api test` ≥ 116 tests pass (rose from 115 after PLAN-011's `admin.listDisputed` projection extension).
3. **PLAN-006 per-page Playwright** — `pnpm --filter web e2e -- e2e/walking-skeleton/` 7/7 pass.
4. **PLAN-007 notifications + settings** — both packages' vitest suites pass.
5. **PLAN-008 chained walking-skeleton + 4 SSO** — `pnpm --filter web e2e -- --grep walking-skeleton.spec.ts` 5× no-flake; SSO 4/4 serial.
6. **PLAN-010 MVP specs** — `pnpm --filter web e2e -- e2e/mvp/` exit 0; 3× no-flake (note: known parallel-spec flake on `my-postings.spec.ts`).
7. **PLAN-011 admin specs** — `pnpm --filter web e2e -- e2e/admin/` exit 0; 3× no-flake; **PLAN-012 replaces `/admin/users/page.tsx`** so verify `users-shell.spec.ts` is either updated or retired in favour of `admin-users-list.spec.ts`.
8. **PLAN-002 lazy Proxy** — `unset DATABASE_URL && pnpm --filter web build` exits 0.
9. **Repo-wide typecheck** — `pnpm -r typecheck` exits 0.

## Coordinator lessons (accumulating)

- **From PLAN-009 validation:** Never instruct validate agents to do "live destructive test" of branch protection. Verify rules via `gh api ... protection` only.
- **From PLAN-010 validation:** Every new Playwright spec must install a `pageerror` listener from the start.
- **From PLAN-011 cycle:** Branch your cycle PRs (with prompts/handoffs) from `main` — NOT from another open PR's branch. PR #17 was branched off PR #16's branch, which caused a merge conflict at the end of the cycle. The prompts ended up in main twice (once via PR #16's squash, once would-be via PR #17's squash) — git's add/add conflict handler caught it, but it required a manual `git merge` resolution. **Always `git checkout -b <branch> origin/main`.**
- **From PLAN-011 validation:** When the validator flags an issue you yourself asked them to look at, decide explicitly whether to land a small `fix(web):` on the same PR before merge, or queue for a follow-up chore. For PLAN-011, the AdminLayout try/catch silent-fallback was <10 lines and a real observability concern, so it landed in the same PR. Use this judgment: <10 lines + real correctness concern = land; otherwise queue.

## What you do tomorrow (the immediate next step)

1. **Read this handoff + the files in §"What you MUST read on cold start"** to recover context.
2. **Check open PRs:** `gh pr list --state open --json number,title,state,author`. Expected: one release-please bot PR (v0.4.0 candidate) + possibly this coordinator-cycle PR if not yet merged.
3. **Tell the user you're back in role.**
4. **Wait for the user's signal.** Most likely paths:
   - **(a) "Run PLAN-012 execute agent"** → they'll have run `.agents/prompts/025-execute-plan-012.md`; report comes back; you triage.
   - **(b) "Should I merge release PR vX.Y.Z?"** → yes; merging cuts the tag.
   - **(c) "Land the PLAN-010 `my-postings.spec.ts` flake fix + MVP-specs `pageerror`-listener retrofit"** → write a small `chore(web):` prompt; both are small.
5. **When the PLAN-012 execute agent's report arrives:** triage. Likely outcomes:
   - **Clean:** verify via `gh pr view <N>` + spot-check the MinAdminErrorBanner wording matches PRD-008 §5.2 verbatim + the `?returnTo=` open-redirect validation + the session-refresh approach after self-demote. Tell user to run validate agent.
   - **Issue surfaced — self-service dropdown renders Moderator/Admin as a target:** AC-09/AC-10 violation. Mechanical fix in the option-list function.
   - **Issue surfaced — `?returnTo=` lacks open-redirect validation:** small `fix(web):` commit tightening the validator.
   - **Issue surfaced — session role stale after self-demote:** the agent didn't call `router.refresh()` or `authClient.getSession({ fresh: true })`. Pick whichever Better Auth pattern works.
6. **After PLAN-012 validation closes:** all MVP UI plans done. Ask the user about the pre-beta validation plan (per PLAN-013 §3.1 backlog) — the 3 user-driven gates DEFERRED at PLAN-009 close need a home. Could also tackle the MVP-specs `pageerror`-listener retrofit + PLAN-010 flake fix here.
7. **Write a fresh handoff** at `.agents/context/010-coordinator-handoff-YYYY-MM-DD.md` after the cycle closes.

## Outstanding low-priority items (NOT blockers; don't surface unprompted)

- **MVP-specs `pageerror`-listener retrofit** — small chore PR queued.
- **PLAN-010 `my-postings.spec.ts` parallel-flake** — flagged in VALIDATION-011; PLAN-010 retro item.
- **`/jobs?state=` silent role fallback** — UX call; queue.
- **`admin.listDisputed` N+1 query** — MVP-scale fine; perf note.
- **3 user-driven gates DEFERRED at PLAN-009 close** — need a pre-beta validation plan (PLAN-013 §3.1 backlog item).
- **`enforce_admins: true`** flip — coordinator break-glass; flip post-launch.
- **Probe commit `4e2ea9e`** in main history — empty, harmless.
- **Playwright not in CI** — documented gap; PLAN-013 §3.1 backlog.
- **`bootstrap-admin.spec.ts` test.skip** — feasible to reshape; low priority.
- **GHCR visibility default** — manual flip per chapter; runbook entry queued.

## What's in this cycle's PR

Branch: `coordinator-cycle-plan-011-closeout-plan-012-prompts` (or similar). Files:
- `.agents/prompts/025-execute-plan-012.md` (new)
- `.agents/prompts/026-validate-plan-012.md` (new)
- `.agents/context/009-coordinator-handoff-2026-05-17-late-evening.md` (this file; new)

Docs-only; CI should be green in ~90s.

## Quick reference table — file locations

| Need | Path |
|---|---|
| User auto-memory | `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` |
| Coordinator profile | `.agents/profiles/coordinator.md` |
| Developer profile | `.agents/profiles/developer.md` |
| Root project context | `CLAUDE.md` |
| Web app gotchas | `apps/web/AGENTS.md` |
| Coverage matrix | `docs/plans/COVERAGE.md` |
| Past coordinator handoffs | `.agents/context/00{1..9}-coordinator-handoff-*.md` |
| Past kickoff prompts | `.agents/prompts/NNN-{execute,validate}-plan-NNN.md` |
| Designs | `docs/designs/001..006-*.md` |
| ADRs | `docs/adrs/001..011-*.md` |
| PRDs | `docs/prds/001..008-*.md` |
| DDD | `docs/domain-driven-design/{001..004}-*.md` + `aggregates/` + `bounded-contexts/` |
| Release manifest (MVP scope) | `docs/releases/001-mvp.md` |
| haynes-ops manifests | `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/` |
| Live instance URL | `https://todos-for-dues.haynesops.com` |
| GHCR image (post-PLAN-011 deploy) | will be `ghcr.io/thaynes43/todos-for-dues:v0.4.0` after release-please cuts the tag |

## A note on `.zprompt.md`

User uses `.zprompt.md` at the repo root as a scratchpad for agent feedback. `.git-ignored`. Overwrite freely.

## A note on identity discipline (post PR-flow)

Your own fix-commits land via PR + squash-merge — `git checkout -b fix-<area> origin/main` (always from `origin/main`, not from another branch) → commit → `git push -u origin <branch>` → `gh pr create`. Wait for CI green; the user merges (or self-merges if explicitly authorized). The <10-line mechanical-fix rule still applies; anything bigger → write a prompt for the next agent.

---

**Begin.** Read the files in §"What you MUST read on cold start." When done, tell the user you're back in role and that PLAN-012 prompts are ready (`.agents/prompts/025-execute-plan-012.md`).
