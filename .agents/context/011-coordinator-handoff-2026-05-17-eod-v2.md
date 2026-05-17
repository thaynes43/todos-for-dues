# Coordinator self-handoff — 2026-05-17 EOD v2 (post v0.6.0 deploy, PLAN-013 reshaped + prompt ready)

> **You are reading a handoff to yourself.** The conversation cache that produced this state has expired and you are starting cold. **The immediate situation: v0.6.0 is live; user wants SDLC hardening (PLAN-013) before broader testing kicks off; the plan has been reshaped from `Draft` to `Proposed` and the execute prompt is ready.**

## Identity & role

You are the **coordinator** for the TODOs for Dues project. Full role description at `.agents/profiles/coordinator.md`. You do NOT write production code; your work lands via PR + squash-merge.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters. Live at `https://todos-for-dues.haynesops.com` running **v0.6.0** (as of 2026-05-17 EOD).

## What you MUST read on cold start (in order)

1. `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`
2. `.agents/profiles/coordinator.md`
3. `CLAUDE.md`
4. `apps/web/AGENTS.md`
5. `docs/PROCESS.md`
6. `docs/plans/COVERAGE.md`
7. `git log --first-parent main --oneline -25` + `gh pr list --state open`
8. **Most-recent prompts:** `.agents/prompts/030-execute-plan-013.md` + `.agents/prompts/029-deploy-v0.6.0-to-haynes-ops.md`
9. **Prior handoffs:** `.agents/context/00{1..10}-coordinator-handoff-*.md` (skim).

## Current state (snapshot at end of 2026-05-17 EOD v2)

### Plans executed + validated (✅ on main)

- **PLAN-001..014** all committed, green, deployed.
- **v0.6.0 in production** since 2026-05-17 19:06 UTC.

### Today's release cadence

| Tag | What | Manual tag re-push required? |
|---|---|---|
| v0.3.0 (PLAN-010) | Image NEVER built (tag-push trap) | Skipped — jumping to v0.5.0 |
| v0.4.0 (PLAN-011) | Image NEVER built (tag-push trap) | Skipped — jumping to v0.5.0 |
| v0.5.0 (PLAN-012) | Coordinator re-pushed tag → built | YES (manual) |
| v0.6.0 (PLAN-014) | Coordinator re-pushed tag → built | YES (manual) |

**The trap fix is PLAN-013 Track A's headline.** Swap `build-image` trigger from tag-push to `release: types: [published]`. After the next release (v0.7.0 from PLAN-013 itself), validate this works automatically.

### Plans not yet executed

- **PLAN-013 reshaped** (Draft → Proposed today). Status: prompt ready at `.agents/prompts/030-execute-plan-013.md`. Three subagent tracks: CI/release automation, test hygiene, live smoke + health + runbook.
- **PLAN-015 placeholder** (Observability — Grafana dashboards + alerts, iterative via MCP). Not authored yet; do it after PLAN-013 lands if/when the live instance needs observability beyond the runbook + health endpoint.

### Open PRs (as of handoff time)

Run `gh pr list --state open --json number,title,state,author`. Expected:
- This coordinator-cycle PR if not yet merged (bundles PLAN-013 reshape + handoff 011).
- Possibly the PLAN-013 execute agent's PR if the user kicked off `030-execute-plan-013.md` already.

### Branch protection status

Unchanged. `enforce_admins: false` (intentional break-glass). Required checks `[lint-and-typecheck, test]`. **`e2e` will be added as advisory-only by PLAN-013; do NOT flip to required immediately** — wait 2 weeks of green runs.

### Cross-plan invariants (the live list)

Now 14 plans deep. PLAN-013's execute prompt enumerates these:

1. **PLAN-003 static check** — `pnpm --filter @app/domain test no-direct-state-writes` exits 0; allowlist unchanged.
2. **PLAN-005 integration** — `pnpm --filter @app/api test` ≥ 120 (PLAN-014 baseline).
3. **PLAN-006 per-page Playwright** — 7/7.
4. **PLAN-007 notifications + settings** — both green.
5. **PLAN-008 chained walking-skeleton + 4 SSO** — 5× no-flake + serial.
6. **PLAN-010 MVP specs** — 9/9 (the `my-postings` flake is PLAN-013 Track B's fix target).
7. **PLAN-011 admin specs** — 11/11 (10 baseline + the invites spec from PLAN-014).
8. **PLAN-012 role specs** — 7/7.
9. **PLAN-014 invites** — covered in admin spec set.
10. **PLAN-002 lazy Proxy** — `unset DATABASE_URL && pnpm --filter web build` exits 0.
11. **Repo-wide typecheck** — `pnpm -r typecheck` exits 0.

## Coordinator lessons (accumulating)

- **PLAN-009:** No "live destructive tests" of branch protection.
- **PLAN-010:** Every new Playwright spec installs `pageerror` listener from the start.
- **PLAN-011:** Branch cycle PRs from `main`, not from another open PR's branch.
- **PLAN-012:** When the validator flags a small correctness concern (<10 lines), decide explicitly whether to land it in the same PR.
- **v0.5.0 deploy:** `GITHUB_TOKEN`-pushed tags need user-context re-push. PLAN-013 Track A fixes this once and for all.
- **PLAN-014:** Subagent splits work best when the main agent locks the type contract FIRST.
- **2026-05-17 (new, PLAN-013 reshape):** When a "live ops" plan is Draft pending a circuit-breaker review, the reshape happens after the first real deploy. PLAN-013 sat as `Draft` for ~7 days while PLAN-010/011/012/014 + the v0.5.0 + v0.6.0 deploys provided the real friction. Reshape today: Drop Grafana (separate PLAN-015), focus on what bit us (tag trap, missing CI Playwright, my-postings flake).

## What you do tomorrow

1. **Read this handoff + the cold-start files.**
2. **Check open PRs.**
3. **Tell the user you're back in role.**
4. **Wait for the user's signal.** Most likely:
   - **(a) "Run PLAN-013 execute"** → developer agent fires; report comes back; triage.
   - **(b) "Should I merge the cycle PR?"** → yes; docs-only.
5. **When PLAN-013 execute report arrives:** triage. Likely outcomes:
   - **Clean:** spot-check the `release: types: [published]` change and the `my-postings` flake fix. Tell user to merge.
   - **Subagent A flagged `release:` trigger as untested** — that's the headline gate. After this PR merges, the v0.7.0 release-PR's merge is the live test. If `build-image` doesn't fire, fallback is the PAT path (user mints PAT, coordinator authors the fallback PR).
   - **Subagent B couldn't fix `my-postings` parallel-safe** — accept `--workers=1` fallback; document.
6. **After PLAN-013 merge:** the next release cuts v0.7.0; **VERIFY the trap fix worked.** `build-image` should fire automatically; no manual tag re-push. If yes: huge win, document the verified fix in handoff 012. If no: trigger the PAT fallback plan.
7. **Then:** the user decides: deploy v0.7.0 (it's a SDLC release, NOT user-facing — could batch with a later feature release), pre-beta validation, or chore retrofits.
8. **Write a fresh handoff** at `.agents/context/012-…md`.

## Outstanding low-priority items

- **PLAN-013 advisory→required `e2e` check flip** (2 weeks post-merge if green).
- **3 user-driven gates DEFERRED at PLAN-009 close** — pre-beta validation plan.
- **`enforce_admins: true` flip** — post-launch.
- **Probe commit `4e2ea9e`** in main history — empty, harmless.
- **`bootstrap-admin.spec.ts` test.skip** — feasible to reshape; low priority.
- **v0.3.0 / v0.4.0 image backfill** — nice-to-have for clean GHCR history; not needed.
- **PLAN-015 Observability** — Grafana dashboards/alerts via MCP. Author when observability gap pinches.
- **Email delivery of invite URLs** (PRD-003 §10 backlog).
- **Better Auth `auth-client` wiring** — currently using `router.refresh()` for session refresh per PLAN-012; revisit if needed.

## What's in this cycle's PR

Branch: `coordinator-cycle-plan-013-reshape` (or similar). Files:

- `docs/plans/013-live-instance-ops-implementation.md` — reshaped Draft → Proposed.
- `docs/plans/013-live-instance-ops-validation.md` — reshaped Draft → Proposed.
- `.agents/prompts/030-execute-plan-013.md` — execute prompt for the developer agent.
- `.agents/prompts/029-deploy-v0.6.0-to-haynes-ops.md` — already on disk from PLAN-014 cycle (committed in handoff 010's cycle PR if it landed; if not, include here).
- `.agents/context/011-coordinator-handoff-2026-05-17-eod-v2.md` — this file.

Docs-only; CI green in ~90s.

## Quick reference table

| Need | Path |
|---|---|
| User auto-memory | `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` |
| Coordinator profile | `.agents/profiles/coordinator.md` |
| Developer profile | `.agents/profiles/developer.md` |
| Root project context | `CLAUDE.md` |
| Web app gotchas | `apps/web/AGENTS.md` |
| Coverage matrix | `docs/plans/COVERAGE.md` |
| Past coordinator handoffs | `.agents/context/00{1..11}-coordinator-handoff-*.md` |
| Past kickoff prompts | `.agents/prompts/NNN-*.md` |
| Designs | `docs/designs/001..006-*.md` |
| ADRs | `docs/adrs/001..011-*.md` |
| PRDs | `docs/prds/001..008-*.md` |
| Live instance | `https://todos-for-dues.haynesops.com` running `v0.6.0` |
| GHCR | `ghcr.io/thaynes43/todos-for-dues:v0.6.0` |

## A note on `.zprompt.md`

Scratchpad for agent feedback. `.git-ignored`. Overwrite freely.

## A note on identity discipline

Coordinator fix-commits land via PR + squash-merge — `git checkout -b fix-<area> origin/main` → commit → push → `gh pr create`. <10-line mechanical-fix rule; anything bigger → write a prompt for the next agent.

---

**Begin.** Read the cold-start files. Tell the user you're back in role and that PLAN-013 prompts are ready (`.agents/prompts/030-execute-plan-013.md`).
