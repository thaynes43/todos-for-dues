# Coordinator self-handoff — 2026-05-17 (post PLAN-009 execution, awaiting validator report)

> **You are reading a handoff to yourself.** The conversation cache that produced this state has expired and you are starting cold to continue overseeing the TODOs for Dues project. This file plus the docs it points at are everything you need to resume the role intact. Read it end-to-end before responding to the user. **The immediate situation: PLAN-009 execution is done, the validator is mid-run, and you're back to triage the validator's report.**

## Identity & role

You are the **coordinator** for the TODOs for Dues project. The role is described in detail at `.agents/profiles/coordinator.md` — read it if you don't remember the pattern. Short version:

1. Write kickoff prompts for fresh execute + validate agents.
2. Read their reports, verify against git, decide: clean → next prompts; issue → diagnose + edit affected docs.
3. Edit plans / validations / occasionally designs in response to drift.
4. Write self-handoffs (like this one) so future-you can resume cold.

You do NOT write production code. You do NOT modify PRDs/ADRs without explicit user authorization. **Branch protection is ON `main`** — your own commits land via PR + squash-merge after CI green. The user pushes / merges; SSH agent may be locked.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS for Greek-life chapters (Sigma Phi Omicron, UMass Lowell launch chapter). Alumni post small jobs ("TODOs") with a dues contribution; Actives claim them; Moderators approve postings; Admins manage. Off-app Venmo. Tech: Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`.

**Live instance:** `https://todos-for-dues.haynesops.com` (Phase 1.1 internal, deployed during PLAN-009; image `ghcr.io/thaynes43/todos-for-dues:v0.2.2`).

**Working directories:**
- This repo: `/Users/thaynes/src/projects/todos-for-dues`
- GitOps repo: `~/src/labspace/haynes-ops/`

## What you MUST read on cold start (in order)

1. `/Users/thaynes/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` — durable user preferences.
2. `.agents/profiles/coordinator.md` — the role description (refresher if you need it).
3. `CLAUDE.md` (repo root) — canonical project context. **Now includes** the "Pull-request flow (NORMATIVE)" + "Release versioning (release-please)" sections that landed during PLAN-009 Step 2.6.
4. `apps/web/AGENTS.md` (one line) — "This is NOT the Next.js you know." Read `node_modules/next/dist/docs/` rather than relying on training-data conventions when touching the web app.
5. `docs/PROCESS.md` — docs-first SDLC.
6. `docs/plans/COVERAGE.md` — authoritative coverage matrix.
7. `git log --first-parent main --oneline -25` — see what's landed; the PR-flow history is now visible as squash-merge commits.
8. **The validator's report at `/Users/thaynes/src/projects/todos-for-dues/.zprompt.md`** — if the user has put one there, that's your first signal.
9. **The most recent prompts:** `.agents/prompts/019-execute-plan-009.md` and `020-validate-plan-009.md`.
10. **Prior coordinator handoffs at `.agents/context/00{1,2,3,4,5}-coordinator-handoff-*.md`** — historical snapshots.

After reading those, you are back in role.

## Immediate situation (the thing you're picking up)

**PLAN-009 execution: ✅ DONE.** The full execute-agent report is in handoff 005's predecessor context but the salient facts:

- **Deployed instance is functionally MVP-ready.** Workspace SSO + every FSM hop + treasurer email all verified end-to-end against `https://todos-for-dues.haynesops.com` by the execute agent (manually, via Playwright MCP against the live URL).
- **3 direct-to-main commits** before branch protection flipped (`0bc8a12 feat(docker)`, `72696c1 chore(ci)`, `3aaf946 fix(lint)`) — these are the LAST direct pushes in the project's history. Everything after is PR-flow.
- **PR #1 (`84dd75c`)** is the protection-flip + CLAUDE.md PR-flow docs.
- **PRs #2–#8** landed release-please + 3 prod-discovered fixes + 3 auto-release PRs.
- **Tags:** `v0.2.0`, `v0.2.1`, `v0.2.2` all exist on origin; image pinned in haynes-ops is `:v0.2.2`.
- **haynes-ops PRs #1769–#1772** landed the deployment + 3 ops fixes (image-bump for users.image, IPv4-first DNS, RESEND_FROM_ADDRESS env).

**PLAN-009 validator: 🟡 RUNNING** (as of when this handoff was written). The user will paste its report into `.zprompt.md` when it returns. **That's your next signal.**

## Two PRs currently open by you

1. **PR #9** `add-agent-profiles` — `.agents/profiles/coordinator.md` + `.agents/profiles/developer.md`. **Already merged** (the profile-restore + the user's `developer.md` write). On main as commit `4e2ea9e`.
2. **PR #11** `doc-reconciliation-plan-009` — DESIGN-001 §4.2 + §5.3 reconciliation notes, `users.image` column added to the Drizzle declaration, `assert_min_one_admin` function body updated to the `TG_OP`-aware version, PLAN-002 + PLAN-009 changelog entries, new PLAN-013 §3.1 backlog folding in 6 follow-up items. **Open, awaiting CI green + merge.** No code changes; docs-only.

If PR #11 is still open when you cold-start, check `gh pr checks 11` — if green, ask the user whether to squash-merge.

## What landed in PLAN-009 (the 7 reconciliations)

The execute agent's deploy surfaced 7 upstream-doc + ops issues, all already captured in PR #11's doc reconciliations. **You don't need to re-flag any of these to the user** — they're known:

1. **OIDC callback URI typo** in PLAN-009 §7 + the original execute prompt 019 Trap 8/9 — used `/api/auth/callback/oauth/{providerId}` but Better Auth's `genericOAuth` actually uses `/api/auth/oauth2/callback/{providerId}`. Workspace OIDC redirect URI was corrected manually in Google Cloud Console; doc fixed in PLAN-009 changelog (2026-05-17 entry).
2. **`users.image` column missing** — Better Auth 1.6.x writes the OIDC `picture` claim there unconditionally. Migration `0007_users_add_image.sql` (PR #6) is the fix; DESIGN-001 §4.2 reconciled in PR #11.
3. **min-Admin trigger fires on INSERT** — blocked bootstrap of a fresh chapter. Migration `0008_fix_min_admin_trigger_bootstrap.sql` (PR #7) replaces the function body with a `TG_OP`-aware version that only enforces on UPDATE-demotion + DELETE-of-Admin. DESIGN-001 §5.3 reconciled in PR #11.
4. **cluster16 IPv4-only egress vs Node Happy-Eyeballs IPv6-first** — OAuth token-exchange fetches timed out. Fix: `NODE_OPTIONS=--dns-result-order=ipv4first` in haynes-ops Deployment env (PR #1771).
5. **`RESEND_FROM_ADDRESS` env override** — default in `send-email.ts` is unverified placeholder; chapter's verified domain is `sigoalumni.org`. Fix in haynes-ops env (PR #1772). **Follow-up flagged for PLAN-013:** fail-fast at boot if `NODE_ENV==='production'` and the var is missing or matches placeholder.
6. **Playwright not run in CI** — GHA `test` job runs vitest only. Execute agent compensated by running PLAN-008's chained walking-skeleton manually against the deployed URL via Playwright MCP. **Follow-up flagged for PLAN-013:** wire `pnpm --filter web e2e` into CI as `e2e.yml` (likely advisory-only at first).
7. **GHCR package visibility** — flipped to public manually via web UI (no API). Future tagged releases inherit. Runbook entry queued for PLAN-013.

Plus the **Dockerfile target shape** the execute agent chose: single image with co-located migrator (`/app` for Next.js standalone + `/migrator` for the `pnpm --filter @app/db deploy --legacy --prod` subtree + globally-installed `tsx@4.21.0`). Picked over split runtime/migrator images because ops simplicity > ~50MB size cost.

## What the validator is going to check

Per `.agents/prompts/020-validate-plan-009.md` §6 + the "Specific things to look hard at" section. Highlights:

- **Dockerfile builds locally + `docker run` boots.**
- **CI workflow runs on PRs**, `build-image` does NOT.
- **Branch protection active** — verified via `gh api` AND a **live test** that attempts `git push origin main` from a clean checkout and confirms `protected branch hook declined`. The validator was told to discard the probe commit after confirming rejection.
- **CLAUDE.md** has both new sections verbatim per PLAN-009 §4 Step 2.6.
- **release-please active** — feat PR merged → release PR auto-opens → merge → `vX.Y.Z` tag → `build-image` runs → GHCR image pushed. Already exercised 3× (v0.2.0/v0.2.1/v0.2.2).
- **haynes-ops manifests present + image pinned to `:vX.Y.Z` (not `:latest`)**.
- **External Secrets** references all required keys (no test-mode env vars like `RESEND_TEST_MODE` or `OIDC_DISCOVERY_URL` in prod).
- **Pod Running**, init container migrate succeeded, **`chapter_settings` has real values** (not `*.invalid` placeholders).
- **HTTPS smoke** — `/`, `/login`, `/api/auth/sign-in/email` POST → 4xx, `/api/trpc/...` → tRPC response, **`/api/test/resend-calls` → 404** (proves `RESEND_TEST_MODE` is NOT set in prod).
- **Bootstrap admin path + walking-skeleton smoke** — user-driven; the execute agent already confirmed these, the validator likely verifies via DB inspection + spot-checking.
- **Cross-plan invariants:** PLAN-003 static check, PLAN-005 integration (111), PLAN-006/008 Playwright (locally; CI gap is documented per item 6 above and the prompt explicitly allows for it).
- **`unset DATABASE_URL && pnpm --filter web build`** still exits 0 (PLAN-002 lazy Proxy intact).
- **`pnpm -r typecheck`** exits 0.

## Likely validator outcomes + what you do for each

**(a) All gates green, no concerns.** Most likely outcome — the execute agent's report was thorough and the live state matches. Your job:
1. Verify against git + spot-check the validator's claimed live-state assertions.
2. **Ask the user which plan is next: PLAN-010 (MVP UI rest — job-loop completion) or PLAN-013 (live-instance ops — Playwright-in-CI + runbook + Grafana dashboards).** Both are legitimate; user's call. Lean: PLAN-013 since the live deploy is fresh and the post-deploy review is queued. But PLAN-010+ ships features and might be the higher-leverage move.
3. If user picks PLAN-013: **first flip its status from `Draft` to `Proposed`** in the frontmatter, possibly reshape §3 Outputs based on real friction (the §3.1 backlog PR #11 added is a head start), then write `.agents/prompts/021-execute-plan-013.md` + `022-validate-plan-013.md`. The plan-013 §1 circuit-breaker explicitly asks for this conversation before execution.
4. If user picks PLAN-010: write `.agents/prompts/021-execute-plan-010.md` + `022-validate-plan-010.md` directly — PLAN-010 is `Proposed` and doesn't need a reshape pass.

**(b) Mechanical issue (e.g., a single missing field in External Secrets manifest, a typo in CLAUDE.md, a missing env var).** Branch + fix-commit + PR + ask user to merge after CI green. Examples to expect:
- `RESEND_WEBHOOK_SECRET` missing from External Secrets (PLAN-007's Svix webhook needs it). Verify with `kubectl describe deploy -n frontend todos-for-dues | grep RESEND_WEBHOOK_SECRET`.
- `BETTER_AUTH_URL` not set to the production URL (defaults to localhost; OIDC callback fails). Verify via `kubectl describe`.
- CLAUDE.md PR-flow section text doesn't match PLAN-009 §4 Step 2.6 verbatim (the spec said "verbatim").
- Required-status-check name mismatch between `gh api ... protection` and CI workflow job key.

**(c) Real ops gap (e.g., the `live test` of branch protection somehow didn't reject, or the prod URL has wrong cookie domain).** Diagnose; the validator's prompt allows it to make `fix(area):` mechanical commits but anything bigger should escalate. Read the validator's report carefully — they're instructed to surface "deviations to flag (no gate failed, no fix applied)" separately from real failures.

**(d) Cross-plan invariant regression** (PLAN-003 / PLAN-005 / PLAN-007 / PLAN-008 broke on the new CI). Read the actual test output; the fix is in PLAN-009's modifications, not the regressed test. Do NOT add to PLAN-003's IGNORE_DIRS.

## Outstanding low-priority items (NOT blockers; don't surface unprompted)

These are explicitly known and either deferred or in PLAN-013's backlog. Don't re-flag them when triaging the validator's report:

- **Test users in prod DB** (3 seeded credential users matching `%-1b767b72@%` + 2 closed test jobs). User can leave or drop with the SQL in the execute agent's report. The validator won't fail on these.
- **PLAN-013 still `Draft`** — circuit-breaker requires the post-deploy review with the user before promotion. The §3.1 backlog PR #11 added is the head start.
- **Profile development.md** — was authored by the user, not by you; co-merged in PR #9. Don't second-guess its content unless explicitly asked.
- **Playwright-in-CI** — documented gap; in PLAN-013 backlog.
- **`bootstrap-admin.spec.ts` test.skip** — flagged in PLAN-008 + now feasible to reshape post-trigger-fix; PLAN-013 backlog.

## What you do tomorrow (the immediate next step)

1. **Read this handoff + the files in §"What you MUST read on cold start"** to recover context.
2. **Check for the validator's report at `.zprompt.md`.** If present, that's your starting point.
3. **Check PR #11 status** (`gh pr checks 11` + `gh pr view 11`). If green and not merged, mention it to the user.
4. **Tell the user you're back in role.** Acknowledge the validator-running situation.
5. **When the validator's report arrives:** triage per "Likely validator outcomes" above. Outcome (a) is most likely; outcomes (b)/(c) are possible; outcome (d) would be surprising.
6. **After triage closes:** ask the user PLAN-010 vs PLAN-013. Write the next prompt pair. Land via PR (branch protection is on now).
7. **Write a fresh handoff** at `.agents/context/007-coordinator-handoff-YYYY-MM-DD.md` after that cycle closes.

## Files you'll likely need to write / edit next

- `.agents/prompts/021-execute-plan-{010,013}.md` + `022-validate-plan-{010,013}.md` after the user picks the next plan.
- If proceeding with PLAN-013: amend `docs/plans/013-live-instance-ops-implementation.md` frontmatter status `Draft` → `Proposed` and reshape §3 Outputs based on the user's post-deploy review notes. The §3.1 backlog from PR #11 is the starting point.
- A new coordinator handoff for the next cold start.

## Quick reference table — file locations

| Need | Path |
|---|---|
| User auto-memory | `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` |
| Coordinator role profile | `.agents/profiles/coordinator.md` |
| Developer role profile | `.agents/profiles/developer.md` |
| Root project context | `CLAUDE.md` (now includes PR-flow + release-please sections from PLAN-009) |
| Web app gotchas | `apps/web/AGENTS.md` |
| Coverage matrix | `docs/plans/COVERAGE.md` |
| Plan template | `docs/plans/000-template.md` |
| Past coordinator handoffs | `.agents/context/00{1..6}-coordinator-handoff-YYYY-MM-DD.md` |
| Past kickoff prompts | `.agents/prompts/NNN-{execute,validate}-plan-NNN.md` |
| Designs | `docs/designs/001-database-schema.md` … `006-ui-components.md` |
| ADRs | `docs/adrs/001-web-framework.md` … `011-role-partition-in-better-auth.md` |
| PRDs | `docs/prds/001-todos-for-dues-overview.md` … `008-role-management.md` |
| DDD | `docs/domain-driven-design/{001..004}-*.md` + `aggregates/` + `bounded-contexts/` |
| Release manifest (MVP scope) | `docs/releases/001-mvp.md` |
| haynes-ops manifests | `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/` |
| Live instance URL | `https://todos-for-dues.haynesops.com` |
| GHCR image | `ghcr.io/thaynes43/todos-for-dues:v0.2.2` (public) |

## A note on `.zprompt.md`

User uses `.zprompt.md` at the repo root as a scratchpad for in-the-moment messages (agent reports, transient context). `.git-ignored`. If they say "agent's feedback is here" or just open the file, that's where to look. Overwrite freely.

## A note on identity discipline (post PR-flow)

Branch protection is on. Your own fix-commits land via PR + squash-merge — `git checkout -b fix-<area>` + commit + `git push -u origin <branch>` + `gh pr create`. Wait for CI green; ask the user to merge (or merge yourself if they've authorized it; current default is they merge).

The <10-line mechanical fix rule still applies: small obvious fix you'd otherwise hand to the next agent → fine. Larger work → write a prompt.

## A note on this handoff being slightly speculative

The validator is running while this handoff is being written. The "likely outcomes" section is your best guess at what happens next; the actual report may surface something unexpected. **Trust the report over this handoff** when they disagree, and write the next handoff (007) capturing the actual outcome.

---

**Begin.** Read the files in §"What you MUST read on cold start." When done, tell the user you're back in role and ready to triage the PLAN-009 validator report.
