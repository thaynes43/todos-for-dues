# Coordinator self-handoff — 2026-05-15 (post PLAN-004 validation)

> **You are reading a handoff to yourself.** The conversation cache that produced this state has expired and you are starting cold tomorrow (or later) to continue overseeing implementation of the TODOs for Dues project. This file plus the docs it points at are everything you need to resume the role intact. Read it end-to-end before responding to the user.

## Identity & role

You are the **coordinator** for the TODOs for Dues project. You are NOT an execution agent. Your job is:

1. **Write kickoff prompts** for fresh execution + validation agents (`.agents/prompts/NNN-execute-plan-NNN.md` and `NNN-validate-plan-NNN.md`). Each prompt is self-contained — the agent reads it cold and produces work without further direction.
2. **Read agent reports** after the user runs them. Decide:
   - Is the work clean? → write the next pair of prompts.
   - Did the agent escalate or find a real issue? → diagnose, decide, and propagate fixes to upstream plans / designs / validations as needed.
3. **Edit plans, validations, and (sparingly) designs** when execution surfaces real conflicts or upstream drift. Examples already done: PLAN-002 Step 0 (lazy `db` Proxy) carrying VALIDATION-001 follow-up; PLAN-004 schema reshape reconciling DESIGN-001 §4.2 with Better Auth's `account` table; PLAN-009 +Steps 2.5/2.6/2.7 for branch protection + PR flow + release-please.
4. **Maintain `docs/plans/COVERAGE.md`** if the plan ordering or scope shifts (hasn't been needed since the initial decomposition).

You do NOT write production code. You do NOT modify PRDs or ADRs unless the user explicitly authorizes a doc correction. You commit + push your own work (plan/validation edits, prompt files); when SSH agent is locked the user will run `git push` themselves.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Sigma Phi Omicron, UMass Lowell is the launch chapter). Alumni post small jobs ("TODOs") with a dues contribution; Actives claim them; Moderators approve postings; Admins manage. The app doesn't custody money — Venmo happens off-app. Tech stack: Next.js 16 (App Router) + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on the `haynes-ops` Kubernetes cluster.

**Working directory:** `/Users/thaynes/src/projects/todos-for-dues`.

## What you MUST read on cold start (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — the user's auto-memory. Every entry there is durable user preference (ask-don't-invent, brief responses, doc conventions, one-question-at-a-time, MVP-is-a-phase, **PG16 test-DB rule**, skip-confirm-when-strong). Follow them all.
2. `CLAUDE.md` (repo root, ~95 lines) — the canonical project context committed by the `/init` skill. Workspace layout, common commands, test-DB rule, **Domain invariant — FSM-only state writes** (load-bearing), auth wiring, packaging notes.
3. `docs/PROCESS.md` — docs-first SDLC ordering (PRD → ADR → DDD → design → plan → code → validation).
4. `docs/plans/COVERAGE.md` — the coverage matrix mapping every PRD R-NN/AC-NN, every DESIGN §4 subsection, and every BCC-02 CMD-NN to its plan + validation. Authoritative state map.
5. `git log --oneline -25` — see what's landed since this handoff was written.
6. **The most recent prompts in `.agents/prompts/`** — read the last execute/validate pair to refresh your prompt-writing voice. Currently those are `011-execute-plan-005.md` and `012-validate-plan-005.md`.
7. **All plan + validation plan pairs** under `docs/plans/` for plans that have already executed (currently 001–004) so you know the actual landed shape, including any deviations the execution agents documented in changelogs. Skim, don't deep-read.

After reading those, you are back in role.

## Current state (snapshot at 2026-05-15)

### Plans executed + validated (✅ committed)

- **PLAN-001** scaffolding (commit `2d7da94`) — pnpm workspaces, Next.js 16, Drizzle, Better Auth, tRPC stubs, testcontainers smoke. VALIDATION-001 all green; one follow-up surfaced: eager `DATABASE_URL` throw at `packages/db/src/index.ts` blocks `pnpm --filter web build`. Filed into PLAN-002 Step 0.
- **PLAN-002** DB schema (commit `4b318e2`) — 8 application tables + 4 migrations (extensions, init, min-admin trigger, chapter_settings bootstrap). Step 0 landed the lazy `db` Proxy. Migrate runs via `tsx src/scripts/migrate.ts` (NOT `drizzle-kit migrate`) because GUC plumbing for `BOOTSTRAP_*` env → `app.bootstrap_*` is needed. drizzle-zod pinned to ^0.5.1.
- **PLAN-003** FSM module (commit `f439d42`) — `transitionJob` / `createJob` (w/ afterCommit) / `approveJob` (two-row pattern) / `recordRelationshipEvent` (DESIGN-002 §4.1.5 — single writer for enroll/unenroll audit rows) / `transitionRole` / `transitionRolesAtomically` (agent-added sibling for true atomic-swap; not consumed by MVP tRPC) / typed errors. Coverage 97% / 94%. **`no-direct-state-writes.test.ts`** is the load-bearing static-analysis test — packages/domain is the SOLE writer of `jobs.state`, `users.role`, `job_state_transitions`, `user_role_transitions`. Every future plan must preserve this invariant.
- **PLAN-004** Better Auth wiring (commit `5553619`) — Better Auth 1.6.x with genericOAuth, HD-restriction inside `mapProfileToUser`, account linking with `emailVerified` gating, `bootstrapAdminOnSignin` via `databaseHooks.session.create.after` routing through `transitionRole` (Trap 1 honoured), invite-token verification, 3 Server Actions. **Schema reshape (Option A authorized 2026-05-15):** added migrations 0005 (Better Auth's `session`/`account`/`verification` + `users.email_verified`) and 0006 (drop `users_account_kind` CHECK + the three legacy `users.password_hash`/`oidc_subject`/`oidc_provider` columns). DESIGN-001 §4.2 was updated to reflect the new reality (commit `aa9ddaf`). VALIDATION-004: 8 of 9 gates green; the 9th (3 SSO Playwright specs) is formally deferred to PLAN-008. **Follow-up landed** (commit `7daab1c`): SSO button changed from `<a href>` (GET → 404) to `<button onClick>` POSTing to Better Auth's actual contract. The 3 SSO specs are `test.fixme(true, '...')` pending PLAN-008.

### Plans NOT yet executed

- **PLAN-005** tRPC procedures (next — your prompts are at `.agents/prompts/011-execute-plan-005.md` + `012-validate-plan-005.md`).
- **PLAN-006** walking-skeleton UI.
- **PLAN-007** notifications (replaces PLAN-005's stub `afterCommit` calls with real Resend helpers).
- **PLAN-008** walking-skeleton E2E. Step 1 expanded to launch an in-process OIDC mock server + introduce `OIDC_DISCOVERY_URL` override; Step 3.5 un-fixme's the 3 SSO specs PLAN-004 deferred.
- **PLAN-009** deploy to haynes-ops cluster. Sub-steps 2.5 / 2.6 / 2.7 added: gh-based branch protection on `main`, CLAUDE.md PR-flow + versioning rules, release-please v4 wiring. Deployment pins `:vX.Y.Z` not `:latest`.
- **PLAN-010 / 011 / 012** MVP UI rest (job-loop completion, Admin view, role-management UI).

### Branch protection status

NOT yet enabled. We are still pushing directly to `main`. PLAN-009 Step 2.5 lands the protection rule; until then, every commit goes straight to `main`. If you push and the SSH agent is locked, the user will retry — that's been the pattern.

### Open architectural decisions (none currently contested)

- Q-DSG-04 in DESIGN-001: `jobs.per_active_dues_credit` jsonb vs join table — currently jsonb; lean defers join-table promotion to pre-REL-002 if queryability becomes a real need.
- Versioning: release-please chosen for SemVer auto-bumps from conventional commits. Lands in PLAN-009 Step 2.7.

### Recent escalations + how they were resolved

Read the commit messages on `aa9ddaf`, `7daab1c`, `e800fca`, `b2e5197` for the four most recent non-trivial decisions. Each commit body documents the why.

## The pattern (how you work)

When the user shares an agent report:

1. **Read the report carefully.** Look for: gates passed, gates failed, escalations, deviations from the plan, hints of upstream-doc drift. The agents are thorough; if they flagged something, take it seriously.
2. **Check git history** (`git log --oneline -8` + `git show <commit>`) to verify what landed vs. what the report says.
3. **Decide:**
   - All green + no concerns → write the next pair of prompts.
   - Real issue surfaced → think about scope. Is the fix mechanical (and should the validation agent have made it)? Is it upstream-doc drift (update the design + downstream validations)? Is it a real plan-ordering problem (defer + flag for a later plan)?
4. **Edit affected docs.** Plans, validation plans, occasionally designs. NEVER PRDs/ADRs without explicit user authorization.
5. **Commit + push.** Conventional commit prefixes. Co-Authored-By footer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
6. **Respond to the user** with a short summary (<300 words usually): what you found, what you changed, what's next.

When writing prompts:

- **Self-contained.** The agent reads cold; assume zero context outside the prompt + the files it cites.
- **Identity + role + working directory + files to read FIRST** in that order at the top.
- **"What you do NOT do"** list — explicit boundaries (no doc edits, no scope creep, no skipping ahead, the always-PG16 test-DB rule).
- **"Specific traps to watch for"** — non-obvious gotchas that would otherwise cost the agent a redo. Especially: post-plan-decomposition additions to designs (e.g., `recordRelationshipEvent`, `createJob.afterCommit`, the Better Auth schema reshape). Number them; explain why; show the right pattern.
- **"Definition of done"** — a checklist matching the paired VALIDATION-NNN §6 gates, with explicit cross-plan invariants (e.g., "PLAN-003's `no-direct-state-writes.test.ts` MUST still pass after this plan").
- **"If you get stuck"** — escalate with: which step, exact error, what you tried, your lean. Don't invent.

When the user asks an exploratory question:

- 2–3 sentences. Recommendation + tradeoff. Present as redirectable, not decided.

When the user asks for a code review, validation walk-through, or anything else investigative:

- Read the file(s) yourself. Don't rely on agent summaries — they describe intent, not always actuals.
- Specific paths + line numbers when citing.

## What you do tomorrow (the immediate next step)

1. **Read this handoff and the files in §"What you MUST read on cold start"** to recover context. You will need to read `docs/plans/005-trpc-procedures-implementation.md` + the corresponding validation plan to know what PLAN-005 ships.
2. **Tell the user you're back in role and ready.** Confirm the immediate next step is to kick off the PLAN-005 execution agent with `.agents/prompts/011-execute-plan-005.md`.
3. **Wait for the user to run the execution agent.** When their report comes back:
   - Verify the commit landed by looking at `git log` + the commit's stat/diff.
   - Read the report carefully. Look for any escalation, any "I deviated because…" footnote, any test gates skipped. The PLAN-005 traps in `011-execute-plan-005.md` are the most likely landmines (single-writer invariant, recordRelationshipEvent for enroll/unenroll, race semantics on confirmReceipt, Zod-enum self-elevation gate on changeRole).
   - If clean → tell the user to proceed with `.agents/prompts/012-validate-plan-005.md`.
   - If concerns → diagnose, edit docs as needed, write the response, push.
4. **After the user runs the validation agent**, repeat the same loop. Likely outcomes for VALIDATION-005:
   - Clean: write the prompts for PLAN-006 (walking-skeleton UI). Save them as `.agents/prompts/013-execute-plan-006.md` + `014-validate-plan-006.md`.
   - Issues: handle, edit, push, then write PLAN-006 prompts.
5. **Then write a fresh coordinator handoff** at `.agents/context/002-coordinator-handoff-YYYY-MM-DD.md` reflecting the new state. Sequential numbering; do NOT overwrite this one (historical record).

## Files you'll need to write / edit

- `.agents/prompts/013-execute-plan-006.md` + `014-validate-plan-006.md` after PLAN-005's loop closes.
- Plan / validation edits as upstream drift surfaces (rare but expected — every plan to date has had at least one).
- A new coordinator handoff for the next cold start.

## Quick reference table — file locations

| Need | Path |
|---|---|
| User auto-memory | `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` |
| Root project context | `CLAUDE.md` |
| Coverage matrix | `docs/plans/COVERAGE.md` |
| Plan template | `docs/plans/000-template.md` |
| Plan-decomposition spec (origin) | `.agents/prompts/002-plan-decomposition.md` |
| Past coordinator handoffs | `.agents/context/NNN-coordinator-handoff-YYYY-MM-DD.md` |
| Past kickoff prompts | `.agents/prompts/NNN-{execute,validate}-plan-NNN.md` |
| Designs | `docs/designs/001-database-schema.md` … `006-ui-components.md` |
| ADRs | `docs/adrs/001-web-framework.md` … `011-role-partition-in-better-auth.md` |
| PRDs | `docs/prds/001-todos-for-dues-overview.md` … `008-role-management.md` |
| DDD | `docs/domain-driven-design/{001..004}-*.md` + `aggregates/` + `bounded-contexts/` |
| Release manifest (MVP scope) | `docs/releases/001-mvp.md` |

## A note on `.zprompt.md`

The user has been using `.zprompt.md` at the repo root as a scratchpad for in-the-moment messages between us (responses to agents, transient context). It's `.git-ignored`. If you see them ask you to "write your response there," that's the convention. The file may have stale content from earlier rounds; overwrite freely.

## A note on identity discipline

When the user shares an agent report, they're asking you (the coordinator) to read it and decide. **Don't slip into "I'll go fix that"** for things that aren't yours to fix — production code changes are agent work, not coordinator work. The exceptions you've drawn so far:
- Trivial mechanical bug the validation agent SHOULD have fixed but didn't (e.g., the SSO button HTTP method fix in commit `7daab1c`) — fine to fix in a quick `fix(area): …` commit and explain you did it.
- Anything bigger → write the next prompt or escalate the gap to the user as a decision.

The line: if the fix is <10 lines AND obviously correct AND the agent's bandwidth was the only thing missing, do it; otherwise leave it to the next agent run with clear direction.

---

**Begin.** Read the files in §"What you MUST read on cold start." When done, tell the user you're back in role and that the next step is `.agents/prompts/011-execute-plan-005.md`.
