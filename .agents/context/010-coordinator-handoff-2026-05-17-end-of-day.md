# Coordinator self-handoff — 2026-05-17 EOD (post v0.5.0 deploy, PLAN-014 prompts ready)

> **You are reading a handoff to yourself.** The conversation cache that produced this state has expired and you are starting cold. **The immediate situation: v0.5.0 is live in production; PLAN-014 prompts are written to close two Admin-UI gaps surfaced during the live walkthrough.**

## Identity & role

You are the **coordinator** for the TODOs for Dues project. Full role description at `.agents/profiles/coordinator.md`. Short version:

1. Write kickoff prompts for fresh execute + validate agents.
2. Read their reports, verify against git, decide: clean → next prompts; issue → diagnose + edit affected docs.
3. Write self-handoffs (like this one).

You do NOT write production code. **Branch protection is ON `main`**. The user pushes / merges.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters. Live at `https://todos-for-dues.haynesops.com` running **v0.5.0** (as of 2026-05-17 EOD). Tech: Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`.

**Working directories:**
- This repo: `/Users/thaynes/src/projects/todos-for-dues`
- GitOps repo: `~/src/labspace/haynes-ops/`

## What you MUST read on cold start (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — durable user preferences.
2. `.agents/profiles/coordinator.md` — role description.
3. `CLAUDE.md` (repo root) — canonical context.
4. `apps/web/AGENTS.md` (one line).
5. `docs/PROCESS.md` — docs-first SDLC.
6. `docs/plans/COVERAGE.md` — coverage matrix (now includes PLAN-014 mappings for PRD-003 R-11..R-14).
7. `git log --first-parent main --oneline -25` + `gh pr list --state open`.
8. **The most recent prompts:** `.agents/prompts/028-execute-plan-014.md` (PLAN-014 execute) + `.agents/prompts/027-deploy-v0.5.0-to-haynes-ops.md` (deploy; already used today).
9. **Prior handoffs:** `.agents/context/00{1..9}-coordinator-handoff-*.md` (skim).

## Current state (snapshot at end of 2026-05-17 EOD)

### Plans executed + validated (✅ on main)

- **PLAN-001..010** — green; no change from prior handoffs.
- **PLAN-011** (PR #17 merged today) — `/admin/*` route tree. Verified live in v0.5.0.
- **PLAN-012** (PR #20 merged today) — role management UI. Verified live in v0.5.0.

### Deployed today

- **v0.3.0** (PLAN-010 MVP job-loop UI) → cut tag, but image NEVER built in GHCR (Trap 8 — `GITHUB_TOKEN`-pushed tag doesn't fire downstream workflows).
- **v0.4.0** (PLAN-011 Admin view) → same as v0.3.0; tag exists, image absent.
- **v0.5.0** (PLAN-012 role management) → tag deleted + re-pushed from user context to trigger `build-image` → image landed in GHCR.
- **haynes-ops PR #1773** — bumped image pin v0.2.2 → v0.5.0 (single-line YAML anchor flip). 8 Flux Local checks green; user merged. Pod `todos-for-dues-67d7d66748-668kv` Ready, 0 restarts. All 6 PLAN-009 §6 smoke checks passed.

### Two gaps surfaced post-deploy (now bundled in PLAN-014)

User reported after exercising the live app:
1. **No `/admin` link in `RoleAwareNav`.** `apps/web/components/RoleAwareNav.tsx` doesn't expose the existing `/admin/*` area to Admins. They'd have to type the URL.
2. **No invite-token generation UI.** Backend plumbing exists (DB table + verify + signup-consumes-token) since PLAN-002/004, but no Admin surface to mint/list/revoke tokens. AND: the signup action verified tokens but **never marked them consumed**, so a single URL could be redeemed unlimited times. Security bug.

PRD-003 amended in `5a2974f`-era PR cycle (this conversation) with R-11..R-14 + AC-10..AC-13. COVERAGE.md updated.

### PLAN-014 prompts ready

- `.agents/prompts/028-execute-plan-014.md` — execute prompt. Calls for the developer agent to spawn TWO subagents in parallel (backend track: `invites` router + signup-action fix; UI track: `/admin/invites` route + 3 components + Playwright). Main agent orchestrates, lands the nav fix as Step 1, locks the tRPC contract via a router stub, then forks. ONE PR.
- Validate prompt (`029-validate-plan-014.md`) — NOT YET WRITTEN. Same pattern as past cycles: write after execute lands cleanly.

### Open PRs (as of handoff time)

Run `gh pr list --state open` on cold start. Expected:
- This coordinator-cycle PR if not yet merged (bundles PRD-003 amendment + PLAN-014 + VALIDATION-014 + execute prompt 028 + handoff 010 + COVERAGE update).
- Possibly the PLAN-014 implementation PR if the user kicked off the developer agent already.

### Branch protection status

Unchanged. `enforce_admins: false` still intentional break-glass.

### Cross-plan invariants (the live list)

PLAN-014's execute prompt enumerates these; replicate in every future prompt:

1. **PLAN-003 static check** — `pnpm --filter @app/domain test no-direct-state-writes` exits 0; `IGNORE_DIRS` unchanged.
2. **PLAN-005 integration** — `pnpm --filter @app/api test` ≥ 117 (will grow with PLAN-014's `invites.test.ts`).
3. **PLAN-006 per-page Playwright** — 7/7.
4. **PLAN-007 notifications + settings** — both green.
5. **PLAN-008 chained walking-skeleton + 4 SSO** — 5× no-flake + serial.
6. **PLAN-010 MVP specs** — 9/9 under `--workers=1`.
7. **PLAN-011 admin specs** — 10/10 under `--workers=1`.
8. **PLAN-012 role specs** — 7/7.
9. **PLAN-002 lazy Proxy** — `unset DATABASE_URL && pnpm --filter web build` exits 0.
10. **Repo-wide typecheck** — `pnpm -r typecheck` exits 0.

### v0.5.0 deploy lessons

- **Tag re-push works.** GHA security limitation on `GITHUB_TOKEN`-created tags is real; the developer-profile §9 workaround (delete + re-push from user context) is reliable. **Worth automating** as a release-please workflow modification or a separate GHA job — PLAN-013 backlog candidate.
- **Schema-stable bumps are simple.** v0.2.2 → v0.5.0 needed no migrations; the haynes-ops PR was literally one YAML line. Future MVP-period deploys will likely also be schema-stable.
- **`flux reconcile` + 6 smoke checks took ~3 min total.** Repeatable.

## Coordinator lessons (accumulating)

- **From PLAN-009:** Don't instruct validators to do "live destructive tests" of branch protection.
- **From PLAN-010:** Every new Playwright spec must install `pageerror` listener from the start.
- **From PLAN-011:** Branch cycle PRs from `main`, NOT from another open PR's branch.
- **From PLAN-012:** When the validator flags a small correctness concern (<10 lines), decide explicitly whether to land in the same PR before merge.
- **From v0.5.0 deploy (new today):** `GITHUB_TOKEN`-pushed tags need user-context re-push. Memorize the developer-profile §9 workaround.
- **From PLAN-014 plan-authoring (new today):** Subagent splits work best when the main agent locks the type contract FIRST (write a stub router with placeholder bodies), then forks. Avoids subagent B writing against an inferred contract that diverges from subagent A's implementation.

## What you do tomorrow (the immediate next step)

1. **Read this handoff + the cold-start files.**
2. **Check open PRs:** `gh pr list --state open --json number,title,state,author`. Expected: this cycle PR + possibly the PLAN-014 implementation PR (or no implementation PR yet if user hasn't kicked off the agent).
3. **Tell the user you're back in role.**
4. **Wait for the user's signal.** Most likely paths:
   - **(a) "Run PLAN-014 execute agent"** → developer agent fires; report comes back; you triage.
   - **(b) "Verify the deploy worked"** → live HTTP checks; pod logs; manual click-through. Skip if user has already done this.
   - **(c) "Write the validate prompt now"** → write `029-validate-plan-014.md` so it's ready when the execute agent reports.
5. **When the PLAN-014 execute agent's report arrives:** triage. Likely outcomes:
   - **Clean:** verify via `gh pr view <N>` + spot-check the signup-action change (verify revoke-first strategy) + the InviteList URL display + the AdminNav entry. Write `029-validate-plan-014.md`; tell user to run validate.
   - **Issue: subagent B's components don't typecheck against subagent A's router** — mechanical fix; coordinator inspects the type drift, updates whichever subagent's output is wrong.
   - **Issue: `auth.signUpEmail` doesn't compose with Drizzle transactions cleanly** — subagent A should have fallen back to strategy (a) per the plan. If they instead skipped the atomicity and went with strategy (c) without telling you, surface it.
6. **After PLAN-014 validation closes:** ask the user about deploying v0.6.0. Same pattern as v0.5.0 deploy.

## Outstanding low-priority items (don't surface unprompted)

- **MVP-specs `pageerror`-listener retrofit** — chore PR queued.
- **PLAN-010 `my-postings.spec.ts` parallel-flake** — PLAN-010 retro item.
- **`/jobs?state=` silent role fallback** — UX call; queue.
- **`admin.listDisputed` N+1 query** — MVP-scale fine; perf note.
- **3 user-driven gates DEFERRED at PLAN-009 close** — need a pre-beta validation plan.
- **`enforce_admins: true`** flip — coordinator break-glass; post-launch.
- **Probe commit `4e2ea9e`** in main history — empty, harmless.
- **Playwright not in CI** — PLAN-013 §3.1 backlog.
- **`bootstrap-admin.spec.ts` test.skip** — feasible to reshape; low priority.
- **Tag re-push automation** — `GITHUB_TOKEN`-pushed tag workaround should be in PLAN-013 §3.1 backlog or its own runbook entry.
- **v0.3.0 / v0.4.0 image backfill** — not needed (we jumped to v0.5.0 directly) but nice to have for clean history.
- **Email delivery of invite URLs** — PLAN-014 §6 / PLAN-013 §3.1 backlog.

## What's in this cycle's PR

Branch: `coordinator-cycle-plan-013-prompts-and-plan-014-bundle` (or similar). Files:

- `docs/prds/003-identity-and-access.md` — appended R-11..R-14 + AC-10..AC-13 + changelog entry.
- `docs/plans/COVERAGE.md` — added PLAN-014 mappings.
- `docs/plans/014-invite-management-and-admin-nav.md` — new plan.
- `docs/plans/014-invite-management-and-admin-nav-validation.md` — paired validation.
- `.agents/prompts/028-execute-plan-014.md` — execute prompt for the developer agent.
- `.agents/prompts/027-deploy-v0.5.0-to-haynes-ops.md` — already on disk (was used today); should already be in git via the prior cycle PR or this one.
- `.agents/context/010-coordinator-handoff-2026-05-17-end-of-day.md` — this file.

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
| Past coordinator handoffs | `.agents/context/00{1..10}-coordinator-handoff-*.md` |
| Past kickoff prompts | `.agents/prompts/NNN-{execute,validate,deploy}-*.md` |
| Designs | `docs/designs/001..006-*.md` |
| ADRs | `docs/adrs/001..011-*.md` |
| PRDs | `docs/prds/001..008-*.md` |
| Release manifest (MVP scope) | `docs/releases/001-mvp.md` |
| haynes-ops manifests | `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/` |
| Live instance | `https://todos-for-dues.haynesops.com` running `v0.5.0` |
| GHCR image | `ghcr.io/thaynes43/todos-for-dues:v0.5.0` |

## A note on `.zprompt.md`

User uses `.zprompt.md` at the repo root as a scratchpad for agent feedback. `.git-ignored`. Overwrite freely.

## A note on identity discipline (post PR-flow)

Your own fix-commits land via PR + squash-merge — `git checkout -b fix-<area> origin/main` (always from `origin/main`) → commit → `git push -u origin <branch>` → `gh pr create`. Wait for CI green; the user merges. The <10-line mechanical-fix rule still applies; anything bigger → write a prompt for the next agent.

---

**Begin.** Read the files in §"What you MUST read on cold start." When done, tell the user you're back in role and that PLAN-014 prompts are ready (`.agents/prompts/028-execute-plan-014.md`).
