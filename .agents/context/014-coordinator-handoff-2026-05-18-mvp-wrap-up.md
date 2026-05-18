# Coordinator self-handoff — 2026-05-18 (MVP wrap-up; trap-closure verified; deploy queued)

> **You are reading a handoff to yourself.** Cold-start context. **The immediate situation: PR #35 + PR #36 closed the e2e test-infra hardening (PLAN-013 §3.1 #1 + #2 + #3 + #10); v0.7.2 + v0.7.3 cut and auto-built (PAT pipeline verified twice); deploy queued for v0.7.3 via prompt 035.**

## Identity & role

Coordinator. Profile: `.agents/profiles/coordinator.md`. No production code; PR + squash-merge.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS. Live at `https://todos-for-dues.haynesops.com` running **v0.6.0**. v0.7.0 / v0.7.1 / v0.7.2 / v0.7.3 cut + image-built (deploy paused until user authorized). Tech: Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`. MVP is feature-complete (PLAN-001..014); this wrap-up cycle hardened CI + closed test-infra defects ahead of the deploy + click-through.

## What you MUST read on cold start (in order)

1. `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`
2. `.agents/profiles/coordinator.md`
3. `CLAUDE.md`
4. `docs/plans/COVERAGE.md`
5. `git log --first-parent main --oneline -25` + `gh pr list --state open`
6. **Most-recent prompts:** `.agents/prompts/033-execute-test-infra-hardening.md` + `.agents/prompts/034-execute-signin-glob-fix-and-collapse.md` + `.agents/prompts/035-deploy-v0.7.3-to-haynes-ops.md`
7. **PLAN-013 §3.1** — the 10 architecture follow-ups (5 now closed; 5 remain open as refactor/optimization/waiting-period items).
8. **Runbook §9** — now banner-marked RESOLVED; documents the historical workarounds as fallback only.
9. **Prior handoffs:** `.agents/context/012-*.md` + `.agents/context/013-*.md` (skim — the trap-watching context is now historical).

## Current state (snapshot at end of 2026-05-18)

### Plans live ✅ on main

- **PLAN-001..014** all merged. v0.6.0 live in production.
- **PLAN-013** merged (PR #27 + iter-2 PR #28 + hybrid trigger PR #30 + PAT PR #31 + test-infra hardening PR #35 + signInAs glob fix PR #36).

### Releases cadence — trap closure verified

| Tag | Auto-build? | GHCR landing |
|---|---|---|
| v0.3.0..v0.6.0 | No (GITHUB_TOKEN trap) | manual recovery x4-5 |
| v0.7.0 | No (release-event swap was incomplete) | `gh release delete + create` recovery |
| v0.7.1 | No | manual tag re-push (hybrid trigger restored) |
| **v0.7.2** | **YES** (PAT auto-fire, first verification) | landed automatically |
| **v0.7.3** | **YES** (PAT auto-fire, second verification) | landed automatically |

The `GITHUB_TOKEN`-trap is dead under normal operation. Runbook §9 updated with resolution banner.

### Open PRs (verify on cold start)

`gh pr list --state open --limit 10`. Expected: this coordinator-cycle PR (handoff 014 + doc updates + prompt 035 + prompts 033/034 committed); possibly the v0.7.3 release-please PR if user hasn't merged yet (was open at handoff-write).

### Deploy posture

**Authorized to proceed.** User said: "Let's wrap up the MVP and do #2 and fix any other known issues we have with the features we have right now. Then we can deploy and I will add a few users and test everything and come back with recommendations for next new product features."

Wrap-up code work is done (PR #35 + PR #36). Next step is user authorizes deploy → developer agent runs prompt 035 → v0.7.3 image deploys to haynes-ops (probe paths bumped `/` → `/api/health` in the same PR) → user does click-through.

### PLAN-013 §3.1 status (10 items)

| # | Description | Status |
|---|---|---|
| 1 | `demoteAllOtherAdmins` clobber | **Partially closed** (PR #35) — chapter-state pair amendment documented; remaining work is architectural (trigger chapter-scoping). |
| 2 | `invites.spec.ts` count race | **CLOSED** (PR #35) — UUID self-filter. |
| 3 | Full e2e workflow collapse | **CLOSED** (PR #36) — 3× green DEFAULT-workers `fullyParallel: true`. |
| 4 | Flip `e2e` to required-status-check | Open — waiting period (2 weeks of green main). |
| 5 | GHA cold-runner Playwright wall time | Open — optimization, not bug. |
| 6 | `RESEND_FROM_ADDRESS` → `instrumentation.ts` | Open — refactor. |
| 7 | `/api/health` Vitest mock helper | Open — refactor. |
| 8 | Smoke spec strict against pre-v0.7.x | Open — resolves itself after v0.7.3 deploys. |
| 9 | PAT for release-please | **CLOSED** (PR #31) — verified by v0.7.2 + v0.7.3. |
| 10 | `signInAs` glob mismatch | **CLOSED** (PR #36) — regex replacement. |

Five closed, four open (refactor / optimization / waiting period — none are launch blockers), one architectural (chapter-state trigger scope; out of scope for the e2e layer).

### Cross-plan invariants (the live list)

All green per PR #35 + PR #36 reports. PLAN-001..014 + PLAN-013 are now stable on `main`. Invariants list:
- `pnpm -r typecheck` green (8 packages).
- `pnpm -r test` green (462 Vitest tests).
- `pnpm --filter @app/domain test no-direct-state-writes` green (FSM-only writes invariant).
- `unset DATABASE_URL && pnpm --filter web build` green (lazy-Proxy invariant).
- `pnpm --filter web e2e` green 3× consecutively under DEFAULT workers (per PR #36).
- Live smoke 2/3 green against v0.6.0 (1/3 expected-fail on `/api/health` until v0.7.3 deploys → will be 3/3).

## The queue (forward-looking)

### A — Right now (your call once user signals)

1. **User merges release-please PR for v0.7.3** (or v0.7.4 if a `fix(e2e):` from PR #36 triggered another bump — `fix:` should ride). Admin-merge required (release-please PRs can't get CI on head). After merge, watch for the auto-build (third PAT verification — should be unremarkable).
2. **Deploy v0.7.3 via prompt 035.** Developer agent runs prompt → haynes-ops PR opens → user authorizes Gate 3 → reconcile → smoke 8/8 incl. live smoke 3/3.
3. **Pre-beta validation (PLAN-009 deferred gates).** User-driven click-through against the freshly-deployed v0.7.3:
   - Walking-skeleton full click-through (PostJob → Approve → Enroll → Lock → Complete → MarkPaymentSent) with real personas + real Resend treasurer email delivery.
   - SSO bootstrap-admin live click-through (Workspace OIDC redirect URI → first signin → role grant + audit row).
   - Invite-management live click-through (mint Active invite → external signup → role check).
4. **User returns with product feature recommendations** based on what the click-through surfaces.

### B — Open items, NOT launch-blocking (defer)

- PLAN-013 §3.1 #4 — flip `e2e` to required-status-check (after 2 weeks of green main).
- PLAN-013 §3.1 #5 — GHA cold-runner Playwright wall time (optimization).
- PLAN-013 §3.1 #6 — `RESEND_FROM_ADDRESS` → `instrumentation.ts` hook (refactor).
- PLAN-013 §3.1 #7 — `/api/health` Vitest mock helper (refactor).
- PLAN-013 §3.1 #1 architectural — `assert_min_one_admin` trigger chapter-scoping (would unblock the chapter-state pair's solo invocations; nice-to-have, not required).
- `enforce_admins: true` flip on `main` branch protection (coordinator one-shot).
- `bootstrap-admin.spec.ts` test.skip reshape (documented-as-covered; refactor).
- Better Auth `auth-client` wiring (currently `router.refresh()` per PLAN-012).
- PLAN-015 — Observability (Grafana dashboards + alerts via MCP). Iterative; author when the observability gap pinches.
- PLAN-017 (proposed) — pre-beta validation plan as a formal doc. Could author now or after the click-through; user's call.

### C — Bundled-into-next-deploy work (NOT yet started; awaits user direction)

These would slot in if user wants to bundle before the v0.7.x → v0.8.0 cycle:

- **Email delivery of invite URLs** (PRD-003 §10 / PLAN-014 §6 backlog). Resend template + `invites.send` procedure + UI flow. ~2-3 hours total. New PRD/plan if user pursues.
- **`/admin/audit-log` UX polish** — actor/text search if launch chapter asks for it (PRD-007 §7.1 explicit defer; revisit on demand).
- **Tipping flow** — PRD-005 §7 placeholder. `<TippingNudge />` already in `JobDetailView` but the actual flow isn't built. ~4-5 hours.

## Coordinator lessons (accumulating, MVP edition)

- **PLAN-009..014 lessons** carry forward (handoffs 007-011).
- **PLAN-013 iteration-2 lesson** — advisory CI doing its job; iterate scope discipline (handoff 012).
- **PLAN-013 iteration-3 lesson** — Subagent A's unverified `release: types: [published]` hypothesis cost a release cycle; validators must run synthetic verifications BEFORE the work ships (handoff 013).
- **PLAN-013 wrap-up lesson #1 (this cycle):** PR #35's agent admitted dropping the 3× full-suite local verification due to time budget; PR #36's prompt called that out explicitly and the agent hit the bar. Lesson: name the prior cycle's gap in the next prompt's Definition of Done, with a "non-negotiable" tag. It works.
- **PLAN-013 wrap-up lesson #2:** Trap-closure verification took two consecutive auto-builds (v0.7.2 + v0.7.3) before the runbook §9 update was warranted. Single observations of a previously-failing flow are necessary but not sufficient for declaring it fixed in operator docs.
- **PLAN-013 wrap-up lesson #3:** §3.1's "real fix lean" predictions are roughly right but not always complete. §3.1 #1's "the per-spec invocation can collapse back to a single call" turned out to be true for 5 specs but false for 2 (chapter-state pair). The lean was a useful starting point; the agent + the next coordinator cycle refined it.

## What you do tomorrow

1. **Read this handoff + the cold-start files.**
2. **Check open PRs.** Expected: this coordinator-cycle PR if not yet merged; possibly the v0.7.3 release-please PR; possibly a v0.7.4 release-please PR if PR #36's `fix(e2e):` triggered one.
3. **Tell the user you're back in role.**
4. **Wait for user signal.** Most likely paths:
   - **(a) "Deploy v0.7.3 (or v0.7.4) to haynes-ops"** — refresh prompt 035 if the target tag has bumped; spawn developer agent.
   - **(b) "Author PLAN-017 (pre-beta validation plan)"** — doc-only authoring task; ~30-45 min of your time. Authors gates that RUN against the live instance after deploy.
   - **(c) "Run the click-through gates myself; here's what I found"** — user reports back from live testing. Triage findings: which are bugs (`fix:` PR), which are product gaps (new PRD), which are launch blockers vs. polish.
   - **(d) "Start a new product feature"** — invite-email delivery / audit-log polish / tipping flow / something fresh from the click-through. Author PRD/plan/prompts.
5. **Write fresh handoff `015-...md` after the next cycle closes.**

## What's in this cycle's PR

Branch: `coordinator-cycle-mvp-wrap-up-handoff-014`. Files:

- `docs/plans/013-live-instance-ops-implementation.md` — §3.1 updates (close #2, #3, #9, #10; partial-close + amend #1; add #10 entry); §10 changelog entry.
- `docs/ops/runbook.md` — §9 banner: TRAP RESOLVED; PAT details + last-verified line bumped.
- `.agents/prompts/033-execute-test-infra-hardening.md` — committed (was on disk; ran by PR #35).
- `.agents/prompts/034-execute-signin-glob-fix-and-collapse.md` — committed (was on disk; ran by PR #36).
- `.agents/prompts/035-deploy-v0.7.3-to-haynes-ops.md` — new; derived from prompt 032 with tag bumps + 4-version bundle commit-body.
- `.agents/context/014-coordinator-handoff-2026-05-18-mvp-wrap-up.md` — this file.

Docs-only; no code touched. release-please will not bump (all `docs:` / `chore:`).

## Quick reference

| Need | Path |
|---|---|
| User auto-memory | `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` |
| Coordinator profile | `.agents/profiles/coordinator.md` |
| Developer profile | `.agents/profiles/developer.md` |
| Coverage matrix | `docs/plans/COVERAGE.md` |
| Past handoffs | `.agents/context/00{1..14}-*.md` |
| Past prompts | `.agents/prompts/0{27..35}-*.md` (recent set) |
| Live instance | `https://todos-for-dues.haynesops.com` running v0.6.0 (v0.7.3 image in GHCR, deploy authorized but not yet executed) |
| GHCR latest | `ghcr.io/thaynes43/todos-for-dues:v0.7.3` (auto-built; `:latest` tracks it) |
| haynes-ops manifest | `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml` |
| PAT secret name | `RELEASE_PLEASE_PAT` (verified working) |
| Runbook | `docs/ops/runbook.md` (10 sections; §9 banner-marked RESOLVED) |

---

**Begin.** Read the cold-start files. Tell the user you're back in role + that the MVP wrap-up is done + that the deploy queue is ready (prompt 035) and awaits their authorization.
