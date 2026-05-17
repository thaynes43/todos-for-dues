# Coordinator self-handoff — 2026-05-16 (post PLAN-008 validation, pre PLAN-009)

> **You are reading a handoff to yourself.** The conversation cache that produced this state has expired and you are starting cold (next day or later) to continue overseeing implementation of the TODOs for Dues project. This file plus the docs it points at are everything you need to resume the role intact. Read it end-to-end before responding to the user.

## Identity & role

You are the **coordinator** for the TODOs for Dues project. You are NOT an execution agent. Your job is:

1. **Write kickoff prompts** for fresh execution + validation agents (`.agents/prompts/NNN-execute-plan-NNN.md` and `NNN-validate-plan-NNN.md`).
2. **Read agent reports** and decide: clean → next prompts; issue surfaced → diagnose + propagate fixes to upstream plans / designs / validations.
3. **Edit plans, validations, and (sparingly) designs** when execution surfaces real conflicts or upstream drift.
4. **Maintain `docs/plans/COVERAGE.md`** if the plan ordering or scope shifts (hasn't been needed since the initial decomposition).

You do NOT write production code. You do NOT modify PRDs or ADRs without explicit user authorization. You commit your own work; the user runs `git push` (SSH agent may be locked).

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Sigma Phi Omicron, UMass Lowell is the launch chapter). Alumni post small jobs ("TODOs") with a dues contribution; Actives claim them; Moderators approve postings; Admins manage. Off-app Venmo. Tech: Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`.

**Working directory:** `/Users/thaynes/src/projects/todos-for-dues`.
**External repo:** `~/src/labspace/haynes-ops/` (GitOps manifests; PLAN-009 lands changes there).

## What you MUST read on cold start (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — durable user preferences.
2. `CLAUDE.md` (repo root) — canonical project context. **Domain invariant — FSM-only state writes** is load-bearing. Also: after PLAN-009 Step 2.6 lands, this file gains a "Pull-request flow (NORMATIVE)" section and a "Release versioning (release-please)" section — re-read those if PLAN-009 has completed.
3. `apps/web/AGENTS.md` (one line) — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` rather than relying on training-data conventions when touching the web app.
4. `docs/PROCESS.md` — docs-first SDLC ordering.
5. `docs/plans/COVERAGE.md` — authoritative coverage matrix (PRD/DESIGN/CMD → plan + validation).
6. `git log --oneline -25` — see what's landed.
7. **The most recent prompts in `.agents/prompts/`** — currently `019-execute-plan-009.md` and `020-validate-plan-009.md`.
8. **All plan + validation plan pairs** for executed plans (001–008) so you know the actual landed shape. Skim, don't deep-read.
9. The prior coordinator handoffs at `.agents/context/00{1,2,3,4}-coordinator-handoff-*.md` — historical context, status snapshots one to four steps behind.

After reading those, you are back in role.

## Current state (snapshot at 2026-05-16, post-PLAN-008)

### Plans executed + validated (✅ committed)

- **PLAN-001** scaffolding (`2d7da94`).
- **PLAN-002** DB schema (`4b318e2`) — 8 tables + 4 migrations + lazy `db` Proxy + chapter_settings bootstrap (0004 + 0005 GUC plumbing).
- **PLAN-003** FSM module (`f439d42`) — `transitionJob` / `createJob` (afterCommit) / `approveJob` (two-row) / `recordRelationshipEvent` / `transitionRole` / `transitionRolesAtomically` / typed errors. Load-bearing `no-direct-state-writes.test.ts`.
- **PLAN-004** Better Auth wiring (`5553619` + `aa9ddaf` + `7daab1c` SSO POST-button fix). The 3 SSO Playwright specs originally `test.fixme()`'d here were un-fixme'd in PLAN-008.
- **PLAN-005** tRPC procedures (`98ab962`) — 5 routers + 111/111 integration tests.
- **PLAN-006** walking-skeleton UI (`5ce00c7` + `c87e934`) — 5 routes, ~12 components, Vitest 53/53 + Playwright 7/7×3-no-flake (per-page specs).
- **PLAN-007** notifications (`8da9c1f`) — `@app/settings` package + `getSetting<T>` per ADR-010 + real Resend-backed helpers + 4 React Email templates + Resend bounce/complaint webhook with real Svix HMAC verification.
- **PLAN-008** walking-skeleton E2E (`54ea551`) — canonical chained Playwright spec + in-process OIDC mock + 4 consolidated SSO specs + `nextCookies` plugin + per-spec test isolation + Resend test seam at `/api/test/resend-calls`. Validation green (gates passed; 3 deviations flagged + accepted — captured in PLAN-008's changelog at `docs/plans/008-walking-skeleton-e2e-test.md` per 2026-05-16 entry). Deviations:
  - **Route path** is `/api/test/resend-calls`, NOT `/api/_test/resend-calls` — Next.js 16 treats `_`-prefixed folders as private and skips them from routing entirely (would yield 404 regardless of `RESEND_TEST_MODE`). Functionally equivalent; both methods env-gated.
  - **SSO specs consolidated** into a single `apps/web/__e2e__/auth/sso.spec.ts` running `mode: 'serial'` (4 tests). The OIDC mock's `nextProfile` slot is shared global state; parallel workers race. Reasonable + read-friendly.
  - **`requireLocalEmailVerified: false`** on Better Auth `accountLinking` in `packages/auth/src/config.ts` — MVP credential signup has no email-verification UI, so without this override Better Auth refuses trusted-provider auto-link. Aligns with PRD-003 R-09's "trustedProviders just-works" intent. Documented in code comment + commit body.
  - **`bootstrap-admin.spec.ts` is `test.skip(true, ...)`** with documented rationale — globalSetup pre-seeds `BOOTSTRAP_ADMIN_EMAIL` as Admin (so walking-skeleton can sign in via form), making the "sign up THEN bootstrap-promote" browser premise no longer reproducible. Bootstrap-hook behavior still covered by unit + integration tests + implicit firing during walking-skeleton Admin sign-in. **Follow-up (low priority):** reshape globalSetup so the spec owns a non-pre-seeded `BOOTSTRAP_ADMIN_EMAIL` email. Defer unless a regression slips past unit/integration.

### Plans NOT yet executed

- **PLAN-009** deploy to haynes-ops cluster (next — your prompts are at `.agents/prompts/019-execute-plan-009.md` + `020-validate-plan-009.md`). Bundles Dockerfile + GHA CI + **branch protection on `main`** + CLAUDE.md PR-flow + release-please v4 + Kubernetes manifests in haynes-ops + bootstrap admin + walking-skeleton smoke against the deployed URL. The first plan where direct push to `main` is no longer the default — see "PR-flow ordering" below.
- **PLAN-010 / 011 / 012** MVP UI rest (job-loop completion, Admin view, role-management UI).
- **PLAN-013** live-instance ops (DRAFT, circuit-breaker in §1: status stays `Draft` until a post-PLAN-009-deploy review with the user reshapes §3 Outputs around real friction). Likely scope: `apps/web/playwright.config.live.ts` + read-only smoke specs against the live URL, `docs/ops/runbook.md`, `/api/health` endpoint, Grafana dashboards + alerts via the user's Grafana MCP setup. Don't write prompts for this until the user signals the post-deploy review happened.

### PLAN-009: the PR-flow ordering question (KEY)

PLAN-009 is the **first plan that flips this project from develop-on-main to PR-flow**. The execute prompt (`019-execute-plan-009.md`) has a "PR-flow ordering question" section that resolves this. The dependency chain is:

1. **Step 1 (Dockerfile)** — direct commit. No PR (CI doesn't gate yet).
2. **Step 2 (CI workflow)** — direct commit. The push registers the status-check context names with GitHub.
3. **Step 2.5 (enable branch protection via `gh api`)** — direct commit. **LAST direct push.** After this, `git push origin main` is rejected.
4. **Step 2.6 (CLAUDE.md PR-flow docs)** — via PR.
5. **Step 2.7 (release-please)** — via PR.
6. **Step 3+ (Postgres, External Secrets, Deployment, etc.)** — manifests are in haynes-ops; that repo's flow is separate. Within this repo, any further commits land via PRs.
7. **First feat-PR after 2.7 lands** — exercises release-please. release-please opens a release PR within ~2 min; user merges it; `vX.Y.Z` tag is created; `build-image` job runs against the tag; GHCR image is pushed.

**Lean:** 3 separate direct commits (Steps 1, 2, 2.5) for clean per-feature history, then PRs from 2.6 onward.

The validate prompt verifies the transition via `git log --first-parent main --oneline`.

### Branch protection status

**NOT yet enabled** as of this handoff. PLAN-009 Step 2.5 lands it.

### User-side ops PLAN-009 will require (flag in commit body)

1. **Workspace OIDC redirect URI registration** in Google Cloud Console / Workspace admin — must match exactly: `https://todos-for-dues.haynesops.com/api/auth/callback/oauth/google-workspace`. User-side.
2. **Resend domain verification** — DNS records (SPF/DKIM) for the sending domain. Until verified, emails to non-allowlisted recipients bounce.
3. **Resend webhook URL configuration** in the Resend dashboard — POST to `https://todos-for-dues.haynesops.com/api/webhooks/resend` with the matching `RESEND_WEBHOOK_SECRET` Svix secret.
4. **1Password Connect items** for all 12+ secrets (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, OIDC_*, BOOTSTRAP_*, RESEND_*) — user creates if missing.
5. **`enforce_admins: false`** is intentional in the branch-protection ruleset — keeps coordinator break-glass. Flip post-launch if desired.

### Open architectural decisions (none currently contested)

- Q-DSG-04 in DESIGN-001: `jobs.per_active_dues_credit` jsonb vs join table — currently jsonb; defers join-table promotion to pre-REL-002.
- Versioning: release-please v4. Lands in PLAN-009 Step 2.7.

### Flagged follow-ups (status)

1. **`bootstrap-admin.spec.ts` reshape** (PLAN-008 deviation, low priority): allow the spec to own a non-pre-seeded `BOOTSTRAP_ADMIN_EMAIL` so the "sign up THEN bootstrap-promote" browser flow is reproducible. Coverage retained via unit/integration. Defer unless a regression slips past those layers.
2. **`__e2e__/` vs `e2e/` directory split** (PLAN-006 leftover, low priority): PLAN-004 used `__e2e__/`; PLAN-006/008 used `e2e/`. Both work because `playwright.config.ts` includes both. Cleanup if it bothers you.

## The pattern (how you work)

When the user shares an agent report:

1. **Read the report carefully.** Look for: gates passed, gates failed, escalations, deviations from the plan, hints of upstream-doc drift.
2. **Check git history** (`git log --oneline -8` + `git show <commit>`) to verify what landed vs. what the report says.
3. **Decide:**
   - All green + no concerns → write the next pair of prompts.
   - Real issue surfaced → think about scope. Mechanical fix? Upstream-doc drift? Plan-ordering problem?
4. **Edit affected docs.** Plans, validation plans, occasionally designs. NEVER PRDs/ADRs without explicit user authorization.
5. **Commit.** Conventional commit prefixes. `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. User pushes.

**After PLAN-009 Step 2.5 lands, branch protection is on.** Subsequent coordinator commits land via PR — branch + commit + open PR (`gh pr create`) + wait for CI green + squash-merge. Same flow for all execution + validation agents.

When writing prompts:

- **Self-contained.** Agent reads cold; assume zero context outside the prompt + the files it cites.
- **Identity + role + working directory + files to read FIRST** at the top.
- **"What you do NOT do"** list — explicit boundaries.
- **"Specific traps to watch for"** — numbered; non-obvious gotchas with why + right pattern. ALWAYS include the Next.js 16 reminder for web-touching prompts.
- **"Definition of done"** — matches paired VALIDATION-NNN §6 gates + explicit cross-plan invariants. After PLAN-008: the invariants are (1) PLAN-003 static-analysis, (2) PLAN-005 integration tests, (3) PLAN-006 walking-skeleton, (4) PLAN-007 notifications + settings, (5) PLAN-008 chained walking-skeleton + 4 SSO + non-SSO auth.
- **"If you get stuck"** — escalate with: step, error, what tried, lean.

When the user asks exploratory questions:

- 2–3 sentences. Recommendation + tradeoff. Redirectable, not decided.

When investigating:

- Read files yourself. Don't rely on agent summaries — they describe intent, not always actuals.

## What you do tomorrow (the immediate next step)

1. **Read this handoff and the files in §"What you MUST read on cold start"** to recover context. You will need to read `docs/plans/009-deploy-prototype.md` + the paired `*-validation.md` + the most recent `git log` to confirm PLAN-008 commit landed.
2. **Tell the user you're back in role and ready.** Confirm next step is `.agents/prompts/019-execute-plan-009.md`.
3. **Wait for the user to run the execution agent.** When their report comes back:
   - Verify the commits landed (`git log --first-parent main --oneline -10`).
   - PLAN-009 traps most likely to bite:
     - Required status-check context names misnamed (Step 2.5 references `["lint-and-typecheck", "test"]` — Step 2's `ci.yml` job keys must match EXACTLY).
     - Dockerfile build fails without `DATABASE_URL` (regression of PLAN-002's lazy Proxy).
     - Init container missing `tsx` or one of the 5 `BOOTSTRAP_*` env vars → `chapter_settings` seeds `*.invalid` placeholders.
     - OIDC redirect URI mismatch in Workspace admin (user-side).
     - release-please workflow missing `permissions: { contents: write, pull-requests: write }` → no release PR opens.
     - haynes-ops Postgres provisioning pattern unclear → escalate before inventing.
     - First post-2.5 PR hangs on CI because of context-name mismatch — agent can `gh api PUT … protection` with corrected names (break-glass via `enforce_admins: false`).
   - If clean → tell the user to proceed with `.agents/prompts/020-validate-plan-009.md`.
   - If concerns → diagnose, edit docs as needed, write the response, commit.
4. **After the user runs the validation agent**, repeat the loop. Likely outcomes:
   - Clean: this is a major milestone — the prototype is deployed and the project is on PR-flow. Two next moves:
     - (a) Have the post-PLAN-009 review with the user to **flip PLAN-013 from `Draft` to `Proposed`** and reshape its §3 Outputs around real friction from the deploy. Then write `.agents/prompts/021-execute-plan-013.md` + `022-validate-plan-013.md`.
     - (b) OR, if the user wants to keep building features first, write prompts for PLAN-010 (MVP job-loop UI rest). PLAN-010/011/012 ship via the new CI pipeline; no separate deploy plans.
     - Lean: ask the user which order they prefer. Live-instance ops backlog (PLAN-013) is a maturity move; MVP UI rest (PLAN-010+) is a scope move.
   - Issues: handle, edit, branch + PR (branch protection is on), then write the next plan's prompts.
5. **Then write a fresh coordinator handoff** at `.agents/context/006-coordinator-handoff-YYYY-MM-DD.md`. Sequential; do NOT overwrite.

## Files you'll need to write / edit

- `.agents/prompts/021-execute-plan-{010,013}.md` + `022-validate-plan-{010,013}.md` after PLAN-009's loop closes. The choice depends on the user's lean.
- If proceeding with PLAN-013: amend `docs/plans/013-live-instance-ops-implementation.md` to flip status `Draft` → `Proposed` and reshape §3 Outputs based on the user's post-deploy review notes. Then write the prompts.
- A new coordinator handoff for the next cold start.

## Quick reference table — file locations

| Need | Path |
|---|---|
| User auto-memory | `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` |
| Root project context | `CLAUDE.md` |
| Web app gotchas | `apps/web/AGENTS.md` |
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
| haynes-ops manifests (will be added by PLAN-009) | `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/` |

## A note on `.zprompt.md`

User uses `.zprompt.md` at the repo root as a scratchpad for in-the-moment messages (responses to agents, transient context). `.git-ignored`. If they say "agent's feedback is here," that's the file. Overwrite freely.

## A note on identity discipline

When the user shares an agent report, they're asking you (the coordinator) to read it and decide. **Don't slip into "I'll go fix that"** for things that aren't yours to fix. The line: if the fix is <10 lines AND obviously correct AND the agent's bandwidth was the only thing missing, do it; otherwise leave it to the next agent run with clear direction.

After branch protection lands (PLAN-009 Step 2.5), your own fix-commits also need a PR. Use `gh pr create` from a feature branch; squash-merge after CI green.

---

**Begin.** Read the files in §"What you MUST read on cold start." When done, tell the user you're back in role and that the next step is `.agents/prompts/019-execute-plan-009.md`.
