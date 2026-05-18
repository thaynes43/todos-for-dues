# Coordinator self-handoff — 2026-05-18 early hours (PAT wired, deploy paused, queue documented)

> **You are reading a handoff to yourself.** Cold-start context. **The immediate situation: PAT for release-please is wired; v0.7.1 image is in GHCR; deploy is intentionally PAUSED per user direction ("can we do those things before we deploy anything?"). The work queue is well-documented in this handoff + PLAN-013 §3.1.**

## Identity & role

Coordinator. Profile: `.agents/profiles/coordinator.md`. No production code; PR + squash-merge.

## Project at a glance

**TODOs for Dues** — per-chapter SaaS. Live at `https://todos-for-dues.haynesops.com` running **v0.6.0**. v0.7.0 + v0.7.1 cut but **not yet deployed**. Tech: Next.js 16 + tRPC + Drizzle + Postgres 16 + Better Auth + Resend + shadcn/ui + Playwright; self-hosted on `haynes-ops`.

## What you MUST read on cold start (in order)

1. `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md`
2. `.agents/profiles/coordinator.md`
3. `CLAUDE.md`
4. `docs/plans/COVERAGE.md`
5. `git log --first-parent main --oneline -25` + `gh pr list --state open`
6. **The most-recent prompts:** `.agents/prompts/030-execute-plan-013.md` + `.agents/prompts/031-validate-plan-013.md` + `.agents/prompts/032-deploy-v0.7.0-to-haynes-ops.md`
7. **PLAN-013 §3.1** — the 9 architecture follow-ups (the bulk of the queue).
8. **Prior handoffs:** `.agents/context/00{8..12}-*.md` (skim).

## Current state (snapshot at end of 2026-05-18 early hours)

### Plans live ✅ on main

- **PLAN-001..014** — all merged. v0.6.0 live in production.
- **PLAN-013** — merged (PR #27 + iter-2 follow-ups + PR #28 docs + PR #30 hybrid-trigger fix + PR #31 PAT wiring).

### Today's release cadence (manual recoveries chronicled)

| Tag | Cause | GHCR landing |
|---|---|---|
| v0.3.0..v0.4.0 | Released, never built (GITHUB_TOKEN trap, no recovery path landed pre-deploy) | Image absent; cosmetic-only gap (we jumped past these) |
| v0.5.0 | Manual `git push` tag re-push from user context | landed |
| v0.6.0 | Manual `git push` tag re-push | landed |
| v0.7.0 | Confirmed `release.published` from GITHUB_TOKEN is ALSO suppressed; recovered via `gh release delete + gh release create` from user context | landed |
| v0.7.1 | Manual `git push` tag re-push (PR #30 hybrid trigger restored the path) | landed |
| **v0.8.0+** (predicted) | **PAT wired in PR #31** — should auto-build without manual intervention. Next release is the verification opportunity. | (test point) |

### Open PRs (verify on cold start)

`gh pr list --state open --limit 5`. Expected: just this cycle's PR (handoff 013 + deploy prompt commit), if not yet merged.

### Deploy posture

**INTENTIONALLY PAUSED.** Per user direction post-v0.7.1: "Can we do those things before we deploy anything?" Queue items A (no version bump) + B (bundle into next deploy) clearly laid out in the prior conversation. No deploy until user explicitly authorizes.

**v0.7.1 image is in GHCR** — ready whenever the user says go. Deploy prompt at `.agents/prompts/032-deploy-v0.7.0-to-haynes-ops.md` is **labeled v0.7.0** but the procedure is the same for v0.7.1 (substitute the tag in the YAML diff; runtime identical between v0.7.0 and v0.7.1). When the user decides to deploy, either edit 032 inline or write fresh `033-deploy-vX.Y.Z-to-haynes-ops.md` with the bundled target tag.

### Cross-plan invariants (the live list)

All green per PR #27's report (15 invariants spanning PLAN-002 / 003 / 005 / 006 / 007 / 008 / 010 / 011 / 012 / 014 / lazy-Proxy / typecheck / lint / Vitest / Playwright). PLAN-013 itself is now part of this list.

## The queue (forward-looking dev work)

Two interpretations of "next work": **non-deploy items that land independently** vs. **feature items that bundle into the next deploy**. The user wants to do non-deploy items first.

### A — Independent (does NOT bump version OR runtime; lands any order)

1. **Test-infra hardening (candidate PLAN-016).** Closes PLAN-013 §3.1 #1 + #2 + #3:
   - Scope-narrow `roles/support.ts:demoteAllOtherAdmins` to per-spec ID allowlist → kills the cross-spec admin clobber.
   - Self-filter `admin/invites.spec.ts:24` count assertion by description prefix → kills the cross-suite count race.
   - Optionally: evaluate `fullyParallel: false` for `e2e/admin/`.
   - **Outcome:** `e2e.yml` per-suite invocation workaround collapses to one `pnpm e2e` call → saves 3-5 min of CI wall time → unblocks flipping `e2e` to required-status-check after 2 weeks of green.
   - Estimate: ~15 min coordinator (plan+prompt) + ~30-60 min agent execute + ~15-30 min validate. ~1-2 hours clock.

2. **Pre-beta validation plan (candidate PLAN-017).** Pure coordinator doc work — no implementation. Codifies the 3 user-driven gates DEFERRED at PLAN-009 close (walking-skeleton live click-through; treasurer email delivery; SSO bootstrap-admin live click-through). Gates RUN against the live instance after a deploy; this work AUTHORS the gates. Estimate: ~30-45 min coordinator.

3. **`RESEND_FROM_ADDRESS` → `instrumentation.ts` hook** (§3.1 #6). ~20-line refactor in `packages/notifications/`. `refactor:` or `fix:` prefix. Estimate: 1 hour total.

4. **`/api/health` Vitest mock helper** (§3.1 #7). Small `apps/web/__tests__/helpers/` addition. Estimate: 30 min.

5. **`bootstrap-admin.spec.ts` reshape** (PLAN-008 legacy skip). Test code only; no production change. Low priority.

6. **PLAN-015 — Observability** (Grafana dashboards + alerts via MCP). No SaaS repo change. Author when observability gap pinches.

7. **`enforce_admins: true` flip** on `main` branch protection. One-shot coordinator action; ~30 sec.

### B — Code features (bundle into next deploy)

8. **Email delivery of invite URLs.** PRD-003 §10 / PLAN-014 §6 backlog. Resend template + `invites.send` procedure + UI flow. ~2-3 hours total including PRD update.

9. **`/admin/audit-log` UX polish** — actor/text search if launch chapter asks. PRD-007 §7.1 explicit defer; revisit on demand.

10. **Tipping flow** — PRD-005 §7 placeholder. `<TippingNudge />` already in `JobDetailView` but the actual flow isn't built. ~4-5 hours.

### C — Deploy (when bundle is ready)

11. **Deploy** v0.7.1 (or whatever's bundled). Single haynes-ops PR: 1-line YAML image tag + 3-line readiness/liveness/startup probe path `/` → `/api/health` per §3.1 follow-up. ~15 min user time + ~10-15 min agent time.

12. **Run pre-beta validation gates** (PLAN-017 once authored) against the freshly-deployed instance. Hours-of-user-time if all 3 gates need real click-through + email-delivery wait.

## Coordinator lessons (accumulating)

- **PLAN-009..014 lessons** carry forward.
- **PLAN-013 lesson #1 — Subagent A's unverified hypothesis cost a full iteration.** "release: types: [published] fires regardless of GITHUB_TOKEN" was Subagent A's training-data assumption, never empirically tested in the agent's sandbox. We deployed it as the headline fix; v0.7.0 release revealed it's wrong. PLAN-013 §7 Risk 1 had explicitly anticipated this possibility. **Lesson:** when an agent flags an assumption as "I couldn't fetch the canonical docs", the validator gate must run the synthetic verification BEFORE the work ships, not after. Going forward: include "test the assumption empirically (or escalate)" in execute prompts for unproven trigger-swaps.
- **PLAN-013 lesson #2 — Iteration scope discipline.** Iteration 2 (advisory-green push) was the right discipline — the user asked for "iterate to green, don't sleep" and the agent did exactly that without scope creep. Surfaced 8 follow-ups properly tracked, didn't try to fix all of them inline.
- **PLAN-013 lesson #3 — The "release-event swap" pattern is dead.** Don't propose it again as a fix to the GITHUB_TOKEN-trap. The actual fix is the PAT (PR #31, landed today) or a GitHub App. Document this in the runbook.

## What you do tomorrow

1. **Read this handoff + the cold-start files.**
2. **Check open PRs.** Expected: this cycle PR if not yet merged + possibly downstream work the user has spawned overnight.
3. **Tell the user you're back in role.**
4. **Wait for user signal.** Most likely paths:
   - **(a) "Run test-infra hardening (PLAN-016)"** — write the plan + execute prompt; let user spawn agent.
   - **(b) "Author pre-beta validation plan (PLAN-017)"** — doc-only authoring task; ~30-45 min of your time.
   - **(c) "Verify PAT works"** — if a `feat:` or `fix:` lands and release-please opens a new release PR, watch whether `build-image` fires automatically on merge. If it does → trap is truly dead. If not → escalate.
   - **(d) "Deploy v0.7.x now"** — refresh prompt 032 to the target tag, kick off developer agent.
   - **(e) "Pick one product feature"** (invite-email, audit-log polish, tipping) — author the PRD/plan/prompts.
5. **Write fresh handoff `014-...md` after the next cycle closes.**

## Outstanding low-priority items

- All 9 items in PLAN-013 §3.1 (8 from iter-2 + PAT which is now landed).
- `bootstrap-admin.spec.ts` test.skip reshape.
- v0.3.0 / v0.4.0 image backfill (cosmetic; not needed since we jumped to v0.5.0+).
- haynes-ops readiness/liveness probe path bump `/` → `/api/health` (lands in the v0.7.x deploy PR).
- Better Auth `auth-client` wiring (currently using `router.refresh()` per PLAN-012).
- `enforce_admins: true` flip.

## What's in this cycle's PR

Branch: `coordinator-cycle-pat-handoff-013`. Files:

- `.agents/prompts/032-deploy-v0.7.0-to-haynes-ops.md` — deploy prompt (already-on-disk; committing to git for traceability). Labeled v0.7.0 but applies to any v0.7.x with a tag substitution.
- `.agents/context/013-coordinator-handoff-2026-05-18-pat-wired-deploy-paused.md` — this file.

Docs-only; no code touched. release-please will not bump.

## Quick reference

| Need | Path |
|---|---|
| User auto-memory | `~/.claude/projects/-Users-thaynes-src-projects-todos-for-dues/memory/MEMORY.md` |
| Coordinator profile | `.agents/profiles/coordinator.md` |
| Developer profile | `.agents/profiles/developer.md` |
| Coverage matrix | `docs/plans/COVERAGE.md` |
| Past handoffs | `.agents/context/00{1..13}-*.md` |
| Past prompts | `.agents/prompts/NNN-*.md` |
| Live instance | `https://todos-for-dues.haynesops.com` running v0.6.0 |
| GHCR latest | `ghcr.io/thaynes43/todos-for-dues:v0.7.1` (built; awaiting deploy authorization) |
| haynes-ops manifest | `~/src/labspace/haynes-ops/kubernetes/main/apps/frontend/todos-for-dues/app/helmrelease.yaml` |
| PAT secret name | `RELEASE_PLEASE_PAT` (in repo secrets; release-please.yml consumes it) |
| Runbook | `docs/ops/runbook.md` (10 sections; §9 documents the GITHUB_TOKEN-trap fully) |

---

**Begin.** Read the cold-start files. Tell the user you're back in role + that the work queue is documented in this handoff + PLAN-013 §3.1. Await their priority signal.
